use rand::RngCore;
use reqwest::header::{AUTHORIZATION, HeaderMap, HeaderValue};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Manager};
use tokio::process::{Child, Command};

use super::manifest::ModelManifestEntry;
use super::{models_dir, runtime_dir};

const IDLE_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const STARTUP_ATTEMPT_TIMEOUT: Duration = Duration::from_secs(45);
const START_ATTEMPTS: usize = 3;
const FAILURE_BACKOFF: Duration = Duration::from_secs(30);
const ACTIVE_LEASE: Duration = Duration::from_secs(10 * 60);
const MAX_CONTEXT: u32 = 16384;
const MIN_CONTEXT: u32 = 2048;

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

impl RuntimeStatus {
    fn new(state: &str, error: Option<String>) -> Self {
        Self {
            state: state.to_string(),
            version: None,
            model_id: None,
            error,
            idle_timeout_ms: Some(IDLE_TIMEOUT.as_millis() as u64),
        }
    }
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
    context: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeMarker {
    pid: u32,
    start_identity: String,
    executable: String,
    instance: String,
    owner_pid: u32,
    owner_identity: String,
}

pub struct RuntimeState {
    operation: tokio::sync::Mutex<()>,
    runtime: Mutex<Option<ManagedRuntime>>,
    status: Mutex<RuntimeStatus>,
    epoch: AtomicU64,
    active: AtomicUsize,
    active_since: Mutex<Option<Instant>>,
    failure: Mutex<Option<(String, Instant)>>,
    verified: Mutex<Option<(PathBuf, u64, u64)>>,
    hash_cancel: std::sync::Arc<AtomicBool>,
}

impl Default for RuntimeState {
    fn default() -> Self {
        Self {
            operation: tokio::sync::Mutex::new(()),
            runtime: Mutex::new(None),
            status: Mutex::new(RuntimeStatus::new("stopped", None)),
            epoch: AtomicU64::new(0),
            active: AtomicUsize::new(0),
            active_since: Mutex::new(None),
            failure: Mutex::new(None),
            verified: Mutex::new(None),
            hash_cancel: std::sync::Arc::new(AtomicBool::new(false)),
        }
    }
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

fn context_size(requested: Option<u32>, model: &ModelManifestEntry) -> u32 {
    requested
        .unwrap_or(model.recommended_context)
        .clamp(MIN_CONTEXT, MAX_CONTEXT)
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

fn instance_id() -> String {
    let mut bytes = [0u8; 16];
    rand::rng().fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn write_token_file(path: &Path, token: &str) -> Result<(), String> {
    use std::io::Write;
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options.open(path).map_err(|_| "token_file".to_string())?;
    file.write_all(token.as_bytes())
        .map_err(|_| "token_file".to_string())?;
    file.sync_all().map_err(|_| "token_file".to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))
            .map_err(|_| "token_file".to_string())?;
    }
    Ok(())
}

fn version_of(binary: &Path) -> Option<String> {
    let path = binary.to_path_buf();
    let (sender, receiver) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        let result = std::process::Command::new(&path)
            .arg("--version")
            .output()
            .ok()
            .and_then(|output| {
                let text = String::from_utf8_lossy(&output.stdout);
                text.lines()
                    .find(|line| !line.trim().is_empty())
                    .map(|line| line.trim().chars().take(120).collect::<String>())
            });
        let _ = sender.send(result);
    });
    receiver.recv_timeout(Duration::from_secs(5)).ok().flatten()
}

#[cfg(any(test, target_os = "linux"))]
fn parse_linux_stat(value: &str) -> Option<String> {
    // /proc/<pid>/stat: comm may contain spaces and parentheses; fields after
    // the final ')' are positional. starttime is field 22 overall (4th after
    // state), i.e. index 19 of the tail.
    let tail = value.rsplit_once(')')?.1;
    tail.split_whitespace().nth(19).map(str::to_string)
}

#[cfg(any(test, target_os = "windows"))]
fn parse_wmic_identity(value: &str) -> Option<String> {
    let mut created = None;
    let mut path = None;
    for line in value.lines() {
        let line = line.trim();
        if let Some(value) = line.strip_prefix("CreationDate=") {
            created = Some(value.trim().to_string());
        }
        if let Some(value) = line.strip_prefix("ExecutablePath=") {
            path = Some(value.trim().to_string());
        }
    }
    match (created, path) {
        (Some(created), Some(path)) if !created.is_empty() && !path.is_empty() => {
            Some(format!("{created}|{path}"))
        }
        _ => None,
    }
}

