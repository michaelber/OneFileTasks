#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| {
            // Your setup logic here
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}