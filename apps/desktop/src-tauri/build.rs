fn main() {
    // 앱 명령을 매니페스트에 올려 capability로 허용한 명령만 프런트가 부를 수 있게 한다(save_csv — task-027).
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(tauri_build::AppManifest::new().commands(&["save_csv"])),
    )
    .expect("tauri build 설정 실패");
}