fn process_identity(pid: u32) -> Option<String> {
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("ps")
            .args(["-p", &pid.to_string(), "-o", "lstart=,comm="])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
        (!text.is_empty()).then_some(text)
    }
    #[cfg(target_os = "linux")]
    {
        let stat = std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?;
        let start = parse_linux_stat(&stat)?;
        let executable = std::fs::read_link(format!("/proc/{pid}/exe"))
            .ok()
            .map(|path| path.to_string_lossy().to_string())
            .unwrap_or_default();
        Some(format!("{start}|{executable}"))
    }
    #[cfg(target_os = "windows")]
    {
        use sysinfo::{Pid, ProcessesToUpdate, System};
        let target = Pid::from_u32(pid);
        let mut system = System::new().ok()?;
        system.refresh_processes(ProcessesToUpdate::Some(&[target]), true);
        if let Some(process) = system.process(target) {
            let executable = process
                .exe()
                .map(|path| path.to_string_lossy().to_string())
                .unwrap_or_default();
            if !executable.is_empty() {
                return Some(format!("{}|{executable}", process.start_time()));
            }
        }
        // Windows 11 24H2+ may not ship wmic; sysinfo is the primary path.
        let output = std::process::Command::new("wmic")
            .args([
                "process",
                "where",
                &format!("processid={pid}"),
                "get",
                "CreationDate,ExecutablePath",
                "/format:list",
            ])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        parse_wmic_identity(&String::from_utf8_lossy(&output.stdout))
    }
}

fn canonical(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn cleanup_is_authorized(
    marker: &RuntimeMarker,
    resolved_binary: &Path,
    owner_alive: bool,
    target_identity: Option<&str>,
) -> bool {
    if marker.pid == 0 || marker.pid == std::process::id() || owner_alive {
        return false;
    }
    if marker.start_identity.is_empty() || marker.executable.is_empty() {
        return false;
    }
    if canonical(Path::new(&marker.executable)) != canonical(resolved_binary) {
        return false;
    }
    target_identity
        .map(|value| value == marker.start_identity)
        .unwrap_or(false)
}

fn process_exists(pid: u32) -> Option<bool> {
    #[cfg(unix)]
    {
        let status = std::process::Command::new("kill")
            .args(["-0", &pid.to_string()])
            .status()
            .ok()?;
        Some(status.success())
    }
    #[cfg(windows)]
    {
        let output = std::process::Command::new("tasklist")
            .args(["/FI", &format!("PID eq {pid}"), "/FO", "CSV", "/NH"])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&output.stdout);
        Some(text.to_lowercase().contains(&format!("\"{pid}\"")))
    }
}

fn owner_still_running(marker: &RuntimeMarker) -> bool {
    if marker.owner_pid == 0 || marker.owner_pid == std::process::id() {
        return false;
    }
    match process_identity(marker.owner_pid) {
        Some(_identity) if marker.owner_identity.is_empty() => true,
        Some(identity) => identity == marker.owner_identity,
        // Do not treat an unreadable identity as proof the owner is dead.
        None => !matches!(process_exists(marker.owner_pid), Some(false)),
    }
}

fn cleanup_stale_marker(app: &AppHandle, marker_path: &Path) {
    let Ok(text) = std::fs::read_to_string(marker_path) else {
        return;
    };
    let Ok(marker) = serde_json::from_str::<RuntimeMarker>(&text) else {
        let _ = std::fs::remove_file(marker_path);
        return;
    };
    let Ok(binary) = resolve_binary(app) else {
        let _ = std::fs::remove_file(marker_path);
        return;
    };
    let owner_alive = owner_still_running(&marker);
    if owner_alive {
        // Another live Barklarm instance owns this marker. Leave it intact.
        return;
    }
    let target_identity = process_identity(marker.pid);
    if !cleanup_is_authorized(&marker, &binary, false, target_identity.as_deref()) {
        // Never signal a PID whose identity no longer matches the marker.
        let _ = std::fs::remove_file(marker_path);
        return;
    }
    #[cfg(unix)]
    {
        let _ = std::process::Command::new("kill")
            .arg(marker.pid.to_string())
            .status();
    }
    #[cfg(windows)]
    {
        let _ = std::process::Command::new("taskkill")
            .args(["/PID", &marker.pid.to_string(), "/F"])
            .status();
    }
    let _ = std::fs::remove_file(marker_path);
}

