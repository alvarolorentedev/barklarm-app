use rand::RngCore;
use reqwest::header::{AUTHORIZATION, HeaderMap, HeaderValue};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use tokio::process::{Child, Command};

use super::manifest::ModelManifestEntry;
use super::{models_dir, runtime_dir};

const IDLE_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const STARTUP_TIMEOUT: Duration = Duration::from_secs(90);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeStatus {
    pub state: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub idle_timeout_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedEndpoint {
    pub endpoint: String,
    pub token: String,
    pub model: String,
}

struct ManagedRuntime {
    child: Child,
    endpoint: String,
    token: String,
    model_id: String,
    version: Option<String>,
    last_used: Instant,
    token_file: PathBuf,
    pid_file: PathBuf,
}

#[derive(Default)]
pub struct RuntimeState {
    runtime: Mutex<Option<ManagedRuntime>>,
}

fn target_supported() -> bool {
    matches!(
        (std::env::consts::OS, std::env::consts::ARCH),
        ("macos", "aarch64")
            | ("macos", "x86_64")
            | ("linux", "x86_64")
            | ("linux", "aarch64")
            | ("windows", "x86_64")
    )
}

fn candidate_paths(app: &AppHandle) -> Vec<PathBuf> {
    let mut paths = Vec::new();
    #[cfg(debug_assertions)]
    if let Ok(value) = std::env::var("BARKLARM_LLAMA_SERVER") {
        paths.push(PathBuf::from(value));
    }
    if let Ok(resource) = app.path().resource_dir() {
        paths.push(resource.join("llama-server"));
        paths.push(resource.join("binaries").join("llama-server"));
    }
    if let Ok(exe) = std::env::current_exe()
        && let Some(parent) = exe.parent()
    {
        paths.push(parent.join("llama-server"));
        paths.push(parent.join("binaries").join("llama-server"));
    }
    paths
}

fn resolve_binary(app: &AppHandle) -> Result<PathBuf, String> {
    for path in candidate_paths(app) {
        if path.is_file() {
            return Ok(path);
        }
        #[cfg(windows)]
        {
            let exe = path.with_extension("exe");
            if exe.is_file() {
                return Ok(exe);
            }
        }
    }
    Err("runtime_missing".to_string())
}

fn library_path(app: &AppHandle, binary: &Path) -> Option<PathBuf> {
    let parent = binary.parent()?;
    let mut candidates = Vec::new();
    if let Ok(resource) = app.path().resource_dir() {
        candidates.push(resource.join("binaries").join("llama-libs"));
        candidates.push(resource.join("llama-libs"));
    }
    candidates.push(parent.join("llama-libs"));
    candidates
        .into_iter()
        .find(|path| path.is_dir())
        .or_else(|| Some(parent.to_path_buf()))
}

fn free_port() -> Result<u16, String> {
    let listener =
        std::net::TcpListener::bind("127.0.0.1:0").map_err(|_| "port_unavailable".to_string())?;
    listener
        .local_addr()
        .map(|address| address.port())
        .map_err(|_| "port_unavailable".to_string())
}

fn runtime_args(
    model_path: &Path,
    port: u16,
    token_file: &Path,
    model_id: &str,
    context: u32,
    threads: usize,
) -> Vec<String> {
    vec![
        "--model".to_string(),
        model_path.to_string_lossy().to_string(),
        "--host".to_string(),
        "127.0.0.1".to_string(),
        "--port".to_string(),
        port.to_string(),
        "--api-key-file".to_string(),
        token_file.to_string_lossy().to_string(),
        "--ctx-size".to_string(),
        context.to_string(),
        "--threads".to_string(),
        threads.to_string(),
        "--parallel".to_string(),
        "1".to_string(),
        "--no-webui".to_string(),
        "--no-slots".to_string(),
        "--jinja".to_string(),
        "--alias".to_string(),
        model_id.to_string(),
        "--log-disable".to_string(),
    ]
}

fn token() -> String {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn write_token_file(path: &Path, token: &str) -> Result<(), String> {
    std::fs::write(path, token.as_bytes()).map_err(|_| "token_file".to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
            .map_err(|_| "token_file".to_string())?;
    }
    Ok(())
}

fn version_of(binary: &Path) -> Option<String> {
    let output = std::process::Command::new(binary)
        .arg("--version")
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&output.stdout);
    let line = text.lines().find(|line| !line.trim().is_empty())?;
    Some(line.trim().chars().take(120).collect())
}

async fn healthy(port: u16, token: &str) -> bool {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
    {
        Ok(client) => client,
        Err(_) => return false,
    };
    let mut headers = HeaderMap::new();
    if let Ok(value) = HeaderValue::from_str(&format!("Bearer {token}")) {
        headers.insert(AUTHORIZATION, value);
    }
    match client
        .get(format!("http://127.0.0.1:{port}/health"))
        .headers(headers)
        .send()
        .await
    {
        Ok(response) => response.status().is_success(),
        Err(_) => false,
    }
}

fn set_process_env(command: &mut Command, app: &AppHandle, binary: &Path) {
    if let Some(libs) = library_path(app, binary) {
        let key = if cfg!(target_os = "macos") {
            "DYLD_LIBRARY_PATH"
        } else if cfg!(target_os = "windows") {
            "PATH"
        } else {
            "LD_LIBRARY_PATH"
        };
        let existing = std::env::var_os(key).unwrap_or_default();
        let mut value = libs.into_os_string();
        if !existing.is_empty() {
            value.push(if cfg!(target_os = "windows") {
                ";"
            } else {
                ":"
            });
            value.push(existing);
        }
        command.env(key, value);
    }
}

fn cleanup_stale_marker(app: &AppHandle) {
    let Ok(dir) = runtime_dir(app) else {
        return;
    };
    let marker = dir.join("runtime.pid");
    let Ok(text) = std::fs::read_to_string(&marker) else {
        return;
    };
    let Ok(pid) = text.trim().parse::<u32>() else {
        let _ = std::fs::remove_file(&marker);
        return;
    };
    #[cfg(target_os = "macos")]
    let process_name_matches = |pid: u32| {
        let output = std::process::Command::new("ps")
            .args(["-p", &pid.to_string(), "-o", "command="])
            .output();
        output
            .ok()
            .map(|value| String::from_utf8_lossy(&value.stdout).contains("llama-server"))
            .unwrap_or(false)
    };
    #[cfg(target_os = "linux")]
    let process_name_matches = |pid: u32| {
        std::fs::read_to_string(format!("/proc/{pid}/cmdline"))
            .map(|value| value.contains("llama-server"))
            .unwrap_or(false)
    };
    #[cfg(target_os = "windows")]
    let process_name_matches = |pid: u32| {
        let output = std::process::Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"])
            .output();
        output
            .ok()
            .map(|value| {
                String::from_utf8_lossy(&value.stdout)
                    .to_lowercase()
                    .contains("llama-server")
            })
            .unwrap_or(false)
    };

    if process_name_matches(pid) && pid != std::process::id() {
        #[cfg(unix)]
        {
            let _ = std::process::Command::new("kill")
                .arg(pid.to_string())
                .status();
        }
        #[cfg(windows)]
        {
            let _ = std::process::Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/F"])
                .status();
        }
    }
    let _ = std::fs::remove_file(marker);
}

pub fn cleanup_stale(app: &AppHandle) {
    cleanup_stale_marker(app);
}

impl RuntimeState {
    pub async fn ensure(
        &self,
        app: &AppHandle,
        model: &ModelManifestEntry,
        requested_context: Option<u32>,
    ) -> Result<ManagedEndpoint, String> {
        if !target_supported() {
            return Err("unsupported_hardware".to_string());
        }
        {
            let mut runtime = self.runtime.lock().map_err(|_| "state_lock".to_string())?;
            if let Some(current) = runtime.as_mut() {
                match current.child.try_wait() {
                    Ok(None) => {
                        current.last_used = Instant::now();
                        return Ok(ManagedEndpoint {
                            endpoint: current.endpoint.clone(),
                            token: current.token.clone(),
                            model: current.model_id.clone(),
                        });
                    }
                    _ => {
                        *runtime = None;
                    }
                }
            }
        }

        let dir = models_dir(app)?;
        let model_path = dir.join(&model.file_name);
        if !model_path.exists() {
            return Err("model_missing".to_string());
        }
        if !super::download::is_verified(&model_path, model.size_bytes) {
            return Err("model_invalid".to_string());
        }
        let binary = resolve_binary(app)?;
        cleanup_stale_marker(app);
        let port = free_port()?;
        let ephemeral = token();
        let runtime_dir = runtime_dir(app)?;
        tokio::fs::create_dir_all(&runtime_dir)
            .await
            .map_err(|_| "runtime_directory".to_string())?;
        let token_file = runtime_dir.join(format!("token-{}", std::process::id()));
        write_token_file(&token_file, &ephemeral)?;

        let threads = std::thread::available_parallelism()
            .map(|value| value.get())
            .unwrap_or(4)
            .clamp(1, 8);
        let context = requested_context
            .unwrap_or(model.recommended_context)
            .clamp(2048, 16384);
        let mut command = Command::new(&binary);
        command.args(runtime_args(
            &model_path,
            port,
            &token_file,
            &model.id,
            context,
            threads,
        ));
        command
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .kill_on_drop(true);
        set_process_env(&mut command, app, &binary);
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000);
        }

        let mut child = command.spawn().map_err(|_| "runtime_start".to_string())?;
        let version = version_of(&binary);
        let started = Instant::now();
        let mut ready = false;
        while started.elapsed() < STARTUP_TIMEOUT {
            if let Ok(Some(_)) = child.try_wait() {
                break;
            }
            if healthy(port, &ephemeral).await {
                ready = true;
                break;
            }
            tokio::time::sleep(Duration::from_millis(500)).await;
        }
        if !ready {
            let _ = child.kill().await;
            let _ = tokio::fs::remove_file(&token_file).await;
            return Err("runtime_start_failed".to_string());
        }
        let _ = tokio::fs::remove_file(&token_file).await;
        let pid_file = runtime_dir.join("runtime.pid");
        let _ = std::fs::write(&pid_file, child.id().unwrap_or_default().to_string());

        let endpoint = ManagedEndpoint {
            endpoint: format!("http://127.0.0.1:{port}/v1"),
            token: ephemeral,
            model: model.id.clone(),
        };
        let mut runtime = self.runtime.lock().map_err(|_| "state_lock".to_string())?;
        *runtime = Some(ManagedRuntime {
            child,
            endpoint: endpoint.endpoint.clone(),
            token: endpoint.token.clone(),
            model_id: model.id.clone(),
            version,
            last_used: Instant::now(),
            token_file,
            pid_file,
        });
        Ok(endpoint)
    }

    pub async fn stop(&self) {
        let runtime = self
            .runtime
            .lock()
            .ok()
            .and_then(|mut runtime| runtime.take());
        if let Some(mut runtime) = runtime {
            let _ = runtime.child.kill().await;
            let _ = runtime.child.wait().await;
            let _ = tokio::fs::remove_file(&runtime.token_file).await;
            let _ = tokio::fs::remove_file(&runtime.pid_file).await;
        }
    }

    pub async fn reap_idle(&self) {
        let should_stop = {
            let mut runtime = match self.runtime.lock() {
                Ok(runtime) => runtime,
                Err(_) => return,
            };
            match runtime.as_mut() {
                Some(current) => {
                    if current.last_used.elapsed() > IDLE_TIMEOUT {
                        true
                    } else {
                        matches!(current.child.try_wait(), Ok(Some(_)) | Err(_))
                    }
                }
                None => false,
            }
        };
        if should_stop {
            self.stop().await;
        }
    }

    pub fn status(&self) -> RuntimeStatus {
        let Ok(mut runtime) = self.runtime.lock() else {
            return RuntimeStatus {
                state: "failed".to_string(),
                version: None,
                model_id: None,
                error: Some("state_lock".to_string()),
                idle_timeout_ms: Some(IDLE_TIMEOUT.as_millis() as u64),
            };
        };
        if let Some(current) = runtime.as_mut() {
            match current.child.try_wait() {
                Ok(None) => {
                    return RuntimeStatus {
                        state: "ready".to_string(),
                        version: current.version.clone(),
                        model_id: Some(current.model_id.clone()),
                        error: None,
                        idle_timeout_ms: Some(IDLE_TIMEOUT.as_millis() as u64),
                    };
                }
                _ => {
                    *runtime = None;
                    return RuntimeStatus {
                        state: "failed".to_string(),
                        version: None,
                        model_id: None,
                        error: Some("runtime_exited".to_string()),
                        idle_timeout_ms: Some(IDLE_TIMEOUT.as_millis() as u64),
                    };
                }
            }
        }
        RuntimeStatus {
            state: "stopped".to_string(),
            version: None,
            model_id: None,
            error: None,
            idle_timeout_ms: Some(IDLE_TIMEOUT.as_millis() as u64),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn arguments_are_an_explicit_loopback_allowlist() {
        let args = runtime_args(
            Path::new("/tmp/model.gguf"),
            12345,
            Path::new("/tmp/token"),
            "model-id",
            8192,
            4,
        );
        assert!(args.contains(&"--host".to_string()));
        assert!(args.contains(&"127.0.0.1".to_string()));
        assert!(args.contains(&"--no-webui".to_string()));
        assert!(!args.iter().any(|value| value.contains("0.0.0.0")));
        assert!(!args.iter().any(|value| value == "--api-key"));
        assert_eq!(args[args.len() - 1], "--log-disable");
    }

    #[test]
    fn free_port_is_loopback_only() {
        let port = free_port().expect("port");
        assert!(port > 0);
    }

    #[test]
    fn ephemeral_tokens_are_long_hex() {
        let first = token();
        let second = token();
        assert_eq!(first.len(), 64);
        assert!(first.chars().all(|value| value.is_ascii_hexdigit()));
        assert_ne!(first, second);
    }

    #[test]
    fn model_manifest_is_pinned() {
        let model = super::super::manifest::default_model().expect("manifest");
        assert_eq!(model.sha256.len(), 64);
        assert!(model.size_bytes > 1_000_000_000);
        assert_eq!(model.license, "Apache-2.0");
    }

    #[test]
    fn version_parser_handles_missing_binary() {
        assert!(version_of(Path::new("/definitely/not/llama-server")).is_none());
    }
}
