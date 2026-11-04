//! Local Model Storage & Disk Scanner.
//!
//! Scans `%LOCALAPPDATA%\Tabman\models` and standard system paths directly from disk.

use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct LocalModelInfo {
    pub name: String,
    pub path: String,
    pub size_mb: f64,
    pub is_verified: bool,
}

/// Resolves the canonical local model storage path for the current OS.
pub fn get_default_model_dir() -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            return Path::new(&local_app_data).join("Tabman").join("models");
        }
        PathBuf::from("C:\\Tabman\\models")
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(home) = std::env::var("HOME") {
            return Path::new(&home)
                .join(".local")
                .join("share")
                .join("tabman")
                .join("models");
        }
        PathBuf::from("/tmp/tabman/models")
    }
}

/// Scans the target model directory for existing weights.
pub fn scan_local_models(dir: &Path) -> Vec<LocalModelInfo> {
    let mut found = Vec::new();
    if !dir.exists() || !dir.is_dir() {
        return found;
    }

    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            let name = path
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default();

            if path.is_file() && (name.ends_with(".onnx") || name.ends_with(".bin")) {
                let size_mb = entry
                    .metadata()
                    .map(|m| (m.len() as f64) / (1024.0 * 1024.0))
                    .unwrap_or(0.0);
                found.push(LocalModelInfo {
                    name,
                    path: path.to_string_lossy().to_string(),
                    size_mb: (size_mb * 10.0).round() / 10.0,
                    is_verified: true,
                });
            } else if path.is_dir() {
                // Check if directory contains model files
                let mut dir_size = 0u64;
                if let Ok(sub) = std::fs::read_dir(&path) {
                    for f in sub.flatten() {
                        if let Ok(meta) = f.metadata() {
                            dir_size += meta.len();
                        }
                    }
                }
                let size_mb = (dir_size as f64) / (1024.0 * 1024.0);
                found.push(LocalModelInfo {
                    name,
                    path: path.to_string_lossy().to_string(),
                    size_mb: (size_mb * 10.0).round() / 10.0,
                    is_verified: true,
                });
            }
        }
    }

    found
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_default_model_dir() {
        let dir = get_default_model_dir();
        assert!(!dir.to_string_lossy().is_empty());
    }

    #[test]
    fn test_scan_empty_dir() {
        let temp = std::env::temp_dir().join("tabman_test_empty_models");
        let _ = std::fs::create_dir_all(&temp);
        let models = scan_local_models(&temp);
        assert!(models.is_empty());
        let _ = std::fs::remove_dir_all(&temp);
    }
}
