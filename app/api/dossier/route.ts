import { promises as fs } from "node:fs";
import { existsSync, openSync, closeSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execFile, type StdioOptions } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export const dynamic = "force-dynamic";

const REPO_ROOT = path.join(process.cwd(), "..");
const PY = path.join(REPO_ROOT, ".venv", "bin", "python");
const DOSSIER_DIR = path.join(REPO_ROOT, "output", "dossiers");
const WATCHLIST_PATH = path.join(REPO_ROOT, "output", "watchlist.json");
const DOMAIN_SCREEN_PATH = path.join(REPO_ROOT, "output", "domain_screen.json");
const PROMPT_PATH = path.join(REPO_ROOT, "pipeline", "dossier_prompt.md");
const LOG_DIR = path.join(REPO_ROOT, "logs");
// 落選判定＋根拠付き調査の質を優先し既定は Opus 4.8。env で上書き可（サブスク管理）。
const DOSSIER_MODEL = process.env.DOSSIER_MODEL || "claude-opus-4-8";
// ドシエは Opus 4.8 の長時間ジョブ（最大20分）のため、screen の MAX_ACTIVE(4) とは
// 独立に同時1件へ絞る（サブスク使用量の暴走防止）。
const MAX_ACTIVE = 1;
let active = 0;

// 証券コード = 3数字 + 英数字1（4桁, 例 7203）、または末尾0を付けたJ-Quants 5桁（例 72030）。
// dashboard/app/api/watchlist/route.ts の CODE_RE / pipeline/screen.py の SEC_CODE・JQ_CODE と同一。
const CODE_RE = /^\d{3}[0-9A-Z]0?$/;
const SEC_CODE_RE = /^\d{3}[0-9A-Z]$/;

function normalizeCode(code: string): string {
  return SEC_CODE_RE.test(code) ? `${code}0` : code;
}

// dashboard サーバの PATH に ~/.local/bin が無い場合があるため絶対パスで解決
// （screen/route.ts の resolveClaudeBin と同一実装）。
function resolveClaudeBin(): string {
  const cands = [
    process.env.CLAUDE_BIN,
    path.join(os.homedir(), ".local", "bin", "claude"),
    "/usr/local/bin/claude",
    "/opt/homebrew/bin/claude",
  ].filter(Boolean) as string[];
  for (const c of cands) {
    try {
      if (existsSync(c)) return c;
    } catch {
      /* noop */
    }
  }
  return "claude"; // 最後は PATH 解決に委ねる
}

interface DossierFile {
  code?: string;
  name?: string;
  status?: string;
  started_at?: string;
  attached_at?: string;
  error?: string;
  verdict?: { call?: string };
}

async function readDossierFile(code: string): Promise<DossierFile | null> {
  try {
    const raw = await fs.readFile(path.join(DOSSIER_DIR, `${code}.json`), "utf-8");
    return JSON.parse(raw) as DossierFile;
  } catch {
    return null;
  }
}

// プロンプト冒頭の {{NAME}} 用（表示のみ。数値・判定は --context 経由の機械値が正）。
// watchlist → domain_screen の順でキャッシュ済みJSONから引く（新規取得はしない）。
async function resolveName(code: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(WATCHLIST_PATH, "utf-8");
    const wl = JSON.parse(raw) as { items?: { code?: string; name?: string }[] };
    const hit = wl.items?.find((it) => it.code === code);
    if (hit?.name) return hit.name;
  } catch {
    /* noop */
  }
  try {
    const raw = await fs.readFile(DOMAIN_SCREEN_PATH, "utf-8");
    const ds = JSON.parse(raw) as { stocks?: { code?: string; name?: string }[] };
    const hit = ds.stocks?.find((s) => s.code === code);
    if (hit?.name) return hit.name;
  } catch {
    /* noop */
  }
  return null;
}

interface DossierSummary {
  code: string;
  name: string | null;
  status: string | null;
  generated_at: string | null;
  verdict_call: string | null;
  error: string | null;
}

export async function GET() {
  let files: string[];
  try {
    files = await fs.readdir(DOSSIER_DIR);
  } catch {
    return Response.json({ dossiers: [] }, { status: 200 });
  }
  const items: DossierSummary[] = [];
  for (const f of files) {
    if (!f.endsWith(".json")) continue;
    const code = f.replace(/\.json$/, "");
    let raw: string;
    try {
      raw = await fs.readFile(path.join(DOSSIER_DIR, f), "utf-8");
    } catch {
      continue;
    }
    let d: DossierFile;
    try {
      d = JSON.parse(raw) as DossierFile;
    } catch {
      continue; // 破損ファイルはスキップ（ロック中の一時ファイルは別名なので競合しない）
    }
    items.push({
      code: d.code ?? code,
      name: d.name ?? null,
      status: d.status ?? null,
      generated_at: d.attached_at ?? d.started_at ?? null,
      verdict_call: d.verdict?.call ?? null,
      error: d.error ?? null,
    });
  }
  items.sort((a, b) => (b.generated_at ?? "").localeCompare(a.generated_at ?? ""));
  return Response.json({ dossiers: items }, { status: 200 });
}

