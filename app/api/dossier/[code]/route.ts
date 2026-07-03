import { promises as fs } from "node:fs";
import path from "node:path";

// 個別銘柄の投資ドシエ。生成中(status:processing)を含めそのまま返す（ポーリング用）。
export const dynamic = "force-dynamic";

const REPO_ROOT = path.join(process.cwd(), "..");
const DOSSIER_DIR = path.join(REPO_ROOT, "output", "dossiers");
// dashboard/app/api/watchlist/route.ts の CODE_RE と同一（4桁 or 末尾0付き5桁）。
const CODE_RE = /^\d{3}[0-9A-Z]0?$/;
const SEC_CODE_RE = /^\d{3}[0-9A-Z]$/;

function normalizeCode(code: string): string {
  return SEC_CODE_RE.test(code) ? `${code}0` : code;
}

export async function GET(_req: Request, ctx: RouteContext<"/api/dossier/[code]">) {
  const { code: rawCode } = await ctx.params;
  const code = normalizeCode((rawCode ?? "").trim().toUpperCase());
  if (!CODE_RE.test(code)) {
    return Response.json({ error: `コード形式が不正です: ${rawCode}` }, { status: 400 });
  }
  try {
    const raw = await fs.readFile(path.join(DOSSIER_DIR, `${code}.json`), "utf-8");
    return Response.json(JSON.parse(raw), { status: 200 });
  } catch {
    return Response.json({ error: "ドシエが見つかりません" }, { status: 404 });
  }
}
