use serde::Serialize;
use std::path::Path;
use sysinfo::{Disks, System};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareReport {
    pub os: String,
    pub arch: String,
    pub total_memory_bytes: u64,
    pub available_memory_bytes: u64,
    pub free_disk_bytes: u64,
    pub cpu_count: usize,
    pub managed_runtime_supported: bool,
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

pub fn report(data_dir: &Path) -> HardwareReport {
    let mut system = System::new_all().ok();
    if let Some(value) = system.as_mut() {
        value.refresh_memory();
    }
    let disks = Disks::new_with_refreshed_list().ok();
    let mut free_disk = 0u64;
    let mut best_len = 0usize;
    if let Some(value) = disks.as_ref() {
        for disk in value {
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
            && let Some(disk) = value.into_iter().next()
        {
            free_disk = disk.available_space();
        }
    }

    let platform = platform_supported();
    HardwareReport {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        total_memory_bytes: system
            .as_ref()
            .map(|value| value.total_memory())
            .unwrap_or(0),
        available_memory_bytes: system
            .as_ref()
            .map(|value| value.available_memory())
            .unwrap_or(0),
        free_disk_bytes: free_disk,
        cpu_count: system
            .as_ref()
            .map(|value| value.cpus().len().max(1))
            .unwrap_or(1),
        managed_runtime_supported: platform.is_ok(),
        reason: platform.err(),
    }
}
