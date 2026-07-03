import { promises as fs } from "node:fs";
import path from "node:path";

// pipeline/lvh_monitor.py が生成するアクティビスト大量保有報告アラート
// （output/lvh_alerts.json）。リクエスト毎にファイルを読み直す（日次更新を即反映）。
export const dynamic = "force-dynamic";

const LVH_PATH = path.join(process.cwd(), "..", "output", "lvh_alerts.json");

export async function GET() {
  try {
    const raw = await fs.readFile(LVH_PATH, "utf-8");
    return Response.json(JSON.parse(raw), { status: 200 });
  } catch {
    // 未生成でもバッジ非表示・一覧「直近なし」で正常に動作させる
    return Response.json({ alerts: [], generated_at: null }, { status: 200 });
  }
}
