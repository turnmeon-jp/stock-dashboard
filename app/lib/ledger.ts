import { promises as fs } from "node:fs";
import path from "node:path";
import type { LedgerReport, LedgerReportResponse } from "@/app/lib/types";

// プロジェクト直上の output/ledger_report.json を参照する
// （候補抽出系統のforward検証台帳。pipeline/candidate_ledger.py --report が生成）。
const LEDGER_REPORT_PATH = path.join(process.cwd(), "..", "output", "ledger_report.json");

function emptyResponse(message: string, ok: boolean): LedgerReportResponse {
  return {
    ok,
    message,
    generated_at: "",
    n_ledger_rows: 0,
    has_data: false,
    horizons: [],
    systems: {},
  };
}

// サーバー側で ledger_report.json を読み込む。ファイル未存在/解析失敗時は
// わかりやすいメッセージ付きの空レスポンスを返す（signals.ts と同じ方針）。
export async function readLedgerReport(): Promise<LedgerReportResponse> {
  let raw: string;
  try {
    raw = await fs.readFile(LEDGER_REPORT_PATH, "utf-8");
  } catch {
    return emptyResponse(
      "ledger_report.json がまだ生成されていません。pipeline/candidate_ledger.py --report を実行してください。",
      false
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return emptyResponse("ledger_report.json の読み込みに失敗しました（JSON 解析エラー）。", false);
  }

  const d = data as Partial<LedgerReport>;
  return {
    ok: true,
    message: null,
    generated_at: d.generated_at ?? "",
    n_ledger_rows: d.n_ledger_rows ?? 0,
    has_data: d.has_data ?? false,
    horizons: Array.isArray(d.horizons) ? d.horizons : [],
    verdict_horizon: d.verdict_horizon,
    ledger_criteria: d.ledger_criteria,
    systems: d.systems ?? {},
  };
}