fn cleanup_markers(app: &AppHandle) {
    let Ok(dir) = runtime_dir(app) else {
        return;
    };
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with("runtime") && name.ends_with(".pid") {
            cleanup_stale_marker(app, &path);
        } else if name.starts_with("token-")
            && std::fs::metadata(&path)
                .and_then(|metadata| metadata.modified())
                .ok()
                .and_then(|modified| modified.elapsed().ok())
                .map(|age| age > Duration::from_secs(60 * 60))
                .unwrap_or(false)
        {
            // Only old abandoned token files; a concurrent instance may still
            // be starting with a fresh token.
            let _ = std::fs::remove_file(&path);
        }
    }
}

fn write_marker(path: &Path, marker: &RuntimeMarker) {
    let Ok(data) = serde_json::to_vec_pretty(marker) else {
        return;
    };
    let temporary = path.with_extension("pid.tmp");
    if std::fs::write(&temporary, data).is_ok() {
        let _ = std::fs::rename(&temporary, path);
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
    // Managed inference is loopback-only and must not inherit a system proxy.
    let mut no_proxy = String::from("127.0.0.1,localhost,::1");
    if let Ok(existing) = std::env::var("NO_PROXY")
        && !existing.is_empty()
    {
        no_proxy.push(',');
        no_proxy.push_str(&existing);
    }
    command.env("NO_PROXY", &no_proxy);
    command.env("no_proxy", &no_proxy);
    for key in [
        "HTTP_PROXY",
        "HTTPS_PROXY",
        "ALL_PROXY",
        "http_proxy",
        "https_proxy",
        "all_proxy",
    ] {
        command.env_remove(key);
    }
}

fn listener_owned_by(port: u16, pid: u32) -> Option<bool> {
    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("lsof")
            .args(["-nP", &format!("-iTCP:{port}"), "-sTCP:LISTEN", "-t"])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let pids = String::from_utf8_lossy(&output.stdout);
        Some(
            pids.lines()
                .filter_map(|line| line.trim().parse::<u32>().ok())
                .any(|value| value == pid),
        )
    }
    #[cfg(target_os = "linux")]
    {
        let output = std::process::Command::new("ss")
            .args(["-ltnp", &format!("sport = :{port}")])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let text = String::from_utf8_lossy(&output.stdout);
        Some(text.contains(&format!("pid={pid},")))
    }
    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("netstat")
            .args(["-ano", "-p", "tcp"])
            .output()
            .ok()?;
        if !output.status.success() {
            return None;
        }
        let needle = format!(":{port}");
        let text = String::from_utf8_lossy(&output.stdout);
        Some(text.lines().any(|line| {
            line.contains("LISTENING")
                && line.contains(&needle)
                && line.trim().ends_with(&pid.to_string())
        }))
    }
}

async fn probe(port: u16, token: &str, model_id: &str) -> bool {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .no_proxy()
        .build()
    {
        Ok(client) => client,
        Err(_) => return false,
    };
    let models = format!("http://127.0.0.1:{port}/v1/models");
    // An unrelated service on the port will not reject an unauthenticated
    // request, so authentication is part of identity verification.
    match client.get(&models).send().await {
        Ok(response) if matches!(response.status().as_u16(), 401 | 403) => {}
        _ => return false,
    }
    let mut headers = HeaderMap::new();
    if let Ok(value) = HeaderValue::from_str(&format!("Bearer {token}")) {
        headers.insert(AUTHORIZATION, value);
    }
    let response = match client.get(&models).headers(headers).send().await {
        Ok(response) if response.status().is_success() => response,
        _ => return false,
    };
    let payload: serde_json::Value = match response.json().await {
        Ok(payload) => payload,
        Err(_) => return false,
    };
    payload
        .get("data")
        .and_then(|value| value.as_array())
        .map(|models| {
            models.iter().any(|model| {
                model
                    .get("id")
                    .and_then(|value| value.as_str())
                    .map(|id| id == model_id)
                    .unwrap_or(false)
            })
        })
        .unwrap_or(false)
}

