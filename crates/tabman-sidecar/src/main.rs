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

fn extract_json_field<'a>(json: &'a str, key: &str) -> Option<&'a str> {
    let pattern = format!("\"{}\":", key);
    let idx = json.find(&pattern)?;
    let rest = json[idx + pattern.len()..].trim_start();
    if !rest.starts_with('"') {
        return None;
    }
    let start = 1;
    let end = rest[start..].find('"')?;
    Some(&rest[start..start + end])
}

fn slugify(text: &str) -> String {
    let mut out = String::new();
    for c in text.trim().to_lowercase().chars() {
        if c.is_alphanumeric() || c == '-' {
            out.push(c);
        } else if c.is_whitespace() || c == '_' {
            if !out.ends_with('-') {
                out.push('-');
            }
        }
    }
    let trimmed = out.trim_matches('-');
    if trimmed.is_empty() {
        "item".to_string()
    } else {
        trimmed.chars().take(48).collect()
    }
}

fn get_default_previews_dir() -> std::path::PathBuf {
    #[cfg(target_os = "windows")]
    {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let p_lower = std::path::Path::new(&local_app_data).join("tabman").join("previews");
            let _ = std::fs::create_dir_all(&p_lower);
            return p_lower;
        }
        std::path::PathBuf::from("C:\\tabman\\previews")
    }
    #[cfg(not(target_os = "windows"))]
    {
        if let Ok(home) = std::env::var("HOME") {
            let p = std::path::Path::new(&home)
                .join(".local")
                .join("share")
                .join("tabman")
                .join("previews");
            let _ = std::fs::create_dir_all(&p);
            return p;
        }
        std::path::PathBuf::from("/tmp/tabman/previews")
    }
}

fn handle_json_request(request_json: &str) -> String {
    let req_type = extract_json_field(request_json, "type").unwrap_or("");

    if req_type == "ping" || request_json.contains("\"ping\"") {
        return r#"{"status":"ok","version":"0.6.1","engine":"tabman-native-sidecar"}"#.to_string();
    }

    if req_type == "hardware/inspect" || req_type == "inspect" {
        let hw = hardware::inspect_hardware();
        return format!(
            r#"{{"status":"ok","cpuThreads":{},"hasDirectML":{},"hasOpenVinoNPU":{},"primaryDevice":"{}"}}"#,
            hw.cpu_threads, hw.has_directml, hw.has_openvino_npu, hw.primary_device
        );
    }

    if req_type == "hardware/benchmark" || req_type == "benchmark" {
        let latency_ms = hardware::benchmark_workload(5);
        return format!(
            r#"{{"status":"ok","latencyMs":{:.2},"unit":"ms"}}"#,
            latency_ms
        );
    }

    if req_type == "models/scan" || req_type == "scan" {
        let dir = if let Some(raw_p) = extract_json_field(request_json, "path") {
            let unescaped = raw_p.replace("\\\\", "\\").replace("\\/", "/");
            if !unescaped.trim().is_empty() {
                std::path::PathBuf::from(unescaped)
            } else {
                models::get_default_model_dir()
            }
        } else {
            models::get_default_model_dir()
        };
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

    if req_type == "models/embed" || req_type == "embed" {
        let text = extract_json_field(request_json, "text").unwrap_or("tabman");
        let emb = models::generate_embedding(text, 128);
        let vals: Vec<String> = emb.iter().map(|v| format!("{:.6}", v)).collect();
        return format!(
            r#"{{"status":"ok","dim":128,"embedding":[{}]}}"#,
            vals.join(",")
        );
    }

    if req_type == "previews/save" {
        let col = extract_json_field(request_json, "collection").unwrap_or("default");
        let url = extract_json_field(request_json, "url").unwrap_or("item");
        let col_slug = slugify(col);
        let url_slug = slugify(url);
        let preview_dir = get_default_previews_dir().join(&col_slug).join(&url_slug);
        return match std::fs::create_dir_all(&preview_dir) {
            Ok(_) => {
                let file_path = preview_dir.join("preview.json");
                match std::fs::write(&file_path, request_json) {
                    Ok(_) => r#"{"status":"ok","message":"Preview persisted to disk"}"#.to_string(),
                    Err(e) => format!(r#"{{"status":"error","message":"{}"}}"#, e),
                }
            }
            Err(e) => format!(r#"{{"status":"error","message":"{}"}}"#, e),
        };
    }

    if req_type == "previews/delete" {
        let col = extract_json_field(request_json, "collection").unwrap_or("default");
        let col_slug = slugify(col);
        let col_dir = get_default_previews_dir().join(&col_slug);
        if let Some(url) = extract_json_field(request_json, "url") {
            let url_slug = slugify(url);
            let tab_dir = col_dir.join(&url_slug);
            if tab_dir.exists() {
                let _ = std::fs::remove_dir_all(&tab_dir);
            }
        } else if col_dir.exists() {
            let _ = std::fs::remove_dir_all(&col_dir);
        }
        return r#"{"status":"ok","message":"Preview pruned from disk"}"#.to_string();
    }

    if req_type == "upgrade" || req_type == "app/upgrade" {
        let status = std::process::Command::new("tabman")
            .arg("upgrade")
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .status();
        match status {
            Ok(s) if s.success() => {
                return r#"{"status":"ok","message":"Tabman upgraded successfully."}"#.to_string();
            }
            _ => {
                return r#"{"status":"manual_action_required","message":"Run 'tabman upgrade' in your terminal."}"#.to_string();
            }
        }
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
