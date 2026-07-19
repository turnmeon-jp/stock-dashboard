import { promises as fs } from "node:fs";
import path from "node:path";
import type { ExecQualityReport } from "@/app/lib/types";

// pipeline/exec_quality.py が生成する執行品質ミニ統計（output/exec_quality.json）。
// 実弾(live)移行後の約定率・スリッページの実測値を「検証」タブに表示するためのデータ源。
// リクエスト毎にファイルを読み直す（日次更新を即反映。lvh/route.ts と同方針）。
export const dynamic = "force-dynamic";

const EXEC_QUALITY_PATH = path.join(process.cwd(), "..", "output", "exec_quality.json");

export async function GET() {
  try {
    const raw = await fs.readFile(EXEC_QUALITY_PATH, "utf-8");
    return Response.json(JSON.parse(raw) as ExecQualityReport, { status: 200 });
  } catch {
    // 未生成・破損時は「データなし」表示で正常動作させる（LedgerReport側で章ごと非表示にする）
    const empty: ExecQualityReport = { generated_at: null, modes: {} };
    return Response.json(empty, { status: 200 });
  }
}