impl RuntimeState {
    fn set_status(&self, status: RuntimeStatus) {
        if let Ok(mut current) = self.status.lock() {
            *current = status;
        }
    }

    fn ready_endpoint(&self) -> Option<ManagedEndpoint> {
        let mut runtime = self.runtime.lock().ok()?;
        if let Some(current) = runtime.as_mut() {
            return match current.child.try_wait() {
                Ok(None) => {
                    current.last_used = Instant::now();
                    Some(ManagedEndpoint {
                        endpoint: current.endpoint.clone(),
                        token: current.token.clone(),
                        model: current.model_id.clone(),
                    })
                }
                _ => {
                    *runtime = None;
                    None
                }
            };
        }
        None
    }

    fn take_runtime(&self) -> Option<ManagedRuntime> {
        self.runtime
            .lock()
            .ok()
            .and_then(|mut runtime| runtime.take())
    }

    async fn stop_locked(&self) {
        if let Some(mut runtime) = self.take_runtime() {
            let _ = runtime.child.kill().await;
            let _ = runtime.child.wait().await;
            let _ = tokio::fs::remove_file(&runtime.token_file).await;
            let _ = tokio::fs::remove_file(&runtime.pid_file).await;
        }
        self.active.store(0, Ordering::SeqCst);
        if let Ok(mut since) = self.active_since.lock() {
            *since = None;
        }
    }

    fn failed<T>(&self, error: &str) -> Result<T, String> {
        self.record_failure(error.to_string());
        self.set_status(RuntimeStatus::new("failed", Some(error.to_string())));
        Err(error.to_string())
    }

    fn record_failure(&self, error: String) {
        if let Ok(mut failure) = self.failure.lock() {
            *failure = Some((error, Instant::now()));
        }
    }

    fn backoff_error(&self) -> Option<String> {
        let failure = self.failure.lock().ok()?;
        let (error, at) = failure.as_ref()?;
        (at.elapsed() < FAILURE_BACKOFF).then(|| error.clone())
    }

