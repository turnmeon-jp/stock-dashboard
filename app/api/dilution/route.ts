import { promises as fs } from "node:fs";
import path from "node:path";

// pipeline/dilution_check.py が生成する銘柄コード→増資/希薄化フラグのマップ（EDINETメタデータのみ）。
// リクエスト毎にファイルを読み直す（日次更新を即反映）。
export const dynamic = "force-dynamic";

const DILUTION_PATH = path.join(process.cwd(), "..", "output", "dilution_flags.json");

export async function GET() {
  try {
    const raw = await fs.readFile(DILUTION_PATH, "utf-8");
    return Response.json(JSON.parse(raw), { status: 200 });
  } catch {
    return Response.json({}, { status: 200 }); // 未生成でもバッジ非表示で正常に動作させる
  }
}
