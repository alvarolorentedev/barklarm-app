use serde::Serialize;
use std::path::Path;
use sysinfo::{CpuRefreshKind, Disks, System};

use super::manifest::ModelManifestEntry;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareReport {
    pub os: String,
    pub arch: String,
    pub total_memory_bytes: u64,
    pub available_memory_bytes: u64,
    pub free_disk_bytes: u64,
    pub cpu_count: usize,
    /// The operating system/architecture pair is recognized by Barklarm.
    pub platform_recognized: bool,
    /// The pinned llama-server artifact is present for this target.
    pub runtime_artifact_available: bool,
    /// Measured memory/disk satisfy the pinned model recommendation.
    pub hardware_requirements_met: bool,
    pub model_installed: bool,
    pub runtime_operational: bool,
    /// This target has completed the measured release qualification.
    pub release_qualified: bool,
    /// Platform + artifact + hardware. Kept for older UI/status consumers.
    pub managed_runtime_supported: bool,
    /// Everything managed inference needs, including a verified model.
    pub managed_inference_available: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reason: Option<String>,
}

fn platform_supported() -> Result<(), String> {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let supported = matches!(
        (os, arch),
        ("macos", "aarch64")
            | ("macos", "x86_64")
            | ("linux", "x86_64")
            | ("linux", "aarch64")
            | ("windows", "x86_64")
    );
    if supported {
        Ok(())
    } else {
        Err("unsupported_platform".to_string())
    }
}

pub fn free_disk(data_dir: &Path) -> u64 {
    let Ok(disks) = Disks::new_with_refreshed_list() else {
        return 0;
    };
    let mut free_disk = 0u64;
    let mut best_len = 0usize;
    for disk in &disks {
        let mount = disk.mount_point();
        if data_dir.starts_with(mount) {
            let len = mount.as_os_str().len();
            if len >= best_len {
                best_len = len;
                free_disk = disk.available_space();
            }
        }
    }
    if free_disk == 0
        && let Some(disk) = disks.into_iter().next()
    {
        free_disk = disk.available_space();
    }
    free_disk
}

fn release_qualified() -> bool {
    // Measured on macOS arm64 in Phase 2. Other targets still need native
    // packaging and interactive inference qualification.
    cfg!(all(target_os = "macos", target_arch = "aarch64"))
}

#[allow(clippy::too_many_arguments)]
pub fn report(
    data_dir: &Path,
    model: &ModelManifestEntry,
    model_installed: bool,
    runtime_state: &str,
    runtime_artifact_available: bool,
) -> HardwareReport {
    // Avoid enumerating every process on a status call that the settings page
    // polls. Only memory and CPU topology are needed here.
    let system = System::new().ok().map(|mut value| {
        value.refresh_memory();
        value.refresh_cpu_list(CpuRefreshKind::nothing());
        value
    });
    let free_disk = free_disk(data_dir);
    let total_memory = system
        .as_ref()
        .map(|value| value.total_memory())
        .unwrap_or(0);
    let required_memory = u64::from(model.min_ram_gb).saturating_mul(1024 * 1024 * 1024);
    let memory_ok = total_memory == 0 || total_memory >= required_memory;
    let disk_ok = free_disk == 0 || free_disk >= model.size_bytes;
    let hardware_requirements_met = memory_ok && disk_ok;
    let platform = platform_supported();
    let platform_recognized = platform.is_ok();
    let managed_runtime_supported =
        platform_recognized && runtime_artifact_available && hardware_requirements_met;
    let managed_inference_available = managed_runtime_supported && model_installed;
    let reason = if let Err(reason) = platform {
        Some(reason)
    } else if !runtime_artifact_available {
        Some("runtime_missing".to_string())
    } else if !memory_ok {
        Some("insufficient_memory".to_string())
    } else if !disk_ok {
        Some("insufficient_disk".to_string())
    } else if !model_installed {
        Some("model_missing".to_string())
    } else {
        None
    };

    HardwareReport {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        total_memory_bytes: total_memory,
        available_memory_bytes: system
            .as_ref()
            .map(|value| value.available_memory())
            .unwrap_or(0),
        free_disk_bytes: free_disk,
        cpu_count: system
            .as_ref()
            .map(|value| value.cpus().len().max(1))
            .unwrap_or(1),
        platform_recognized,
        runtime_artifact_available,
        hardware_requirements_met,
        model_installed,
        runtime_operational: runtime_state == "ready",
        release_qualified: release_qualified(),
        managed_runtime_supported,
        managed_inference_available,
        reason,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn release_qualification_is_not_inferred_from_compilation() {
        // Only the measured target is qualified; this test documents the
        // distinction rather than asserting a platform-specific runtime claim.
        let expected = cfg!(all(target_os = "macos", target_arch = "aarch64"));
        assert_eq!(release_qualified(), expected);
    }
}
