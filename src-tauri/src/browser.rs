use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Browser {
    pub id: String,
    pub name: String,
}

fn normalize_browsers(mut browsers: Vec<Browser>) -> Vec<Browser> {
    let mut seen = std::collections::HashSet::new();
    browsers.retain(|browser| !browser.id.is_empty() && seen.insert(browser.id.clone()));
    browsers.sort_by(|a, b| {
        a.name
            .to_lowercase()
            .cmp(&b.name.to_lowercase())
            .then_with(|| a.id.cmp(&b.id))
    });
    browsers
}

fn web_url(url: &str) -> Result<String, String> {
    let parsed = tauri::Url::parse(url).map_err(|_| "invalid url".to_string())?;
    match parsed.scheme() {
        "http" | "https" => Ok(parsed.to_string()),
        _ => Err("only http and https urls can be opened".to_string()),
    }
}

#[tauri::command]
pub fn list_browsers() -> Vec<Browser> {
    normalize_browsers(platform::browsers())
}

/// The renderer may only launch a browser that is currently installed; the id
/// is never treated as an arbitrary program path.
#[tauri::command]
pub fn open_with_browser(url: String, browser: String) -> Result<(), String> {
    let url = web_url(&url)?;
    if browser.trim().is_empty() {
        return Err("no browser selected".to_string());
    }
    if !platform::browsers()
        .iter()
        .any(|candidate| candidate.id == browser)
    {
        return Err("the selected browser is no longer available".to_string());
    }
    platform::launch(&url, &browser)
}

#[cfg(any(target_os = "macos", target_os = "windows"))]
fn spawn_and_reap(mut command: std::process::Command) -> Result<(), String> {
    let mut child = command.spawn().map_err(|error| error.to_string())?;
    std::thread::spawn(move || {
        let _ = child.wait();
    });
    Ok(())
}

#[cfg(any(target_os = "macos", test))]
fn name_from_app_path(path: &str, fallback: &str) -> String {
    std::path::Path::new(path)
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_else(|| fallback.to_string())
}

/// Browsers register a quoted executable in `shell\open\command`; fall back to
/// the first token for unquoted registrations.
#[cfg(any(target_os = "windows", test))]
fn executable_from_command(command: &str) -> &str {
    let command = command.trim();
    if let Some(rest) = command.strip_prefix('"') {
        return rest.split('"').next().unwrap_or_default();
    }
    command.split_whitespace().next().unwrap_or_default()
}

#[cfg(target_os = "macos")]
mod platform {
    use super::{Browser, name_from_app_path, spawn_and_reap};
    use objc2_core_foundation::{CFArray, CFRetained, CFString, CFURL, CFURLPathStyle};
    #[allow(deprecated)]
    use objc2_core_services::{
        LSCopyAllHandlersForURLScheme, LSCopyApplicationURLsForBundleIdentifier,
    };
    use std::process::Command;

    #[allow(deprecated)]
    pub(crate) fn browsers() -> Vec<Browser> {
        let scheme = CFString::from_str("https");
        let Some(handlers) = (unsafe { LSCopyAllHandlersForURLScheme(&scheme) }) else {
            return Vec::new();
        };
        let handlers: CFRetained<CFArray<CFString>> =
            unsafe { CFRetained::cast_unchecked(handlers) };

        let mut browsers = Vec::new();
        for bundle_id in handlers.iter() {
            let id = bundle_id.to_string();
            let Some(urls) = (unsafe {
                LSCopyApplicationURLsForBundleIdentifier(&bundle_id, std::ptr::null_mut())
            }) else {
                continue;
            };
            let urls: CFRetained<CFArray<CFURL>> = unsafe { CFRetained::cast_unchecked(urls) };
            let Some(app) = urls.iter().next() else {
                continue;
            };
            let name = app
                .file_system_path(CFURLPathStyle::CFURLPOSIXPathStyle)
                .map(|path| name_from_app_path(&path.to_string(), &id))
                .unwrap_or_else(|| id.clone());
            browsers.push(Browser { id, name });
        }
        browsers
    }

    pub(crate) fn launch(url: &str, id: &str) -> Result<(), String> {
        let mut command = Command::new("/usr/bin/open");
        command.args(["-b", id, "--", url]);
        spawn_and_reap(command)
    }
}

#[cfg(target_os = "windows")]
mod platform {
    use super::{Browser, executable_from_command, spawn_and_reap};
    use std::process::Command;
    use windows_registry::{CURRENT_USER, LOCAL_MACHINE};

    const BROWSERS_KEY: &str = r"Software\Clients\StartMenuInternet";

