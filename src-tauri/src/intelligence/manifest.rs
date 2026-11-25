use serde::{Deserialize, Serialize};

const MODEL_MANIFEST: &str = include_str!("model-manifest.json");

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelManifestEntry {
    pub id: String,
    pub display_name: String,
    pub version: String,
    pub quantization: String,
    pub file_name: String,
    pub url: String,
    pub size_bytes: u64,
    pub sha256: String,
    pub license: String,
    pub license_url: String,
    pub context_length: u32,
    pub recommended_context: u32,
    pub min_ram_gb: u32,
    pub recommended_ram_gb: u32,
    pub runtime_min_build: u32,
}

#[derive(Debug, Deserialize)]
struct ModelManifest {
    #[serde(rename = "schemaVersion")]
    schema_version: u32,
    models: Vec<ModelManifestEntry>,
}

pub fn default_model() -> Result<ModelManifestEntry, String> {
    let manifest: ModelManifest =
        serde_json::from_str(MODEL_MANIFEST).map_err(|_| "model_manifest_invalid".to_string())?;
    if manifest.schema_version != 1 {
        return Err("model_manifest_version".to_string());
    }
    manifest
        .models
        .into_iter()
        .next()
        .ok_or_else(|| "model_manifest_empty".to_string())
}

pub fn safe_file_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 200
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains("..")
        && name.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        })
}
