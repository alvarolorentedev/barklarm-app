mod credentials;
mod download;
mod hardware;
mod manifest;
mod runtime;

use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};

pub use download::DownloadState;
pub use runtime::RuntimeState;

#[derive(Default)]
pub struct IntelligenceState {
    pub download: Arc<DownloadState>,
    pub runtime: Arc<RuntimeState>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelInfo {
    pub id: String,
    pub display_name: String,
    pub version: String,
    pub quantization: String,
    pub file_name: String,
    pub size_bytes: u64,
    pub sha256: String,
    pub license: String,
    pub license_url: String,
    pub context_length: u32,
    pub recommended_context: u32,
    pub min_ram_gb: u32,
    pub recommended_ram_gb: u32,
    pub runtime_min_build: u32,
    pub installed: bool,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IntelligenceStatus {
    pub model: ModelInfo,
    pub download: download::DownloadStatus,
    pub runtime: runtime::RuntimeStatus,
    pub hardware: hardware::HardwareReport,
}

pub fn models_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|_| "app_data_directory".to_string())?;
    Ok(base.join("models"))
}

pub fn runtime_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|_| "app_data_directory".to_string())?;
    Ok(base.join("intelligence"))
}

fn model_info(
    app: &AppHandle,
    state: &IntelligenceState,
) -> Result<(manifest::ModelManifestEntry, ModelInfo), String> {
    let model = manifest::default_model()?;
    let download = download::status(&state.download, app, &model);
    let path = models_dir(app).ok().map(|dir| dir.join(&model.file_name));
    let installed = download.status == "installed";
    let status = match download.status.as_str() {
        "installed" => "installed",
        "downloading" => "downloading",
        "verifying" => "verifying",
        "failed" if download.error.as_deref() == Some("verification_missing") => "corrupted",
        "failed" => "error",
        "cancelled" => "not_installed",
        _ => "not_installed",
    };
    Ok((
        model.clone(),
        ModelInfo {
            id: model.id,
            display_name: model.display_name,
            version: model.version,
            quantization: model.quantization,
            file_name: model.file_name,
            size_bytes: model.size_bytes,
            sha256: model.sha256,
            license: model.license,
            license_url: model.license_url,
            context_length: model.context_length,
            recommended_context: model.recommended_context,
            min_ram_gb: model.min_ram_gb,
            recommended_ram_gb: model.recommended_ram_gb,
            runtime_min_build: model.runtime_min_build,
            installed,
            status: status.to_string(),
            path: path.map(|value| value.to_string_lossy().to_string()),
            error: download.error.clone(),
        },
    ))
}

#[tauri::command]
pub async fn intelligence_status(
    app: AppHandle,
    state: State<'_, IntelligenceState>,
) -> Result<IntelligenceStatus, String> {
    let manifest_model = manifest::default_model()?;
    let (_, model) = model_info(&app, &state)?;
    let download = download::status(&state.download, &app, &manifest_model);
    let runtime = state.runtime.status();
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "app_data_directory".to_string())?;
    let hardware = hardware::report(
        &data_dir,
        &manifest_model,
        download.status == "installed",
        &runtime.state,
        runtime::artifact_available(&app),
    );
    Ok(IntelligenceStatus {
        model,
        download,
        runtime,
        hardware,
    })
}

#[tauri::command]
pub async fn start_model_download(
    app: AppHandle,
    state: State<'_, IntelligenceState>,
) -> Result<(), String> {
    let model = manifest::default_model()?;
    download::start(app, state.download.clone(), model).await
}

#[tauri::command]
pub async fn cancel_model_download(state: State<'_, IntelligenceState>) -> Result<(), String> {
    download::cancel(&state.download);
    Ok(())
}

#[tauri::command]
pub async fn remove_model(
    app: AppHandle,
    state: State<'_, IntelligenceState>,
) -> Result<(), String> {
    state.runtime.stop().await;
    let model = manifest::default_model()?;
    download::remove(&app, &state.download, &model).await
}

#[tauri::command]
pub async fn ensure_managed_runtime(
    app: AppHandle,
    state: State<'_, IntelligenceState>,
    context_window: Option<u32>,
) -> Result<runtime::ManagedEndpoint, String> {
    let model = manifest::default_model()?;
    state.runtime.ensure(&app, &model, context_window).await
}

#[tauri::command]
pub async fn stop_managed_runtime(state: State<'_, IntelligenceState>) -> Result<(), String> {
    state.runtime.stop().await;
    Ok(())
}

#[tauri::command]
pub fn begin_managed_inference(state: State<'_, IntelligenceState>) {
    state.runtime.begin_inference();
}

#[tauri::command]
pub fn end_managed_inference(state: State<'_, IntelligenceState>) {
    state.runtime.end_inference();
}

#[tauri::command]
pub fn get_provider_key(fingerprint: String) -> Result<Option<String>, String> {
    credentials::get_provider_key(&fingerprint)
}

#[tauri::command]
pub fn set_provider_key(key: String, fingerprint: String) -> Result<(), String> {
    credentials::set_provider_key(&key, &fingerprint)
}

#[tauri::command]
pub fn delete_provider_key(fingerprint: String) -> Result<(), String> {
    credentials::delete_provider_key(&fingerprint)
}

#[tauri::command]
pub fn has_provider_key(fingerprint: String) -> bool {
    credentials::has_provider_key(&fingerprint)
}

#[tauri::command]
pub fn is_destination_approved(fingerprint: String) -> bool {
    credentials::is_destination_approved(&fingerprint)
}

#[tauri::command]
pub fn approve_destination(fingerprint: String) -> Result<(), String> {
    credentials::approve_destination(&fingerprint)
}

#[tauri::command]
pub fn revoke_destination(fingerprint: String) -> Result<(), String> {
    credentials::revoke_destination(&fingerprint)
}

pub fn cleanup_stale(app: &AppHandle) {
    runtime::cleanup_stale(app);
}

pub fn spawn_idle_reaper(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(30)).await;
            let state = app.state::<IntelligenceState>();
            state.runtime.reap_idle().await;
        }
    });
}

pub fn shutdown(app: &AppHandle) {
    let state = app.state::<IntelligenceState>();
    download::cancel(&state.download);
    tauri::async_runtime::block_on(state.runtime.stop());
}
