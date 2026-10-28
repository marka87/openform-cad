// Desktop-Hülle: zeigt die gebaute Web-App (dist) in einem eigenen Fenster; kein Konsolenfenster im Release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("OpenForm CAD konnte nicht starten");
}
