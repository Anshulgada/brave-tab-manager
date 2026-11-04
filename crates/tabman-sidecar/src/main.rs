//! Tabman Desktop Native Sidecar.
//!
//! Provides DirectML & OpenVINO NPU hardware acceleration and Chrome/Brave Native Messaging.

mod hardware;
mod models;
mod protocol;

use std::io::{self, BufReader, BufWriter};

fn print_help() {
    println!("Tabman Native Desktop Sidecar v0.6.1");
    println!("Usage: tabman-sidecar [OPTIONS]");
    println!();
    println!("Options:");
    println!("  --status, -s           Inspect system hardware and print JSON profile");
    println!("  --benchmark, -b        Run empirical hardware benchmark and print latency");
    println!("  --scan                 Scan local disk cache for downloaded models");
    println!("  --install-manifest     Print Chrome/Brave Native Messaging host manifest");
    println!("  --serve                Run Native Messaging event loop (stdin/stdout)");
    println!("  --help, -h             Print this help message");
}

fn handle_json_request(request_json: &str) -> String {
    // Simple robust request routing without heavy JSON dependencies
    if request_json.contains("\"type\":\"ping\"") || request_json.contains("\"ping\"") {
        return r#"{"status":"ok","version":"0.6.1","engine":"tabman-native-sidecar"}"#.to_string();
    }

    if request_json.contains("hardware/inspect") || request_json.contains("inspect") {
        let hw = hardware::inspect_hardware();
        return format!(
            r#"{{"status":"ok","cpuThreads":{},"hasDirectML":{},"hasOpenVinoNPU":{},"primaryDevice":"{}"}}"#,
            hw.cpu_threads, hw.has_directml, hw.has_openvino_npu, hw.primary_device
        );
    }

    if request_json.contains("hardware/benchmark") || request_json.contains("benchmark") {
        let latency_ms = hardware::benchmark_workload(5);
        return format!(
            r#"{{"status":"ok","latencyMs":{:.2},"unit":"ms"}}"#,
            latency_ms
        );
    }

    if request_json.contains("models/scan") || request_json.contains("scan") {
        let dir = models::get_default_model_dir();
        let found = models::scan_local_models(&dir);
        let items: Vec<String> = found
            .iter()
            .map(|m| {
                format!(
                    r#"{{"name":"{}","path":"{}","sizeMb":{:.1}}}"#,
                    m.name,
                    m.path.replace('\\', "\\\\"),
                    m.size_mb
                )
            })
            .collect();
        return format!(
            r#"{{"status":"ok","path":"{}","count":{},"models":[{}]}}"#,
            dir.to_string_lossy().replace('\\', "\\\\"),
            found.len(),
            items.join(",")
        );
    }

    if request_json.contains("models/embed") || request_json.contains("\"type\":\"embed\"") {
        let text = if let Some(idx) = request_json.find("\"text\":\"") {
            let start = idx + 8;
            if let Some(end) = request_json[start..].find('"') {
                &request_json[start..start + end]
            } else {
                "tabman"
            }
        } else {
            "tabman"
        };
        let emb = models::generate_embedding(text, 128);
        let vals: Vec<String> = emb.iter().map(|v| format!("{:.6}", v)).collect();
        return format!(
            r#"{{"status":"ok","dim":128,"embedding":[{}]}}"#,
            vals.join(",")
        );
    }

    // Default echo / ack
    r#"{"status":"ok","message":"Request received by Tabman Sidecar"}"#.to_string()
}

fn main() -> io::Result<()> {
    let args: Vec<String> = std::env::args().collect();

    if args.len() > 1 {
        match args[1].as_str() {
            "--status" | "-s" => {
                let hw = hardware::inspect_hardware();
                println!(
                    r#"{{"cpuThreads":{},"hasDirectML":{},"hasOpenVinoNPU":{},"primaryDevice":"{}"}}"#,
                    hw.cpu_threads, hw.has_directml, hw.has_openvino_npu, hw.primary_device
                );
                return Ok(());
            }
            "--benchmark" | "-b" => {
                let latency = hardware::benchmark_workload(10);
                println!("Empirical Benchmark: {:.3} ms (128x768 projection)", latency);
                return Ok(());
            }
            "--embed" => {
                let text = args.get(2).map(|s| s.as_str()).unwrap_or("Tabman AI");
                let emb = models::generate_embedding(text, 128);
                println!(
                    r#"{{"text":"{}","dim":128,"l2_norm":1.0,"sample":[{:.4},{:.4},{:.4}]}}"#,
                    text, emb[0], emb[1], emb[2]
                );
                return Ok(());
            }
            "--scan" => {
                let dir = models::get_default_model_dir();
                let found = models::scan_local_models(&dir);
                println!("Model directory: {}", dir.display());
                println!("Found {} models:", found.len());
                for m in found {
                    println!("  - {} ({:.1} MB)", m.name, m.size_mb);
                }
                return Ok(());
            }
            "--install-manifest" => {
                let exe_path = std::env::current_exe().unwrap_or_default();
                let manifest = format!(
                    r#"{{
  "name": "com.tabman.sidecar",
  "description": "Tabman Native AI Acceleration Sidecar",
  "path": "{}",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://*/"
  ]
}}"#,
                    exe_path.to_string_lossy().replace('\\', "\\\\")
                );
                println!("{}", manifest);
                return Ok(());
            }
            "--help" | "-h" => {
                print_help();
                return Ok(());
            }
            "--serve" => {
                // Explicit serve flag
            }
            unknown => {
                eprintln!("Unknown argument: {}", unknown);
                print_help();
                return Ok(());
            }
        }
    }

    // Run Chrome / Brave Native Messaging event loop
    let mut stdin = BufReader::new(io::stdin());
    let mut stdout = BufWriter::new(io::stdout());

    while let Ok(Some(msg)) = protocol::read_native_message(&mut stdin) {
        let response = handle_json_request(&msg);
        protocol::write_native_message(&mut stdout, &response)?;
    }

    Ok(())
}
