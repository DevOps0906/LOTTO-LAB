// CSV 내보내기(D-05·D-01): app-core가 CSV 문자열(BOM·텍스트 보존·수식 주입 방지)을 만들고,
// Rust 명령 save_csv가 저장 대화상자로 사용자가 고른 경로에만 쓴다. 프런트에는 fs·dialog 권한이 없다(capability: allow-save-csv만).
import { invoke } from "@tauri-apps/api/core";
import { csvFileName, summaryCsv, ticketsCsv } from "@lotto-lab/app-core";
import type { CsvExporter } from "@lotto-lab/ui";

/** 저장: true = 저장함, false = 대화상자 취소. 인자 검증 실패·쓰기 실패는 reject. */
export type SaveCsv = (defaultName: string, contents: string) => Promise<boolean>;

const saveWithTauri: SaveCsv = (defaultName, contents) => invoke<boolean>("save_csv", { defaultName, contents });

export function createCsvExporter(save: SaveCsv = saveWithTauri, now: () => Date = () => new Date()): CsvExporter {
  return {
    async tickets(rows) {
      return (await save(csvFileName("tickets", now()), ticketsCsv(rows))) ? "saved" : "cancelled";
    },
    async summary(items) {
      const at = now();
      return (await save(csvFileName("summary", at), summaryCsv(items, at.toISOString()))) ? "saved" : "cancelled";
    },
  };
}
