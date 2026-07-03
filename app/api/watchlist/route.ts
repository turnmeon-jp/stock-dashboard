import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readWatchlist } from "@/app/lib/watchlist";

const execFileP = promisify(execFile);

// リクエスト毎にファイルを読み直す（日次更新を即反映）。
export const dynamic = "force-dynamic";

const REPO_ROOT = path.join(process.cwd(), "..");
const PY = path.join(REPO_ROOT, ".venv", "bin", "python");
// 証券コード = 3数字 + 英数字1（4桁, 例 7203）、または末尾0を付けたJ-Quants 5桁（例 72030）。
// pipeline/screen.py の SEC_CODE/JQ_CODE と同じ許容範囲（最終検証は pipeline.watchlist 側でも行う）。
const CODE_RE = /^\d{3}[0-9A-Z]0?$/;

export async function GET() {
  const data = await readWatchlist();
  return Response.json(data, { status: data.ok ? 200 : 500 });
}

export async function POST(req: Request) {
  let body: { code?: string; action?: string };
  try {
    body = (await req.json()) as { code?: string; action?: string };
  } catch {
    return Response.json({ error: "JSON 本文が不正です" }, { status: 400 });
  }

  const code = (body.code ?? "").trim().toUpperCase();
  const action = body.action;
  if (action !== "add" && action !== "remove") {
    return Response.json({ error: "action は add / remove のいずれかです" }, { status: 400 });
  }
  if (!CODE_RE.test(code)) {
    return Response.json({ error: `コード形式が不正です: ${code}` }, { status: 400 });
  }

  try {
    await execFileP(PY, ["-m", "pipeline.watchlist", `--${action}`, code], {
      cwd: REPO_ROOT,
      timeout: 30_000,
    });
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    const detail = (err.stderr || err.message || "unknown error").trim().slice(0, 500);
    return Response.json(
      { error: `${action === "add" ? "追加" : "削除"}に失敗しました: ${detail}` },
      { status: 500 },
    );
  }

  const data = await readWatchlist();
  return Response.json({ ok: true, action, code, watchlist: data }, { status: 200 });
}