    pub(crate) fn browsers() -> Vec<Browser> {
        let mut browsers = Vec::new();
        for hive in [LOCAL_MACHINE, CURRENT_USER] {
            let Ok(base) = hive.open(BROWSERS_KEY) else {
                continue;
            };
            let Ok(keys) = base.keys() else {
                continue;
            };
            for key_name in keys {
                let Ok(entry) = base.open(&key_name) else {
                    continue;
                };
                let name = entry.get_string("").unwrap_or_else(|_| key_name.clone());
                let Ok(command) = entry
                    .open(r"shell\open\command")
                    .and_then(|command| command.get_string(""))
                else {
                    continue;
                };
                let executable = executable_from_command(&command);
                if executable.is_empty() {
                    continue;
                }
                browsers.push(Browser {
                    id: executable.to_string(),
                    name,
                });
            }
        }
        browsers
    }

    pub(crate) fn launch(url: &str, id: &str) -> Result<(), String> {
        let mut command = Command::new(id);
        command.arg(url);
        spawn_and_reap(command)
    }
}

#[cfg(target_os = "linux")]
mod platform {
    use super::Browser;
    use gio::prelude::*;

    const CONTENT_TYPE: &str = "x-scheme-handler/https";

    pub(crate) fn browsers() -> Vec<Browser> {
        gio::AppInfo::all_for_type(CONTENT_TYPE)
            .into_iter()
            .filter(|info| info.should_show())
            .filter_map(|info| {
                Some(Browser {
                    id: info.id()?.to_string(),
                    name: info.name().to_string(),
                })
            })
            .collect()
    }

    pub(crate) fn launch(url: &str, id: &str) -> Result<(), String> {
        let info = gio::AppInfo::all_for_type(CONTENT_TYPE)
            .into_iter()
            .find(|info| info.id().as_ref().is_some_and(|value| value.as_str() == id))
            .ok_or_else(|| "the selected browser is no longer available".to_string())?;
        info.launch_uris(&[url], None::<&gio::AppLaunchContext>)
            .map_err(|error| error.to_string())
    }
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
mod platform {
    use super::Browser;

    pub(crate) fn browsers() -> Vec<Browser> {
        Vec::new()
    }

    pub(crate) fn launch(_url: &str, _id: &str) -> Result<(), String> {
        Err("browser selection is unsupported on this platform".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn browser(id: &str, name: &str) -> Browser {
        Browser {
            id: id.to_string(),
            name: name.to_string(),
        }
    }

    #[test]
    fn deduplicates_and_sorts_browsers_by_name() {
        let browsers = normalize_browsers(vec![
            browser("2", "zed"),
            browser("1", "Alpha"),
            browser("1", "Duplicate"),
        ]);

        assert_eq!(browsers, vec![browser("1", "Alpha"), browser("2", "zed")]);
    }

    #[test]
    fn accepts_only_web_urls() {
        assert_eq!(
            web_url("https://ci.example.test/build/1").unwrap(),
            "https://ci.example.test/build/1"
        );
        assert!(web_url("http://ci.example.test").is_ok());
        assert!(web_url("file:///etc/passwd").is_err());
        assert!(web_url("javascript:alert(1)").is_err());
        assert!(web_url("not a url").is_err());
    }

    #[test]
    fn extracts_the_executable_from_browser_commands() {
        assert_eq!(
            executable_from_command(
                r#""C:\Program Files\Google\Chrome\Application\chrome.exe" --single-argument %1"#
            ),
            r"C:\Program Files\Google\Chrome\Application\chrome.exe"
        );
        assert_eq!(executable_from_command(r"firefox.exe %1"), "firefox.exe");
        assert_eq!(executable_from_command(""), "");
    }

    #[test]
    fn refuses_to_launch_an_unknown_browser() {
        let error = open_with_browser(
            "https://ci.example.test/build/1".to_string(),
            "not-a-real-browser".to_string(),
        )
        .unwrap_err();
        assert_eq!(error, "the selected browser is no longer available");
        assert!(open_with_browser("file:///etc/passwd".to_string(), "safari".to_string()).is_err());
    }

    #[test]
    fn derives_a_display_name_from_the_app_bundle() {
        assert_eq!(
            name_from_app_path("/Applications/Google Chrome.app", "com.google.Chrome"),
            "Google Chrome"
        );
        assert_eq!(
            name_from_app_path("", "com.apple.Safari"),
            "com.apple.Safari"
        );
    }

    #[test]
    #[ignore = "requires a macOS desktop session"]
    fn lists_installed_handlers() {
        let browsers = list_browsers();
        println!("{browsers:#?}");
        assert!(!browsers.is_empty());
    }
}
