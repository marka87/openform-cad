// Desktop-Hülle: zeigt die gebaute Web-App (dist) in einem eigenen Fenster; kein Konsolenfenster im Release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Datei lesen/schreiben für Öffnen, Speichern und Exporte. Die Pfade kommen aus dem Windows-Dialog oder vom
// Doppelklick auf eine .ofc-Datei; das Fenster zeigt nur die eingebaute App, keine fremden Seiten.
#[tauri::command]
fn read_text(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("{path}: {e}"))
}

#[tauri::command]
fn write_bytes(path: String, data: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, data).map_err(|e| format!("{path}: {e}"))
}

// Datei, mit der die App gestartet wurde (Doppelklick auf .ofc)
#[tauri::command]
fn initial_file() -> Option<String> {
    std::env::args().nth(1).filter(|a| !a.starts_with('-'))
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![read_text, write_bytes, initial_file])
        .run(tauri::generate_context!())
        .expect("OpenForm CAD konnte nicht starten");
}
