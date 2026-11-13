// Windows 셸(Tauri 2) — P0 플러그인만: store(앱 데이터 폴더 키-값)·clipboard·opener(http·https).
// 자체 IPC 명령은 없다(추가 시 인자 검증 필수, .claude/rules/desktop.md). updater는 task-035.
use tauri_plugin_store::StoreExt;

/// 로컬 저장 파일. 상대 경로라 앱 데이터 폴더(%APPDATA%\kr.lottolab.app\) 아래로 고정된다.
/// 프런트(src/platform/store.ts의 STORE_FILE)와 같아야 하며, 프런트에는 load 권한을 주지 않는다.
const STORE_FILE: &str = "lotto-lab.json";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // autoSave 끔: app-core가 쓰기 뒤 flush()(= save)로 반영한다.
            app.store_builder(STORE_FILE).disable_auto_save().build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("LOTTO LAB 실행 실패");
}