export async function POST(req: Request) {
  let body: { code?: string; force?: boolean };
  try {
    body = (await req.json()) as { code?: string; force?: boolean };
  } catch {
    return Response.json({ error: "JSON 本文が不正です" }, { status: 400 });
  }

  const rawCode = (body.code ?? "").trim().toUpperCase();
  const force = body.force === true;
  if (!CODE_RE.test(rawCode)) {
    return Response.json({ error: `コード形式が不正です: ${rawCode}` }, { status: 400 });
  }
  if (active >= MAX_ACTIVE) {
    return Response.json(
      { error: "混雑中です（ドシエ生成は同時1件までです）。少し待って再試行してください。" },
      { status: 429 },
    );
  }
  const code = normalizeCode(rawCode);

  // 再生成ガード: 既存ドシエが done なら force:true が無い限り拒否。processing 中も二重起動拒否。
  const existing = await readDossierFile(code);
  if (existing?.status === "done" && !force) {
    return Response.json(
      { error: `${code} のドシエは既に生成済みです（再生成するには force:true を指定）` },
      { status: 409 },
    );
  }
  if (existing?.status === "processing") {
    return Response.json({ error: `${code} のドシエは生成中です` }, { status: 409 });
  }

  let tmpl: string;
  try {
    tmpl = await fs.readFile(PROMPT_PATH, "utf-8");
  } catch {
    return Response.json({ error: "プロンプトテンプレートの読込に失敗しました" }, { status: 500 });
  }
  const name = await resolveName(code);
  const prompt = tmpl.replaceAll("{{CODE}}", code).replaceAll("{{NAME}}", name ?? code);
  const bin = resolveClaudeBin();
  const args = [
    "-p", prompt, "--model", DOSSIER_MODEL,
    "--tools", "WebSearch", "WebFetch", "Bash",
    "--allowedTools", "WebSearch", "WebFetch", "Bash(.venv/bin/python -m pipeline.dossier:*)",
    "--setting-sources", "", "--strict-mcp-config", "--output-format", "json",
  ];

  // 「処理中」エントリを先に作る（--stub は done を上書きしないため二重起動でも安全側）。
  try {
    await execFileP(PY, ["-m", "pipeline.dossier", "--stub", "--code", code], {
      cwd: REPO_ROOT,
      timeout: 10_000,
    });
  } catch {
    /* stub失敗はワーカー起動自体は続行（screen/route.ts と同方針。最終防衛は onExit 側） */
  }

  // デタッチ起動の stdout/stderr を銘柄別ログへ（失敗追跡用）
  let logFd: number | null = null;
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    logFd = openSync(path.join(LOG_DIR, `dossier.${code}.log`), "a");
  } catch {
    logFd = null;
  }
  const stdio: StdioOptions = ["ignore", logFd ?? "ignore", logFd ?? "ignore"];

  const dossierPath = path.join(DOSSIER_DIR, `${code}.json`);

  // 終了時の最終防衛: done化されていなければ --finish --error で記録する
  // （正常終了でも attach 漏れなら「処理中」のまま固まるため、exitCode に関わらず status を確認する。
  //   pipeline/dossier.py の _run_one（--batch 用）と同じ最終防衛ロジック）。
  async function finalizeExit(exitCode: number | null, errMsg?: string): Promise<void> {
    let status: string | undefined;
    try {
      const raw = await fs.readFile(dossierPath, "utf-8");
      status = (JSON.parse(raw) as { status?: string }).status;
    } catch {
      status = undefined;
    }
    if (status === "done") return; // 成果物が既にあるなら何もしない（上書きしない）
    const msg =
      errMsg ??
      (exitCode !== 0
        ? `ワーカー異常終了(code ${exitCode})`
        : "正常終了しましたが完了記録がありません（attach未実行の可能性）");
    try {
      await execFileP(PY, ["-m", "pipeline.dossier", "--finish", "--code", code, "--error", msg], {
        cwd: REPO_ROOT,
        timeout: 10_000,
      });
    } catch {
      /* 最終防衛自体の失敗はログのみ（ここで投げても誰も拾えない） */
    }
  }

  let finished = false;
  const onExit = (exitCode: number | null, errMsg?: string) => {
    if (finished) return;
    finished = true;
    active = Math.max(0, active - 1);
    void finalizeExit(exitCode, errMsg);
  };

  try {
    active++;
    const child = spawn(bin, args, { cwd: REPO_ROOT, detached: true, stdio });
    child.on("error", (e) => onExit(null, `起動失敗: ${e.message}`));
    child.on("exit", (exitCode) => onExit(exitCode));
    child.unref();
  } catch {
    active = Math.max(0, active - 1);
    return Response.json({ error: "ドシエ生成の起動に失敗しました" }, { status: 500 });
  } finally {
    if (logFd !== null) {
      try {
        closeSync(logFd); // fd は子へ dup 済み。親側は閉じる
      } catch {
        /* noop */
      }
    }
  }

  return Response.json({ code, name, status: "processing" }, { status: 202 });
}
