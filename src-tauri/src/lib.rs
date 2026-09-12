mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            commands::read_directory,
            commands::get_home_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
