use futures_util::StreamExt;
use reqwest::redirect::Policy;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::AppHandle;
use tokio::io::AsyncWriteExt;

use super::manifest::ModelManifestEntry;
use super::manifest::safe_file_name;
use super::models_dir;

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

#[derive(Default)]
pub struct DownloadState {
    pub status: Mutex<Option<DownloadStatus>>,
    pub cancel: AtomicBool,
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

pub async fn start(
    app: AppHandle,
    state: Arc<DownloadState>,
    model: ModelManifestEntry,
) -> Result<(), String> {
    if !safe_file_name(&model.file_name) {
        return Err("model_file_invalid".to_string());
    }
    let dir = models_dir(&app)?;
    let hardware = super::hardware::report(&dir);
    if hardware.free_disk_bytes > 0 && hardware.free_disk_bytes < model.size_bytes.saturating_mul(2)
    {
        return Err("insufficient_disk".to_string());
    }
    let file = dir.join(&model.file_name);
    if file.exists() && is_verified(&file, model.size_bytes) {
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
    {
        let status = state.status.lock().map_err(|_| "state_lock".to_string())?;
        if matches!(
            status.as_ref().map(|value| value.status.as_str()),
            Some("downloading") | Some("verifying")
        ) {
            return Ok(());
        }
    }

    state.cancel.store(false, Ordering::SeqCst);
    let status = DownloadStatus {
        model_id: model.id.clone(),
        status: "downloading".to_string(),
        received_bytes: 0,
        total_bytes: model.size_bytes,
        error: None,
    };
    set_status(&state, status);

    tauri::async_runtime::spawn(async move {
        let result = download(&app, &state, &model).await;
        match result {
            Ok(()) => set_status(
                &state,
                DownloadStatus {
                    model_id: model.id.clone(),
                    status: "installed".to_string(),
                    received_bytes: model.size_bytes,
                    total_bytes: model.size_bytes,
                    error: None,
                },
            ),
            Err(code) if code == "cancelled" => {
                set_status(
                    &state,
                    DownloadStatus {
                        model_id: model.id.clone(),
                        status: "cancelled".to_string(),
                        received_bytes: 0,
                        total_bytes: model.size_bytes,
                        error: None,
                    },
                );
            }
            Err(code) => set_status(
                &state,
                DownloadStatus {
                    model_id: model.id.clone(),
                    status: "failed".to_string(),
                    received_bytes: 0,
                    total_bytes: model.size_bytes,
                    error: Some(code),
                },
            ),
        }
    });
    Ok(())
}

async fn download(
    app: &AppHandle,
    state: &Arc<DownloadState>,
    model: &ModelManifestEntry,
) -> Result<(), String> {
    let dir = models_dir(app)?;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|_| "model_directory".to_string())?;
    let final_path = dir.join(&model.file_name);
    let part_path = dir.join(format!("{}.part", model.file_name));
    let marker = marker_path(&final_path);

    if final_path.exists() {
        let _ = tokio::fs::remove_file(&final_path).await;
    }
    if marker.exists() {
        let _ = tokio::fs::remove_file(&marker).await;
    }
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

    let response = client
        .get(&model.url)
        .send()
        .await
        .map_err(|_| "download_request".to_string())?;
    if !response.status().is_success() {
        return Err("download_status".to_string());
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
    while let Some(chunk) = stream.next().await {
        if state.cancel.load(Ordering::SeqCst) {
            let _ = tokio::fs::remove_file(&part_path).await;
            return Err("cancelled".to_string());
        }
        let chunk = chunk.map_err(|_| "download_stream".to_string())?;
        received = received.saturating_add(chunk.len() as u64);
        if received > model.size_bytes {
            let _ = tokio::fs::remove_file(&part_path).await;
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
        let _ = tokio::fs::remove_file(&part_path).await;
        return Err("download_size_mismatch".to_string());
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
        let _ = tokio::fs::remove_file(&part_path).await;
        return Err("checksum_mismatch".to_string());
    }
    if !has_gguf_header(&part_path) {
        let _ = tokio::fs::remove_file(&part_path).await;
        return Err("model_invalid".to_string());
    }
    tokio::fs::rename(&part_path, &final_path)
        .await
        .map_err(|_| "download_promote".to_string())?;
    guard.armed = false;
    tokio::fs::write(&marker, model.sha256.as_bytes())
        .await
        .map_err(|_| "download_marker".to_string())?;
    Ok(())
}

fn set_status(state: &Arc<DownloadState>, status: DownloadStatus) {
    if let Ok(mut current) = state.status.lock() {
        *current = Some(status);
    }
}

pub fn cancel(state: &DownloadState) {
    state.cancel.store(true, Ordering::SeqCst);
}

pub fn remove(app: &AppHandle, model: &ModelManifestEntry) -> Result<(), String> {
    if !safe_file_name(&model.file_name) {
        return Err("model_file_invalid".to_string());
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
        if is_verified(&file, model.size_bytes) {
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

/// Reads at most 8 bytes to reject non-GGUF files before activating them.
pub fn is_verified(path: &Path, expected_size: u64) -> bool {
    std::fs::metadata(path)
        .map(|metadata| metadata.len() == expected_size)
        .unwrap_or(false)
        && marker_path(path).exists()
        && has_gguf_header(path)
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

    #[test]
    fn rejects_unsafe_model_file_names() {
        assert!(safe_file_name("model.gguf"));
        assert!(!safe_file_name("../model.gguf"));
        assert!(!safe_file_name("nested/model.gguf"));
        assert!(!safe_file_name(""));
        assert!(!safe_file_name("model name.gguf"));
    }

    #[test]
    fn requires_a_gguf_header_and_verification_marker() {
        let dir = std::env::temp_dir().join(format!("barklarm-model-test-{}", std::process::id()));
        let _ = std::fs::create_dir_all(&dir);
        let valid = dir.join("valid.gguf");
        std::fs::write(&valid, b"GGUFrest").unwrap();
        assert!(has_gguf_header(&valid));
        assert!(!is_verified(&valid, 8));

        let invalid = dir.join("invalid.gguf");
        std::fs::write(&invalid, b"not-gguf").unwrap();
        assert!(!has_gguf_header(&invalid));

        std::fs::write(marker_path(&valid), b"sha").unwrap();
        assert!(is_verified(&valid, 8));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn allowed_redirect_hosts_are_narrow() {
        assert!(allowed_host("huggingface.co"));
        assert!(allowed_host("us.aws.cdn.hf.co"));
        assert!(!allowed_host("example.com"));
        assert!(!allowed_host("hf.co.evil.example"));
    }
}
