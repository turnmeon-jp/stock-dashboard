import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export const dynamic = "force-dynamic";

const REPO_ROOT = path.join(process.cwd(), "..");
const PY = path.join(REPO_ROOT, ".venv", "bin", "python");
// pipeline/holdings_cli.py の SEC_CODE/JQ_CODE と同じ許容範囲（最終検証はCLI側でも行う）
const CODE_RE = /^\d{3}[0-9A-Z]0?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface TradeBody {
  kind?: string; // "close"（売却報告）| "add"（取得報告）
  code?: string;
  shares?: number;
  price?: number; // close: 手仕舞い価格 / add: 取得単価
  reason?: string;
  date?: string; // close: --date / add: --since
  income?: boolean; // add のみ: 配当・優待目的（income枠）
}

// 実弾売買の「報告」入口。発注そのものは証券会社アプリで人間が行い、ここでは
// pipeline.holdings_cli（add/close）を起動して holdings.json 更新と journal 一次記録
// （output/journal/trades.jsonl）を行う。売買判断はしない＝CLIと同じく記録動線の機械化のみ。
// execFile（シェル非経由・引数配列渡し）のためコマンド注入は構造的に不可。
export async function POST(req: Request) {
  let body: TradeBody;
  try {
    body = (await req.json()) as TradeBody;
  } catch {
    return Response.json({ error: "JSON 本文が不正です" }, { status: 400 });
  }

  const kind = body.kind;
  if (kind !== "close" && kind !== "add") {
    return Response.json({ error: "kind は close / add のいずれかです" }, { status: 400 });
  }
  const code = (body.code ?? "").trim().toUpperCase();
  if (!CODE_RE.test(code)) {
    return Response.json({ error: `コード形式が不正です: ${code}` }, { status: 400 });
  }
  const shares = body.shares;
  if (!Number.isInteger(shares) || (shares as number) <= 0 || (shares as number) > 1_000_000) {
    return Response.json({ error: "株数は正の整数で指定してください" }, { status: 400 });
  }
  const price = body.price;
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0 || price > 10_000_000) {
    return Response.json({ error: "価格が不正です" }, { status: 400 });
  }
  // 理由は必須（ポストモーテムの原料。CLIと同じ制約）。制御文字は空白に潰す。
  const reason = (body.reason ?? "").replace(/[\x00-\x1f\x7f]/g, " ").trim();
  if (!reason || reason.length > 200) {
    return Response.json({ error: "理由は必須です（200字以内）" }, { status: 400 });
  }
  const date = body.date;
  if (date != null && !DATE_RE.test(date)) {
    return Response.json({ error: "日付は YYYY-MM-DD 形式で指定してください" }, { status: 400 });
  }

  const args = ["-m", "pipeline.holdings_cli"];
  if (kind === "close") {
    args.push("close", code, "--price", String(price), "--shares", String(shares), "--reason", reason);
    if (date) args.push("--date", date);
  } else {
    args.push("add", code, "--cost", String(price), "--shares", String(shares), "--reason", reason,
      "--source", "watchlist");
    if (date) args.push("--since", date);
    if (body.income) args.push("--income");
  }

  try {
    const { stdout, stderr } = await execFileP(PY, args, { cwd: REPO_ROOT, timeout: 30_000 });
    const output = [stdout.trim(), stderr.trim()].filter(Boolean).join("\n");
    return Response.json({ ok: true, kind, code, output }, { status: 200 });
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message?: string };
    const detail = (err.stderr || err.stdout || err.message || "unknown error").trim().slice(0, 500);
    return Response.json(
      { error: `${kind === "close" ? "売却報告" : "取得報告"}に失敗しました: ${detail}` },
      { status: 500 },
    );
  }
}
