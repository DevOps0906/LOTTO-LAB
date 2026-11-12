// Windows 셸(Tauri 2) — P0 플러그인만: store(앱 데이터 폴더 키-값)·clipboard·opener(http·https)·dialog(Rust 측 저장 대화상자만).
// 자체 IPC 명령은 save_csv 하나(task-027). 인자는 모두 검증한다(.claude/rules/desktop.md). updater는 task-035.
use std::path::PathBuf;

use tauri_plugin_dialog::DialogExt;
use tauri_plugin_store::StoreExt;

/// 로컬 저장 파일. 상대 경로라 앱 데이터 폴더(%APPDATA%\kr.lottolab.app\) 아래로 고정된다.
/// 프런트(src/platform/store.ts의 STORE_FILE)와 같아야 하며, 프런트에는 load 권한을 주지 않는다.
const STORE_FILE: &str = "lotto-lab.json";

/// CSV 내용 최대 크기(바이트). 저장 번호 최대 1,000개 기준으로 충분히 크다.
pub const CSV_MAX_BYTES: usize = 5 * 1024 * 1024;
/// 기본 파일 이름의 ".csv" 앞부분 최대 길이.
const CSV_NAME_MAX: usize = 64;

/// 기본 파일 이름 검증: `[A-Za-z0-9_.-]{1,64}\.csv` (경로 구분자·공백·한글 불가 — 대화상자의 기본값으로만 쓴다).
pub fn valid_csv_name(name: &str) -> bool {
    let Some(stem) = name.strip_suffix(".csv") else {
        return false;
    };
    (1..=CSV_NAME_MAX).contains(&stem.len())
        && stem
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'.' || b == b'-')
}

/// save_csv 인자 검증. 빈 내용(빈 CSV)과 5MB 초과는 거부한다.
pub fn validate_csv_args(default_name: &str, contents: &str) -> Result<(), String> {
    if !valid_csv_name(default_name) {
        return Err("INVALID_NAME".into());
    }
    if contents.is_empty() {
        return Err("EMPTY_CONTENTS".into());
    }
    if contents.len() > CSV_MAX_BYTES {
        return Err("TOO_LARGE".into());
    }
    Ok(())
}

/// 사용자가 고른 경로에 확장자가 없거나 다르면 .csv로 맞춘다.
fn with_csv_extension(mut path: PathBuf) -> PathBuf {
    let is_csv = path
        .extension()
        .is_some_and(|e| e.eq_ignore_ascii_case("csv"));
    if !is_csv {
        let mut name = path.file_name().map(|n| n.to_os_string()).unwrap_or_default();
        name.push(".csv");
        path.set_file_name(name);
    }
    path
}

/// CSV 저장: 저장 대화상자(CSV 필터)로 사용자가 고른 경로에만 Rust가 쓴다. 취소하면 false.
/// 프런트에는 fs·dialog 권한이 없다 — capability는 이 명령(allow-save-csv)만 허용한다.
#[tauri::command]
async fn save_csv(app: tauri::AppHandle, default_name: String, contents: String) -> Result<bool, String> {
    validate_csv_args(&default_name, &contents)?;
    tauri::async_runtime::spawn_blocking(move || {
        let picked = app
            .dialog()
            .file()
            .set_title("CSV로 내보내기")
            .set_file_name(&default_name)
            .add_filter("CSV", &["csv"])
            .blocking_save_file();
        let Some(picked) = picked else {
            return Ok(false);
        };
        let path = picked.into_path().map_err(|_| "INVALID_PATH".to_string())?;
        // 내용·경로는 로그에 남기지 않는다.
        std::fs::write(with_csv_extension(path), contents.as_bytes()).map_err(|_| "WRITE_FAILED".to_string())?;
        Ok(true)
    })
    .await
    .map_err(|_| "WRITE_FAILED".to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_csv])
        .setup(|app| {
            // autoSave 끔: app-core가 쓰기 뒤 flush()(= save)로 반영한다.
            app.store_builder(STORE_FILE).disable_auto_save().build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("LOTTO LAB 실행 실패");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn name_accepts_word_chars_dot_dash() {
        assert!(valid_csv_name("lotto-lab-tickets-20261113.csv"));
        assert!(valid_csv_name("a.csv"));
        assert!(valid_csv_name("my_numbers.v1.csv"));
        assert!(valid_csv_name(&format!("{}.csv", "a".repeat(64))));
    }

    #[test]
    fn name_rejects_paths_and_bad_forms() {
        for bad in [
            "",
            ".csv",
            "tickets",
            "tickets.txt",
            "tickets.CSV",
            "../tickets.csv",
            "..\\tickets.csv",
            "C:\\tickets.csv",
            "dir/tickets.csv",
            "내번호.csv",
            "my tickets.csv",
            "tickets.csv\0",
        ] {
            assert!(!valid_csv_name(bad), "{bad:?}");
        }
        assert!(!valid_csv_name(&format!("{}.csv", "a".repeat(65))));
    }

    #[test]
    fn contents_size_limits() {
        assert_eq!(validate_csv_args("a.csv", "x"), Ok(()));
        assert_eq!(validate_csv_args("a.csv", ""), Err("EMPTY_CONTENTS".into()));
        let max = "x".repeat(CSV_MAX_BYTES);
        assert_eq!(validate_csv_args("a.csv", &max), Ok(()));
        let over = "x".repeat(CSV_MAX_BYTES + 1);
        assert_eq!(validate_csv_args("a.csv", &over), Err("TOO_LARGE".into()));
        assert_eq!(validate_csv_args("../a.csv", "x"), Err("INVALID_NAME".into()));
    }

    #[test]
    fn extension_is_forced_to_csv() {
        assert_eq!(with_csv_extension(PathBuf::from("C:/x/a.csv")), PathBuf::from("C:/x/a.csv"));
        assert_eq!(with_csv_extension(PathBuf::from("C:/x/a.CSV")), PathBuf::from("C:/x/a.CSV"));
        assert_eq!(with_csv_extension(PathBuf::from("C:/x/a")), PathBuf::from("C:/x/a.csv"));
        assert_eq!(with_csv_extension(PathBuf::from("C:/x/a.txt")), PathBuf::from("C:/x/a.txt.csv"));
    }
}
