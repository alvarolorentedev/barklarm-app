use futures_util::StreamExt;
use reqwest::redirect::Policy;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::AppHandle;
use tokio::io::AsyncWriteExt;
use tokio::sync::watch;

use super::manifest::ModelManifestEntry;
use super::manifest::safe_file_name;
use super::models_dir;

const RECORD_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadStatus {
    pub model_id: String,
    pub status: String,
    pub received_bytes: u64,
    pub total_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl DownloadStatus {
    pub fn idle(model: &ModelManifestEntry) -> Self {
        Self {
            model_id: model.id.clone(),
            status: "idle".to_string(),
            received_bytes: 0,
            total_bytes: model.size_bytes,
            error: None,
        }
    }
}

/// The marker is not a cache hint: it binds the installed file to the pinned
/// manifest. A legacy marker (plain SHA-256) is accepted only by the
/// lightweight status check and upgraded after a full hash at activation.
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct VerificationRecord {
    schema_version: u32,
    model_id: String,
    model_version: String,
    file_name: String,
    size_bytes: u64,
    sha256: String,
}

impl VerificationRecord {
    fn from_manifest(model: &ModelManifestEntry) -> Self {
        Self {
            schema_version: RECORD_VERSION,
            model_id: model.id.clone(),
            model_version: model.version.clone(),
            file_name: model.file_name.clone(),
            size_bytes: model.size_bytes,
            sha256: model.sha256.to_lowercase(),
        }
    }

    fn matches(&self, model: &ModelManifestEntry) -> bool {
        self.schema_version == RECORD_VERSION
            && self.model_id == model.id
            && self.model_version == model.version
            && self.file_name == model.file_name
            && self.size_bytes == model.size_bytes
            && self.sha256 == model.sha256.to_lowercase()
    }
}

struct PartGuard {
    path: PathBuf,
    armed: bool,
}

impl Drop for PartGuard {
    fn drop(&mut self) {
        if self.armed {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}

pub struct DownloadState {
    pub status: Mutex<Option<DownloadStatus>>,
    cancel: AtomicBool,
    cancel_tx: watch::Sender<bool>,
    epoch: AtomicU64,
    running: AtomicBool,
    operation: tokio::sync::Mutex<()>,
}

impl Default for DownloadState {
    fn default() -> Self {
        let (cancel_tx, _) = watch::channel(false);
        Self {
            status: Mutex::new(None),
            cancel: AtomicBool::new(false),
            cancel_tx,
            epoch: AtomicU64::new(0),
            running: AtomicBool::new(false),
            operation: tokio::sync::Mutex::new(()),
        }
    }
}

fn allowed_host(host: &str) -> bool {
    host == "huggingface.co"
        || host.ends_with(".hf.co")
        || host.ends_with(".huggingface.co")
        || host.ends_with(".xethub.hf.co")
}

fn marker_path(file: &Path) -> PathBuf {
    let mut name = file.as_os_str().to_os_string();
    name.push(".verified");
    PathBuf::from(name)
}

fn read_record(marker: &Path) -> Option<VerificationRecord> {
    let data = std::fs::read_to_string(marker).ok()?;
    serde_json::from_str(&data).ok()
}

fn write_record(marker: &Path, model: &ModelManifestEntry) -> Result<(), String> {
    let record = VerificationRecord::from_manifest(model);
    let data = serde_json::to_vec_pretty(&record).map_err(|_| "download_marker".to_string())?;
    let temporary = marker.with_extension("verified.tmp");
    std::fs::write(&temporary, data).map_err(|_| "download_marker".to_string())?;
    std::fs::rename(&temporary, marker).map_err(|_| "download_marker".to_string())
}

fn legacy_marker_matches(marker: &Path, model: &ModelManifestEntry) -> bool {
    std::fs::read_to_string(marker)
        .map(|value| value.trim().eq_ignore_ascii_case(&model.sha256))
        .unwrap_or(false)
}

/// Lightweight status check: size, GGUF header and a manifest-bound record.
/// This deliberately does not hash a 1.1 GB file on every UI refresh.
pub fn is_verified(path: &Path, model: &ModelManifestEntry) -> bool {
    std::fs::metadata(path)
        .map(|metadata| metadata.len() == model.size_bytes)
        .unwrap_or(false)
        && has_gguf_header(path)
        && {
            let marker = marker_path(path);
            read_record(&marker)
                .map(|record| record.matches(model))
                .unwrap_or_else(|| legacy_marker_matches(&marker, model))
        }
}

/// Activation-time integrity. Reads the whole file, compares the pinned
/// SHA-256 and upgrades a legacy marker to a manifest-bound record.
#[cfg(test)]
pub fn verify_full(path: &Path, model: &ModelManifestEntry) -> Result<(), String> {
    verify_full_with_cancel(path, model, &AtomicBool::new(false))
}

/// Cooperative activation hash. `cancel` is checked while reading so a stop
/// request does not wait for the whole model.
pub fn verify_full_with_cancel(
    path: &Path,
    model: &ModelManifestEntry,
    cancel: &AtomicBool,
) -> Result<(), String> {
    use std::io::Read;
    let metadata = std::fs::metadata(path).map_err(|_| "model_missing".to_string())?;
    if metadata.len() != model.size_bytes {
        return Err("model_invalid".to_string());
    }
    let modified_before = metadata.modified().ok();
    if !has_gguf_header(path) {
        return Err("model_invalid".to_string());
    }
    let mut file = std::fs::File::open(path).map_err(|_| "model_missing".to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 1024 * 1024];
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Err("cancelled".to_string());
        }
        let read = file
            .read(&mut buffer)
            .map_err(|_| "model_read".to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    if cancel.load(Ordering::SeqCst) {
        return Err("cancelled".to_string());
    }
    let digest = hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    if digest != model.sha256.to_lowercase() {
        return Err("model_invalid".to_string());
    }
    let after = std::fs::metadata(path).map_err(|_| "model_missing".to_string())?;
    if after.len() != model.size_bytes || after.modified().ok() != modified_before {
        return Err("model_changed".to_string());
    }
    write_record(&marker_path(path), model)?;
    Ok(())
}

pub async fn start(
    app: AppHandle,
    state: Arc<DownloadState>,
    model: ModelManifestEntry,
) -> Result<(), String> {
    if !safe_file_name(&model.file_name) {
        return Err("model_file_invalid".to_string());
    }
    let _operation = state.operation.lock().await;
    let dir = models_dir(&app)?;
    let free_disk = super::hardware::free_disk(&dir);
    if free_disk > 0 && free_disk < model.size_bytes.saturating_mul(2) {
        set_status(
            &state,
            DownloadStatus {
                model_id: model.id.clone(),
                status: "failed".to_string(),
                received_bytes: 0,
                total_bytes: model.size_bytes,
                error: Some("insufficient_disk".to_string()),
            },
        );
        return Err("insufficient_disk".to_string());
    }
    let file = dir.join(&model.file_name);
    if file.exists() && is_verified(&file, &model) {
        set_status(
            &state,
            DownloadStatus {
                model_id: model.id.clone(),
                status: "installed".to_string(),
                received_bytes: model.size_bytes,
                total_bytes: model.size_bytes,
                error: None,
            },
        );
        return Ok(());
    }

    // Exactly one operation may own the destination. The previous status check
    // was racy: two starts could both observe idle and spawn writers.
    if state
        .running
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("download_in_progress".to_string());
    }

    state.cancel.store(false, Ordering::SeqCst);
    let _ = state.cancel_tx.send(false);
    let epoch = state.epoch.load(Ordering::SeqCst);
    set_status(
        &state,
        DownloadStatus {
            model_id: model.id.clone(),
            status: "downloading".to_string(),
            received_bytes: 0,
            total_bytes: model.size_bytes,
            error: None,
        },
    );

    drop(_operation);
    tauri::async_runtime::spawn(async move {
        let result = download(&app, &state, &model, epoch).await;
        if state.epoch.load(Ordering::SeqCst) == epoch {
            let status = match result {
                Ok(()) => DownloadStatus {
                    model_id: model.id.clone(),
                    status: "installed".to_string(),
                    received_bytes: model.size_bytes,
                    total_bytes: model.size_bytes,
                    error: None,
                },
                Err(code) if code == "cancelled" => DownloadStatus {
                    model_id: model.id.clone(),
                    status: "cancelled".to_string(),
                    received_bytes: 0,
                    total_bytes: model.size_bytes,
                    error: None,
                },
                Err(code) => DownloadStatus {
                    model_id: model.id.clone(),
                    status: "failed".to_string(),
                    received_bytes: 0,
                    total_bytes: model.size_bytes,
                    error: Some(code),
                },
            };
            set_status(&state, status);
        }
        state.running.store(false, Ordering::SeqCst);
    });
    Ok(())
}

async fn download(
    app: &AppHandle,
    state: &Arc<DownloadState>,
    model: &ModelManifestEntry,
    epoch: u64,
) -> Result<(), String> {
    let dir = models_dir(app)?;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|_| "model_directory".to_string())?;
    let final_path = dir.join(&model.file_name);
    let part_path = dir.join(format!("{}.part", model.file_name));
    let marker = marker_path(&final_path);

    // Never delete an existing model before a verified replacement exists.
    let _ = tokio::fs::remove_file(&part_path).await;

    let client = reqwest::Client::builder()
        .redirect(Policy::custom(|attempt| {
            if attempt.previous().len() >= 5 {
                attempt.stop()
            } else if attempt.url().host_str().map(allowed_host).unwrap_or(false) {
                attempt.follow()
            } else {
                attempt.stop()
            }
        }))
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(30 * 60))
        .user_agent("Barklarm/4 model-downloader")
        .build()
        .map_err(|_| "download_client".to_string())?;

    let mut cancel = state.cancel_tx.subscribe();
    if state.cancel.load(Ordering::SeqCst) {
        return Err("cancelled".to_string());
    }
    let response = tokio::select! {
        changed = cancel.changed() => {
            let _ = changed;
            return Err("cancelled".to_string());
        }
        result = client.get(&model.url).send() => result.map_err(|_| "download_request".to_string())?,
    };
    if !response.status().is_success() {
        return Err("download_status".to_string());
    }
    let final_url = response.url().clone();
    if final_url.scheme() != "https" || !final_url.host_str().map(allowed_host).unwrap_or(false) {
        return Err("download_redirect_rejected".to_string());
    }
    let declared = response.content_length().unwrap_or(model.size_bytes);
    if declared != model.size_bytes {
        return Err("download_size_mismatch".to_string());
    }

    let mut guard = PartGuard {
        path: part_path.clone(),
        armed: true,
    };
    let mut file = tokio::fs::File::create(&part_path)
        .await
        .map_err(|_| "download_file".to_string())?;
    let mut stream = response.bytes_stream();
    let mut hasher = Sha256::new();
    let mut received = 0u64;
    loop {
        if state.cancel.load(Ordering::SeqCst) || state.epoch.load(Ordering::SeqCst) != epoch {
            return Err("cancelled".to_string());
        }
        let next = tokio::select! {
            changed = cancel.changed() => {
                let _ = changed;
                return Err("cancelled".to_string());
            }
            next = stream.next() => next,
        };
        let Some(chunk) = next else { break };
        let chunk = chunk.map_err(|_| "download_stream".to_string())?;
        received = received.saturating_add(chunk.len() as u64);
        if received > model.size_bytes {
            return Err("download_size_mismatch".to_string());
        }
        hasher.update(&chunk);
        file.write_all(&chunk)
            .await
            .map_err(|_| "download_write".to_string())?;
        let mut status = state.status.lock().map_err(|_| "state_lock".to_string())?;
        if let Some(value) = status.as_mut() {
            value.received_bytes = received;
            value.status = "downloading".to_string();
        }
    }
    file.flush()
        .await
        .map_err(|_| "download_write".to_string())?;
    file.sync_all()
        .await
        .map_err(|_| "download_write".to_string())?;
    drop(file);

    if received != model.size_bytes {
        return Err("download_size_mismatch".to_string());
    }
    if state.cancel.load(Ordering::SeqCst) || state.epoch.load(Ordering::SeqCst) != epoch {
        return Err("cancelled".to_string());
    }
    {
        let mut status = state.status.lock().map_err(|_| "state_lock".to_string())?;
        if let Some(value) = status.as_mut() {
            value.status = "verifying".to_string();
        }
    }
    let digest = hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    if digest != model.sha256.to_lowercase() {
        return Err("checksum_mismatch".to_string());
    }
    if !has_gguf_header(&part_path) {
        return Err("model_invalid".to_string());
    }
    if state.cancel.load(Ordering::SeqCst) || state.epoch.load(Ordering::SeqCst) != epoch {
        return Err("cancelled".to_string());
    }

    // Write the next record before touching an installed model, then keep the
    // old file as a backup until both the atomic replacement and marker swap
    // succeed. A failed or cancelled promotion must not destroy a valid model.
    let marker_next = marker.with_extension("verified.next");
    write_record(&marker_next, model)?;
    let backup = dir.join(format!("{}.previous", model.file_name));
    let _ = tokio::fs::remove_file(&backup).await;
    let had_existing = final_path.exists();
    if had_existing {
        tokio::fs::rename(&final_path, &backup)
            .await
            .map_err(|_| "download_promote".to_string())?;
    }
    if tokio::fs::rename(&part_path, &final_path).await.is_err() {
        if had_existing {
            let _ = tokio::fs::rename(&backup, &final_path).await;
        }
        let _ = tokio::fs::remove_file(&marker_next).await;
        return Err("download_promote".to_string());
    }
    guard.armed = false;
    if state.cancel.load(Ordering::SeqCst) || state.epoch.load(Ordering::SeqCst) != epoch {
        let _ = tokio::fs::remove_file(&final_path).await;
        if had_existing {
            let _ = tokio::fs::rename(&backup, &final_path).await;
        }
        let _ = tokio::fs::remove_file(&marker_next).await;
        return Err("cancelled".to_string());
    }
    if tokio::fs::rename(&marker_next, &marker).await.is_err() {
        let _ = tokio::fs::remove_file(&final_path).await;
        if had_existing {
            let _ = tokio::fs::rename(&backup, &final_path).await;
        }
        return Err("download_marker".to_string());
    }
    let _ = tokio::fs::remove_file(&backup).await;
    Ok(())
}