    async fn verify_model(
        &self,
        model_path: &Path,
        model: &ModelManifestEntry,
    ) -> Result<(), String> {
        let metadata = std::fs::metadata(model_path).map_err(|_| "model_missing".to_string())?;
        let modified = metadata
            .modified()
            .ok()
            .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|value| value.as_nanos() as u64)
            .unwrap_or(0);
        if let Ok(cached) = self.verified.lock()
            && let Some((path, size, stamp)) = cached.as_ref()
            && path == model_path
            && *size == metadata.len()
            && *stamp == modified
        {
            return Ok(());
        }
        self.hash_cancel.store(false, Ordering::SeqCst);
        let path = model_path.to_path_buf();
        let manifest = model.clone();
        let cancel = self.hash_cancel.clone();
        tokio::time::timeout(
            Duration::from_secs(120),
            tokio::task::spawn_blocking(move || {
                super::download::verify_full_with_cancel(&path, &manifest, cancel.as_ref())
            }),
        )
        .await
        .map_err(|_| "model_verify_timeout".to_string())?
        .map_err(|_| "model_verify".to_string())??;
        if let Ok(mut cached) = self.verified.lock() {
            *cached = Some((model_path.to_path_buf(), metadata.len(), modified));
        }
        Ok(())
    }

    pub async fn ensure(
        &self,
        app: &AppHandle,
        model: &ModelManifestEntry,
        requested_context: Option<u32>,
    ) -> Result<ManagedEndpoint, String> {
        if !target_supported() {
            self.set_status(RuntimeStatus::new(
                "failed",
                Some("unsupported_hardware".to_string()),
            ));
            return Err("unsupported_hardware".to_string());
        }
        let start_epoch = self.epoch.load(Ordering::SeqCst);
        let _guard = self.operation.lock().await;

        let context = context_size(requested_context, model);
        if let Some(existing) = self.ready_endpoint() {
            let matches_context = self
                .runtime
                .lock()
                .ok()
                .and_then(|runtime| runtime.as_ref().map(|current| current.context == context))
                .unwrap_or(false);
            if matches_context {
                return Ok(existing);
            }
            // Analysis settings changed; never keep a runtime with a stale
            // context size.
            self.stop_locked().await;
        }

        if self.epoch.load(Ordering::SeqCst) != start_epoch {
            return Err("cancelled".to_string());
        }
        if let Some(error) = self.backoff_error() {
            self.set_status(RuntimeStatus::new("failed", Some(error.clone())));
            return Err(error);
        }

        self.set_status(RuntimeStatus::new("starting", None));
        let dir = match models_dir(app) {
            Ok(dir) => dir,
            Err(error) => return self.failed(&error),
        };
        let model_path = dir.join(&model.file_name);
        if !model_path.exists() {
            self.record_failure("model_missing".to_string());
            self.set_status(RuntimeStatus::new(
                "failed",
                Some("model_missing".to_string()),
            ));
            return Err("model_missing".to_string());
        }
        if let Err(error) = self.verify_model(&model_path, model).await {
            if error == "cancelled" {
                return Err("cancelled".to_string());
            }
            self.record_failure("model_invalid".to_string());
            self.set_status(RuntimeStatus::new(
                "failed",
                Some("model_invalid".to_string()),
            ));
            return Err("model_invalid".to_string());
        }
        if self.epoch.load(Ordering::SeqCst) != start_epoch {
            return Err("cancelled".to_string());
        }
        let binary = match resolve_binary(app) {
            Ok(binary) => binary,
            Err(error) => return self.failed(&error),
        };
        cleanup_markers(app);
        let runtime_dir = match runtime_dir(app) {
            Ok(dir) => dir,
            Err(error) => return self.failed(&error),
        };
        if tokio::fs::create_dir_all(&runtime_dir).await.is_err() {
            return self.failed("runtime_directory");
        }
        let threads = std::thread::available_parallelism()
            .map(|value| value.get())
            .unwrap_or(4)
            .clamp(1, 8);
        let version = version_of(&binary);
        let mut last_error = "runtime_start_failed".to_string();

        for _attempt in 0..START_ATTEMPTS {
            let attempt_started = Instant::now();
            if self.epoch.load(Ordering::SeqCst) != start_epoch {
                return Err("cancelled".to_string());
            }
            let port = match free_port() {
                Ok(port) => port,
                Err(error) => {
                    last_error = error;
                    continue;
                }
            };
            let ephemeral = token();
            let token_file = runtime_dir.join(format!(
                "token-{}-{}",
                std::process::id(),
                &instance_id()[..12]
            ));
            if write_token_file(&token_file, &ephemeral).is_err() {
                last_error = "token_file".to_string();
                continue;
            }
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
                command.creation_flags(0x08000000);
            }

            let mut child = match command.spawn() {
                Ok(child) => child,
                Err(_) => {
                    let _ = tokio::fs::remove_file(&token_file).await;
                    last_error = "runtime_start".to_string();
                    continue;
                }
            };
            let pid = child.id().unwrap_or_default();
            let mut identity = None;
            for _ in 0..10 {
                identity = process_identity(pid);
                if identity.is_some() {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(100)).await;
            }

            let mut ready = false;
            let mut port_owner_mismatch = false;
            while attempt_started.elapsed() < STARTUP_ATTEMPT_TIMEOUT {
                if self.epoch.load(Ordering::SeqCst) != start_epoch {
                    let _ = child.kill().await;
                    let _ = tokio::fs::remove_file(&token_file).await;
                    return Err("cancelled".to_string());
                }
                if let Ok(Some(_)) = child.try_wait() {
                    break;
                }
                if probe(port, &ephemeral, &model.id).await {
                    match listener_owned_by(port, pid) {
                        Some(false) => {
                            port_owner_mismatch = true;
                            break;
                        }
                        _ => {
                            ready = true;
                            break;
                        }
                    }
                }
                tokio::time::sleep(Duration::from_millis(500)).await;
            }
            if !ready {
                let _ = child.kill().await;
                let _ = child.wait().await;
                let _ = tokio::fs::remove_file(&token_file).await;
                if port_owner_mismatch {
                    last_error = "port_owner_mismatch".to_string();
                } else {
                    last_error = "runtime_start_failed".to_string();
                }
                continue;
            }
            let _ = tokio::fs::remove_file(&token_file).await;
            let instance = instance_id();
            let pid_file = runtime_dir.join(format!("runtime-{instance}.pid"));
            if let Some(identity) = identity {
                write_marker(
                    &pid_file,
                    &RuntimeMarker {
                        pid,
                        start_identity: identity,
                        executable: canonical(&binary).to_string_lossy().to_string(),
                        instance,
                        owner_pid: std::process::id(),
                        owner_identity: process_identity(std::process::id()).unwrap_or_default(),
                    },
                );
            }
            let endpoint = ManagedEndpoint {
                endpoint: format!("http://127.0.0.1:{port}/v1"),
                token: ephemeral,
                model: model.id.clone(),
            };
            if let Ok(mut runtime) = self.runtime.lock() {
                *runtime = Some(ManagedRuntime {
                    child,
                    endpoint: endpoint.endpoint.clone(),
                    token: endpoint.token.clone(),
                    model_id: model.id.clone(),
                    version: version.clone(),
                    last_used: Instant::now(),
                    token_file,
                    pid_file,
                    context,
                });
            }
            if let Ok(mut failure) = self.failure.lock() {
                *failure = None;
            }
            self.set_status(RuntimeStatus {
                state: "ready".to_string(),
                version,
                model_id: Some(model.id.clone()),
                error: None,
                idle_timeout_ms: Some(IDLE_TIMEOUT.as_millis() as u64),
            });
            return Ok(endpoint);
        }

        self.record_failure(last_error.clone());
        self.set_status(RuntimeStatus::new("failed", Some(last_error.clone())));
        Err(last_error)
    }

    pub async fn stop(&self) {
        self.epoch.fetch_add(1, Ordering::SeqCst);
        self.hash_cancel.store(true, Ordering::SeqCst);
        self.set_status(RuntimeStatus::new("stopping", None));
        let _guard = self.operation.lock().await;
        self.stop_locked().await;
        self.set_status(RuntimeStatus::new("stopped", None));
    }

    pub async fn reap_idle(&self) {
        if self.active.load(Ordering::SeqCst) > 0 {
            let stale = self
                .active_since
                .lock()
                .ok()
                .and_then(|since| *since)
                .map(|since| since.elapsed() > ACTIVE_LEASE)
                .unwrap_or(false);
            if !stale {
                return;
            }
        }
        let candidate = {
            let runtime = match self.runtime.lock() {
                Ok(runtime) => runtime,
                Err(_) => return,
            };
            runtime
                .as_ref()
                .map(|current| current.last_used.elapsed() > IDLE_TIMEOUT)
                .unwrap_or(false)
        };
        if !candidate && self.active.load(Ordering::SeqCst) == 0 {
            return;
        }
        // Re-check under the same lock `ensure` uses so a fresh endpoint cannot
        // be handed out and then immediately reaped.
        let _guard = self.operation.lock().await;
        if self.active.load(Ordering::SeqCst) > 0 {
            let stale = self
                .active_since
                .lock()
                .ok()
                .and_then(|since| *since)
                .map(|since| since.elapsed() > ACTIVE_LEASE)
                .unwrap_or(false);
            if !stale {
                return;
            }
            self.active.store(0, Ordering::SeqCst);
            if let Ok(mut since) = self.active_since.lock() {
                *since = None;
            }
        }
        let should_stop = {
            let mut runtime = match self.runtime.lock() {
                Ok(runtime) => runtime,
                Err(_) => return,
            };
            match runtime.as_mut() {
                Some(current) => {
                    current.last_used.elapsed() > IDLE_TIMEOUT
                        || matches!(current.child.try_wait(), Ok(Some(_)) | Err(_))
                }
                None => false,
            }
        };
        if should_stop {
            self.epoch.fetch_add(1, Ordering::SeqCst);
            self.set_status(RuntimeStatus::new("stopping", None));
            self.stop_locked().await;
            self.set_status(RuntimeStatus::new("stopped", None));
        }
    }

    pub fn begin_inference(&self) {
        self.active.fetch_add(1, Ordering::SeqCst);
        if let Ok(mut since) = self.active_since.lock()
            && since.is_none()
        {
            *since = Some(Instant::now());
        }
        if let Ok(mut runtime) = self.runtime.lock()
            && let Some(current) = runtime.as_mut()
        {
            current.last_used = Instant::now();
        }
    }

    pub fn end_inference(&self) {
        let previous = self.active.fetch_sub(1, Ordering::SeqCst);
        if previous <= 1 {
            self.active.store(0, Ordering::SeqCst);
            if let Ok(mut since) = self.active_since.lock() {
                *since = None;
            }
        }
    }

    pub fn status(&self) -> RuntimeStatus {
        let exited = {
            let mut runtime = match self.runtime.lock() {
                Ok(runtime) => runtime,
                Err(_) => {
                    return RuntimeStatus::new("failed", Some("state_lock".to_string()));
                }
            };
            match runtime.as_mut() {
                Some(current) => match current.child.try_wait() {
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
                        true
                    }
                },
                None => false,
            }
        };
        if exited {
            let failed = RuntimeStatus::new("failed", Some("runtime_exited".to_string()));
            self.set_status(failed.clone());
            return failed;
        }
        self.status
            .lock()
            .map(|status| status.clone())
            .unwrap_or_else(|_| RuntimeStatus::new("failed", Some("state_lock".to_string())))
    }
}

