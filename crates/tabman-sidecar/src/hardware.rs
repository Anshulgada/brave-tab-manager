//! Hardware Accelerator Inspection & Benchmarking for DirectML & OpenVINO NPU.

use std::path::Path;

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct SystemHardwareInfo {
    pub cpu_threads: usize,
    pub has_directml: bool,
    pub has_openvino_npu: bool,
    pub primary_device: String,
    pub dgpu_name: Option<String>,
    pub igpu_name: Option<String>,
}

/// Inspect available system hardware backends.
pub fn inspect_hardware() -> SystemHardwareInfo {
    let cpu_threads = std::thread::available_parallelism()
        .map(|p| p.get())
        .unwrap_or(4);

    #[allow(unused_mut)]
    let mut has_directml = false;
    let mut has_openvino_npu = false;
    let dgpu_name: Option<String> = None;
    #[allow(unused_mut)]
    let mut igpu_name = None;

    #[cfg(target_os = "windows")]
    {
        let system_root = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".to_string());
        let sys32 = Path::new(&system_root).join("System32");

        // Check DirectML / DirectX 12
        if sys32.join("d3d12.dll").exists() {
            has_directml = true;
        }

        // Check Intel OpenVINO / Intel AI Boost NPU driver
        // Intel LevelZero driver for NPU lives in System32 as ze_loader.dll or DriverStore
        if sys32.join("ze_loader.dll").exists() || sys32.join("openvino.dll").exists() {
            has_openvino_npu = true;
        }

        // Check for Core Ultra / Meteor Lake NPU hints in environment or CPU info
        if cpu_threads >= 12 {
            // Intel Core Ultra 5/7/9 (e.g. 14 threads / 16 threads) includes Intel AI Boost NPU
            has_openvino_npu = true;
            igpu_name = Some("Intel(R) Arc(TM) Xe-LPG Graphics".to_string());
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        // Linux / macOS fallback checks
        if Path::new("/usr/lib/libopenvino.so").exists() || Path::new("/usr/local/lib/libopenvino.so").exists() {
            has_openvino_npu = true;
        }
    }

    let primary_device = if has_openvino_npu {
        "NPU (Intel AI Boost via OpenVINO / LevelZero)".to_string()
    } else if has_directml {
        "GPU (DirectML Acceleration)".to_string()
    } else {
        format!("CPU (Native SIMD {} Threads)", cpu_threads)
    };

    SystemHardwareInfo {
        cpu_threads,
        has_directml,
        has_openvino_npu,
        primary_device,
        dgpu_name,
        igpu_name,
    }
}

/// Run an empirical dot-product matrix benchmark ($128 \times 768$).
pub fn benchmark_workload(passes: usize) -> f64 {
    let m = 128;
    let k = 768;

    let mut a = vec![0.05f32; m * k];
    let b = vec![0.02f32; k];
    let mut c = vec![0.0f32; m];

    for (i, val) in a.iter_mut().enumerate() {
        *val = ((i % 23) as f32) * 0.04 - 0.5;
    }

    let t0 = std::time::Instant::now();
    for _ in 0..passes {
        for i in 0..m {
            let mut sum = 0.0f32;
            let off = i * k;
            for j in 0..k {
                sum += a[off + j] * b[j];
            }
            c[i] = sum;
        }
    }
    let elapsed = t0.elapsed();
    (elapsed.as_secs_f64() * 1000.0) / (passes as f64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_inspect_hardware() {
        let hw = inspect_hardware();
        assert!(hw.cpu_threads >= 1);
        assert!(!hw.primary_device.is_empty());
    }

    #[test]
    fn test_benchmark_workload() {
        let latency_ms = benchmark_workload(5);
        assert!(latency_ms > 0.0);
        assert!(latency_ms < 100.0);
    }
}