fn set_status(state: &Arc<DownloadState>, status: DownloadStatus) {
    if let Ok(mut current) = state.status.lock() {
        *current = Some(status);
    }
}

pub fn cancel(state: &DownloadState) {
    state.cancel.store(true, Ordering::SeqCst);
    let _ = state.cancel_tx.send(true);
    state.epoch.fetch_add(1, Ordering::SeqCst);
    if let Ok(mut status) = state.status.lock()
        && let Some(value) = status.as_mut()
        && matches!(value.status.as_str(), "downloading" | "verifying")
    {
        value.status = "cancelled".to_string();
        value.received_bytes = 0;
    }
}

pub async fn remove(
    app: &AppHandle,
    state: &DownloadState,
    model: &ModelManifestEntry,
) -> Result<(), String> {
    if !safe_file_name(&model.file_name) {
        return Err("model_file_invalid".to_string());
    }
    state.cancel.store(true, Ordering::SeqCst);
    let _ = state.cancel_tx.send(true);
    state.epoch.fetch_add(1, Ordering::SeqCst);
    // Give an active task a bounded chance to observe cancellation before the
    // files disappear underneath it.
    for _ in 0..50 {
        if !state.running.load(Ordering::SeqCst) {
            break;
        }
        tokio::time::sleep(Duration::from_millis(100)).await;
    }
    let dir = models_dir(app)?;
    let file = dir.join(&model.file_name);
    let marker = marker_path(&file);
    let part = dir.join(format!("{}.part", model.file_name));
    for path in [file, marker, part] {
        if path.exists() {
            std::fs::remove_file(path).map_err(|_| "model_remove".to_string())?;
        }
    }
    if let Ok(mut status) = state.status.lock() {
        *status = Some(DownloadStatus::idle(model));
    }
    Ok(())
}