pub fn cleanup_stale(app: &AppHandle) {
    cleanup_markers(app);
}

pub fn artifact_available(app: &AppHandle) -> bool {
    resolve_binary(app).is_ok()
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
    fn context_is_clamped_to_the_managed_runtime_window() {
        let model = super::super::manifest::default_model().expect("manifest");
        assert_eq!(context_size(Some(1024), &model), MIN_CONTEXT);
        assert_eq!(context_size(Some(999_999), &model), MAX_CONTEXT);
        assert_eq!(context_size(Some(8192), &model), 8192);
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
    fn token_files_are_private_and_exclusive() {
        let dir = std::env::temp_dir().join(format!("barklarm-token-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let path = dir.join("token");
        let _ = std::fs::remove_file(&path);
        write_token_file(&path, "secret").unwrap();
        assert!(write_token_file(&path, "second").is_err());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&path).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o600);
        }
        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn linux_start_time_parser_handles_parentheses_in_comm() {
        let stat =
            "123 (llama server (test)) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 987654 21";
        assert_eq!(parse_linux_stat(stat), Some("987654".to_string()));
        assert_eq!(parse_linux_stat("broken"), None);
    }

    #[test]
    fn wmic_identity_requires_creation_time_and_path() {
        let value = "\r\nCreationDate=20260101120000.000000+000\r\nExecutablePath=C:\\Barklarm\\llama-server.exe\r\n";
        assert_eq!(
            parse_wmic_identity(value),
            Some("20260101120000.000000+000|C:\\Barklarm\\llama-server.exe".to_string())
        );
        assert_eq!(parse_wmic_identity("ExecutablePath=x"), None);
    }

    #[test]
    fn cleanup_requires_exact_identity_and_is_blocked_by_a_live_owner() {
        let binary = Path::new("/opt/barklarm/llama-server");
        let marker = RuntimeMarker {
            pid: 4242,
            start_identity: "Mon Jan 1 00:00:00 2026|/opt/barklarm/llama-server".to_string(),
            executable: "/opt/barklarm/llama-server".to_string(),
            instance: "i".to_string(),
            owner_pid: 1,
            owner_identity: "owner".to_string(),
        };
        assert!(!cleanup_is_authorized(
            &marker,
            binary,
            true,
            Some(&marker.start_identity)
        ));
        assert!(!cleanup_is_authorized(&marker, binary, false, None));
        assert!(!cleanup_is_authorized(
            &marker,
            Path::new("/other/llama-server"),
            false,
            Some(&marker.start_identity)
        ));
        assert!(cleanup_is_authorized(
            &marker,
            binary,
            false,
            Some(&marker.start_identity)
        ));
    }

    #[tokio::test]
    async fn stop_signals_a_pending_start_before_waiting_for_it() {
        let state = std::sync::Arc::new(RuntimeState::default());
        let guard = state.operation.lock().await;
        let epoch = state.epoch.load(Ordering::SeqCst);
        let stopping = {
            let state = state.clone();
            tokio::spawn(async move { state.stop().await })
        };
        tokio::task::yield_now().await;
        assert_ne!(state.epoch.load(Ordering::SeqCst), epoch);
        assert_eq!(state.status().state, "stopping");
        drop(guard);
        stopping.await.unwrap();
        assert_eq!(state.status().state, "stopped");
        assert!(state.hash_cancel.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn active_inference_is_never_reaped_as_idle() {
        let state = RuntimeState::default();
        state.begin_inference();
        state.reap_idle().await;
        assert_eq!(state.status().state, "stopped");
        state.end_inference();
        assert_eq!(state.active.load(Ordering::SeqCst), 0);
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
