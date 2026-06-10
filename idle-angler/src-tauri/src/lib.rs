use tauri::Manager;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use std::fs;

// ─── セーブ/ロードコマンド ─────────────────────────────────────────────────

/// JSON文字列をアプリデータディレクトリの save.json に書き込む。
/// フロントから: invoke("save_game", { data: jsonString })
#[tauri::command]
fn save_game(app: tauri::AppHandle, data: String) -> Result<(), String> {
    let save_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&save_dir).map_err(|e| e.to_string())?;
    let save_path = save_dir.join("save.json");
    fs::write(&save_path, data).map_err(|e| e.to_string())?;
    Ok(())
}

/// アプリデータディレクトリの save.json を読み込む。
/// フロントから: invoke("load_game")  → Promise<string | null>
#[tauri::command]
fn load_game(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let save_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let save_path = save_dir.join("save.json");
    if save_path.exists() {
        let content = fs::read_to_string(&save_path).map_err(|e| e.to_string())?;
        Ok(Some(content))
    } else {
        Ok(None)
    }
}

// ─── エントリポイント ──────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // ── システムトレイ（常駐の要・タスクバーには出さない） ──
            let show_i = MenuItem::with_id(app, "show", "表示 (Show)", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "終了 (Quit)", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("Idle Angler")
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.unminimize();
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![save_game, load_game])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