pub fn status(
    state: &DownloadState,
    app: &AppHandle,
    model: &ModelManifestEntry,
) -> DownloadStatus {
    if let Ok(current) = state.status.lock()
        && let Some(value) = current.as_ref()
        && matches!(
            value.status.as_str(),
            "downloading" | "verifying" | "failed" | "cancelled"
        )
    {
        return value.clone();
    }
    let dir = models_dir(app).ok();
    let file = dir.map(|dir| dir.join(&model.file_name));
    if let Some(file) = file
        && file.exists()
    {
        if is_verified(&file, model) {
            return DownloadStatus {
                model_id: model.id.clone(),
                status: "installed".to_string(),
                received_bytes: model.size_bytes,
                total_bytes: model.size_bytes,
                error: None,
            };
        }
        return DownloadStatus {
            model_id: model.id.clone(),
            status: "failed".to_string(),
            received_bytes: 0,
            total_bytes: model.size_bytes,
            error: Some("verification_missing".to_string()),
        };
    }
    DownloadStatus::idle(model)
}

pub fn has_gguf_header(path: &Path) -> bool {
    use std::io::Read;
    let Ok(mut file) = std::fs::File::open(path) else {
        return false;
    };
    let mut header = [0u8; 4];
    file.read_exact(&mut header).is_ok() && &header == b"GGUF"
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temporary_dir(name: &str) -> PathBuf {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("barklarm-{name}-{suffix}"));
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn test_model(sha256: String, size_bytes: u64) -> ModelManifestEntry {
        ModelManifestEntry {
            id: "test-model".to_string(),
            display_name: "Test".to_string(),
            version: "v1".to_string(),
            quantization: "Q4".to_string(),
            file_name: "test.gguf".to_string(),
            url: "https://huggingface.co/example/test.gguf".to_string(),
            size_bytes,
            sha256,
            license: "MIT".to_string(),
            license_url: "https://example.test/license".to_string(),
            context_length: 4096,
            recommended_context: 2048,
            min_ram_gb: 1,
            recommended_ram_gb: 2,
            runtime_min_build: 1,
        }
    }

    fn hash(bytes: &[u8]) -> String {
        Sha256::digest(bytes)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect()
    }

    #[test]
    fn rejects_unsafe_model_file_names() {
        assert!(safe_file_name("model.gguf"));
        assert!(!safe_file_name("../model.gguf"));
        assert!(!safe_file_name("nested/model.gguf"));
        assert!(!safe_file_name(""));
        assert!(!safe_file_name("model name.gguf"));
    }

    #[test]
    fn requires_a_manifest_bound_record() {
        let dir = temporary_dir("model-record");
        let bytes = b"GGUFrest";
        let model = test_model(hash(bytes), bytes.len() as u64);
        let path = dir.join(&model.file_name);
        std::fs::write(&path, bytes).unwrap();
        assert!(!is_verified(&path, &model));

        std::fs::write(marker_path(&path), b"not-json").unwrap();
        assert!(!is_verified(&path, &model));

        write_record(
            &marker_path(&path),
            &test_model("0".repeat(64), bytes.len() as u64),
        )
        .unwrap();
        assert!(!is_verified(&path, &model));

        write_record(&marker_path(&path), &model).unwrap();
        assert!(is_verified(&path, &model));
        assert!(verify_full(&path, &model).is_ok());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn same_size_replacement_fails_activation_hashing() {
        let dir = temporary_dir("model-swap");
        let original = b"GGUFaaaa";
        let model = test_model(hash(original), original.len() as u64);
        let path = dir.join(&model.file_name);
        std::fs::write(&path, original).unwrap();
        write_record(&marker_path(&path), &model).unwrap();
        assert!(is_verified(&path, &model));

        // Same size, still GGUF, different bytes.
        std::fs::write(&path, b"GGUFbbbb").unwrap();
        assert!(is_verified(&path, &model));
        assert_eq!(verify_full(&path, &model), Err("model_invalid".to_string()));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn activation_hash_stops_when_cancelled() {
        let dir = temporary_dir("model-cancel");
        let bytes = b"GGUFcancel";
        let model = test_model(hash(bytes), bytes.len() as u64);
        let path = dir.join(&model.file_name);
        std::fs::write(&path, bytes).unwrap();
        let cancel = AtomicBool::new(true);
        assert_eq!(
            verify_full_with_cancel(&path, &model, &cancel),
            Err("cancelled".to_string())
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn cancel_marks_an_active_download_as_cancelled() {
        let state = DownloadState::default();
        *state.status.lock().unwrap() = Some(DownloadStatus {
            model_id: "m".to_string(),
            status: "downloading".to_string(),
            received_bytes: 10,
            total_bytes: 20,
            error: None,
        });
        cancel(&state);
        let status = state.status.lock().unwrap();
        assert_eq!(status.as_ref().unwrap().status, "cancelled");
    }

    #[test]
    fn legacy_marker_is_upgraded_only_after_full_verification() {
        let dir = temporary_dir("model-legacy");
        let bytes = b"GGUFlegacy";
        let model = test_model(hash(bytes), bytes.len() as u64);
        let path = dir.join(&model.file_name);
        std::fs::write(&path, bytes).unwrap();
        std::fs::write(marker_path(&path), model.sha256.as_bytes()).unwrap();
        assert!(is_verified(&path, &model));
        assert!(read_record(&marker_path(&path)).is_none());

        assert!(verify_full(&path, &model).is_ok());
        assert_eq!(
            read_record(&marker_path(&path)),
            Some(VerificationRecord::from_manifest(&model))
        );
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn record_is_bound_to_model_version_and_size() {
        let record = VerificationRecord::from_manifest(&test_model("a".repeat(64), 8));
        assert!(record.matches(&test_model("a".repeat(64), 8)));
        assert!(!record.matches(&test_model("b".repeat(64), 8)));
        assert!(!record.matches(&test_model("a".repeat(64), 9)));
        let mut newer = test_model("a".repeat(64), 8);
        newer.version = "v2".to_string();
        assert!(!record.matches(&newer));
    }

    #[test]
    fn allowed_redirect_hosts_are_narrow() {
        assert!(allowed_host("huggingface.co"));
        assert!(allowed_host("us.aws.cdn.hf.co"));
        assert!(!allowed_host("example.com"));
        assert!(!allowed_host("hf.co.evil.example"));
    }
}
