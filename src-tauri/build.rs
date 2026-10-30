use std::{env, fs, path::PathBuf};

// WebView2Loader.dll dorthin legen, wo tauri.conf.json (bundle.resources) sie erwartet. Auf einem frischen Checkout fehlt sie sonst
// und der Bau bricht ab. Quelle: das Crate webview2-com-sys in der Cargo-Registry, in der Version aus Cargo.lock.
fn copy_webview2_loader() {
    let dest = PathBuf::from("target/release/WebView2Loader.dll");
    if dest.exists() {
        return;
    }
    let lock = fs::read_to_string("Cargo.lock").expect("Cargo.lock fehlt");
    let version = lock
        .split("[[package]]")
        .find(|p| p.contains("name = \"webview2-com-sys\""))
        .and_then(|p| p.lines().find_map(|l| l.strip_prefix("version = \"")?.strip_suffix('"').map(str::to_owned)))
        .expect("webview2-com-sys nicht in Cargo.lock");
    let home = env::var("CARGO_HOME").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from(env::var("USERPROFILE").unwrap()).join(".cargo"));
    let src = fs::read_dir(home.join("registry/src"))
        .expect("Cargo-Registry nicht gefunden")
        .flatten()
        .map(|d| d.path().join(format!("webview2-com-sys-{version}/x64/WebView2Loader.dll")))
        .find(|p| p.exists())
        .expect("WebView2Loader.dll nicht in der Cargo-Registry");
    fs::create_dir_all("target/release").unwrap();
    fs::copy(src, dest).unwrap();
}

fn main() {
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        copy_webview2_loader();
    }
    tauri_build::build()
}
