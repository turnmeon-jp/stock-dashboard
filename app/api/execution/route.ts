import { promises as fs } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ExecutionPlan, ExecutionStatus } from "@/app/lib/types";

const execFileP = promisify(execFile);

export const dynamic = "force-dynamic";

const REPO_ROOT = path.join(process.cwd(), "..");
const PY = path.join(REPO_ROOT, ".venv", "bin", "python");
const PLAN_PATH = path.join(REPO_ROOT, "output", "execution_plan.json");
const STATUS_PATH = path.join(REPO_ROOT, "output", "execution_status.json");

// 立花コード（4桁英数字、まれに末尾を含め5桁）。
// pipeline/holdings_cli.py 等の CODE_RE(/^\d{3}[0-9A-Z]0?$/) は J-Quants 5桁用の別体系のため流用しない。
const CODE_RE = /^[0-9A-Z]{4,5}$/;
const HASH_RE = /^[0-9a-f]{16}$/;
// open-gate/post-open/ratchet は Phase C+ で追加（いずれも引数なし。寄り前ゲート手動実行/
// 引け後同期+SL自動設置/SL切上げ）。approve は「承認のみ」に意味が変わり、実発注は
// 翌朝の open-gate（launchd等からの定期実行）に委ねられる。
const KIND_ALLOW = new Set([
  "plan",
  "approve",
  "sync",
  "place-stop",
  "kill",
  "open-gate",
  "post-open",
  "ratchet",
]);

async function readJsonOrNull<T>(p: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(p, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null; // 未生成・破損のどちらもnullに畳む（exit-monitor/route.ts と同方針）
  }
}

export async function GET() {
  const [plan, status] = await Promise.all([
    readJsonOrNull<ExecutionPlan>(PLAN_PATH),
    readJsonOrNull<ExecutionStatus>(STATUS_PATH),
  ]);
  return Response.json({ plan, status }, { status: 200 });
}

// req.json() の戻りは null・配列・数値などJSONとして正当な任意の値になり得るため、
// unknown として受けてフィールド毎に実行時型検証する（型不正での .trim() 例外→500 を防ぐ）。
function strField(obj: Record<string, unknown>, key: string): string | null {
  const v = obj[key];
  if (v === undefined) return ""; // 未指定は空文字に畳む（後段の正規表現/必須チェックで弾く）
  return typeof v === "string" ? v : null; // string以外の型は不正
}

// 真の直列化は execution.daily 側の fcntl ロックが担う。ここでのカウンタは
// 同時多重POSTの雑な間引き（429を返して即失敗させる）のみが目的（dossier/route.ts 流儀）。
let active = 0;

// 自動執行パネルの唯一のミューテーション入口。plan/sync/approve/place-stop/kill/
// open-gate/post-open/ratchet はいずれも execution.daily の該当サブコマンドを起動するだけで、
// 売買の是非はCLI側（人間の承認 or ガード）が握る。
export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return Response.json({ ok: false, error: "JSON 本文が不正です" }, { status: 400 });
  }
  // JSONとしては正当でもオブジェクト以外（null・配列・数値等）は本文不正
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return Response.json({ ok: false, error: "JSON 本文が不正です" }, { status: 400 });
  }
  const body = raw as Record<string, unknown>;

  const kind = strField(body, "kind");
  if (kind === null || !KIND_ALLOW.has(kind)) {
    return Response.json({ ok: false, error: `kind が不正です: ${String(body.kind)}` }, { status: 400 });
  }

  const args = ["-m", "execution.daily", kind];

  if (kind === "approve" || kind === "place-stop") {
    const codeRaw = strField(body, "code");
    const code = codeRaw === null ? null : codeRaw.trim().toUpperCase();
    if (code === null || !CODE_RE.test(code)) {
      return Response.json({ ok: false, error: `コード形式が不正です: ${String(body.code)}` }, { status: 400 });
    }
    const hashRaw = strField(body, "hash");
    const hash = hashRaw === null ? null : hashRaw.trim();
    if (hash === null || !HASH_RE.test(hash)) {
      return Response.json({ ok: false, error: "hash が不正です" }, { status: 400 });
    }
    args.push("--code", code, "--hash", hash);
  } else if (kind === "kill") {
    // 制御文字は空白に潰す（trade/route.ts の reason 処理と同方針）
    const reasonRaw = strField(body, "reason");
    const reason = reasonRaw === null ? null : reasonRaw.replace(/[\x00-\x1f\x7f]/g, " ").trim();
    if (reason === null || !reason || reason.length > 200) {
      return Response.json({ ok: false, error: "理由は必須です（200字以内）" }, { status: 400 });
    }
    args.push("--reason", reason);
  }
  // plan / sync / open-gate / post-open / ratchet は引数なし

  if (active >= 1) {
    return Response.json(
      { ok: false, error: "混雑中です。少し待って再試行してください。" },
      { status: 429 },
    );
  }

  active++;
  try {
    // デモはAPIログイン+直列処理で数十秒かかり得るため timeout は長め（120秒）。
    // CLIは成功/失敗いずれもexit codeに関わらずstdoutに1個のJSONを出す契約のため、
    // execFile が例外を投げた場合（exit!=0）でも e.stdout からのJSON復元を試みる。
    let stdout = "";
    let stderr = "";
    try {
      const r = await execFileP(PY, args, { cwd: REPO_ROOT, timeout: 120_000 });
      stdout = r.stdout;
      stderr = r.stderr;
    } catch (e) {
      const err = e as { stdout?: string; stderr?: string; message?: string };
      stdout = err.stdout ?? "";
      stderr = err.stderr ?? err.message ?? "";
    }

    let parsed: { ok?: boolean; error?: string; [key: string]: unknown } | null = null;
    try {
      parsed = JSON.parse(stdout.trim());
    } catch {
      parsed = null;
    }

    if (parsed && typeof parsed.ok === "boolean") {
      if (parsed.ok) {
        return Response.json({ ok: true, kind, result: parsed }, { status: 200 });
      }
      return Response.json(
        { ok: false, kind, error: parsed.error ?? "失敗しました" },
        { status: 500 },
      );
    }

    // JSONとして復元できない = CLI自体が起動できない等の異常。stderr優先でtruncate。
    const detail = (stderr || stdout || "unknown error").trim().slice(0, 500);
    return Response.json({ ok: false, kind, error: detail }, { status: 500 });
  } finally {
    active = Math.max(0, active - 1);
  }
}
