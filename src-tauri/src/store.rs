use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

const CONFIG_FILE: &str = "config.json";

fn app_data_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn home_dir(app: &AppHandle) -> PathBuf {
    app.path().home_dir().unwrap_or_else(|_| PathBuf::from("."))
}

fn target_dir(app: &AppHandle) -> PathBuf {
    let base = app_data_dir(app);
    let canary = base.join("canary");
    if cfg!(debug_assertions) || canary.join(CONFIG_FILE).exists() {
        canary
    } else {
        base
    }
}

fn target_path(app: &AppHandle) -> PathBuf {
    target_dir(app).join(CONFIG_FILE)
}

fn candidate_paths(app: &AppHandle) -> Vec<PathBuf> {
    let base = app_data_dir(app);
    let home = home_dir(app);
    #[allow(unused_mut)]
    let mut paths = vec![
        base.join("canary").join(CONFIG_FILE),
        base.join(CONFIG_FILE),
        home.join("Library")
            .join("Application Support")
            .join("barklarm")
            .join(CONFIG_FILE),
        home.join(".config").join("barklarm").join(CONFIG_FILE),
    ];

    #[cfg(target_os = "windows")]
    if let Ok(app_data) = std::env::var("APPDATA") {
        paths.push(PathBuf::from(app_data).join("barklarm").join(CONFIG_FILE));
    }

    paths
}

fn read_json_object(path: &Path) -> Option<Value> {
    let data = fs::read_to_string(path).ok()?;
    let value: Value = serde_json::from_str(&data).ok()?;
    value.is_object().then_some(value)
}

fn migrate_if_needed(app: &AppHandle) -> PathBuf {
    let target = target_path(app);
    if target.exists() {
        return target;
    }

    if let Some(source) = candidate_paths(app)
        .into_iter()
        .find(|path| path.exists() && *path != target)
    {
        if let Some(parent) = target.parent() {
            let _ = fs::create_dir_all(parent);
        }
        if fs::copy(&source, &target).is_ok() {
            return target;
        }
    }

    target
}

fn load_value(app: &AppHandle) -> Value {
    let path = migrate_if_needed(app);
    read_json_object(&path).unwrap_or_else(|| Value::Object(Default::default()))
}

fn write_value(app: &AppHandle, value: &Value) -> Result<(), String> {
    let target = target_path(app);
    let parent = target
        .parent()
        .ok_or_else(|| "config path has no parent".to_string())?;
    fs::create_dir_all(parent).map_err(|error| error.to_string())?;

    let temporary = target.with_extension("json.tmp");
    let data = serde_json::to_vec_pretty(value).map_err(|error| error.to_string())?;
    fs::write(&temporary, data).map_err(|error| error.to_string())?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&temporary, fs::Permissions::from_mode(0o600));
    }

    fs::rename(&temporary, &target).map_err(|error| error.to_string())
}

#[tauri::command]
pub fn load_config(app: AppHandle) -> Result<Value, String> {
    Ok(load_value(&app))
}

#[tauri::command]
pub fn save_config(app: AppHandle, config: Value) -> Result<(), String> {
    if !config.is_object() {
        return Err("config must be a JSON object".to_string());
    }
    write_value(&app, &config)
}

/// Imported configuration is data, not consent. Disable intelligence in the
/// same write so a crash cannot leave an imported mode active.
fn disable_imported_intelligence(value: &mut Value) {
    if let Some(object) = value.as_object_mut() {
        object.insert(
            "intelligenceMode".to_string(),
            Value::String("disabled".to_string()),
        );
    }
}

#[tauri::command]
pub fn import_config(app: AppHandle, path: String) -> Result<bool, String> {
    let mut value = match read_json_object(Path::new(&path)) {
        Some(value) => value,
        None => return Ok(false),
    };
    disable_imported_intelligence(&mut value);
    write_value(&app, &value)?;
    Ok(true)
}

#[tauri::command]
pub fn export_config(app: AppHandle, path: String) -> Result<bool, String> {
    let value = load_value(&app);
    let data = serde_json::to_vec_pretty(&value).map_err(|error| error.to_string())?;
    fs::write(path, data).map_err(|error| error.to_string())?;
    Ok(true)
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_file(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("barklarm-{name}-{suffix}.json"))
    }

    #[test]
    fn imported_configuration_cannot_enable_inference() {
        let mut value = serde_json::json!({
            "intelligenceMode": "custom",
            "intelligenceProvider": { "endpoint": "https://example.test/v1" }
        });
        disable_imported_intelligence(&mut value);
        assert_eq!(value["intelligenceMode"], "disabled");
        assert_eq!(
            value["intelligenceProvider"]["endpoint"],
            "https://example.test/v1"
        );
    }

    #[test]
    fn reads_object_configs_only() {
        let object_path = temporary_file("object");
        fs::write(&object_path, r#"{"refreshInterval":120000}"#).unwrap();
        assert_eq!(
            read_json_object(&object_path).unwrap()["refreshInterval"],
            120000
        );
        fs::remove_file(object_path).unwrap();

        let array_path = temporary_file("array");
        fs::write(&array_path, r#"["not","an","object"]"#).unwrap();
        assert!(read_json_object(&array_path).is_none());
        fs::remove_file(array_path).unwrap();
    }
}
