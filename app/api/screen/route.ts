import { promises as fs } from "node:fs";
import { existsSync, openSync, closeSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execFile, type StdioOptions } from "node:child_process";
import { promisify } from "node:util";
import type { ScreenStore } from "@/app/lib/types";

const execFileP = promisify(execFile);

export const dynamic = "force-dynamic";

const REPO_ROOT = path.join(process.cwd(), "..");
const SCREEN_PATH = path.join(REPO_ROOT, "output", "screen.json");
const PY = path.join(REPO_ROOT, ".venv", "bin", "python");
const PROMPT_PATH = path.join(REPO_ROOT, "pipeline", "screen_prompt.md");
const LOG_DIR = path.join(REPO_ROOT, "logs");
// 定性判定の質を優先し既定は sonnet。コスト最小化したい場合は env で haiku 等に上書き可。
const AGENT_MODEL = process.env.SCREEN_AGENT_MODEL || "claude-sonnet-4-6";
// 同時起動の上限（ループバック前提でも暴走/直接API連打を防ぐプロセス内ガード）
const MAX_ACTIVE = Number(process.env.SCREEN_MAX_ACTIVE || 4);
let active = 0;

const EMPTY: ScreenStore = { screens: [] };

// dashboard サーバの PATH に ~/.local/bin が無い場合があるため絶対パスで解決
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

export async function GET() {
  try {
    const raw = await fs.readFile(SCREEN_PATH, "utf-8");
    return Response.json(JSON.parse(raw) as ScreenStore, { status: 200 });
  } catch {
    return Response.json(EMPTY, { status: 200 });
  }
}

export async function POST(req: Request) {
  let body: { input?: string; note?: string };
  try {
    body = (await req.json()) as { input?: string; note?: string };
  } catch {
    return Response.json({ error: "JSON 本文が不正です" }, { status: 400 });
  }

  const input = (body.input ?? "").trim();
  const note = (body.note ?? "").trim();
  if (!input || input.length > 2000) {
    return Response.json({ error: "input が空、または長すぎます" }, { status: 400 });
  }
  if (note.length > 4000) {
    return Response.json({ error: "note が長すぎます" }, { status: 400 });
  }
  if (active >= MAX_ACTIVE) {
    return Response.json({ error: "混雑中です。少し待って再試行してください。" }, { status: 429 });
  }

  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const isUrl = /^https?:\/\//i.test(input);

  // 「処理中」エントリを先に作る（ジョブを即可視化＋起動失敗も確実に検知できる）
  try {
    const stubArgs = ["-m", "pipeline.screen", "--stub", "--job", jobId, input];
    if (note) stubArgs.push("--note", note);
    await execFileP(PY, stubArgs, { cwd: REPO_ROOT, timeout: 10_000 });
  } catch {
    /* stub失敗はワーカーが後でエントリを作るため致命ではない */
  }

  // デタッチ起動の stdout/stderr をジョブ別ログへ（失敗追跡用）
  let logFd: number | null = null;
  try {
    await fs.mkdir(LOG_DIR, { recursive: true });
    logFd = openSync(path.join(LOG_DIR, `screen.${jobId}.log`), "a");
  } catch {
    logFd = null;
  }
  const stdio: StdioOptions = ["ignore", logFd ?? "ignore", logFd ?? "ignore"];

  // ワーカー終了を一度だけ記録（active減算 + ジョブの worker_exit 反映）
  let finished = false;
  const onExit = (code: number | null, errMsg?: string) => {
    if (finished) return;
    finished = true;
    active = Math.max(0, active - 1);
    const fin = ["-m", "pipeline.screen", "--finish", "--job", jobId];
    const msg = errMsg ?? (code && code !== 0 ? `ワーカー異常終了(code ${code})` : null);
    if (msg) fin.push("--error", msg);
    execFile(PY, fin, { cwd: REPO_ROOT }, () => {});
  };

  try {
    active++;
    let child;
    if (isUrl) {
      // URL → ヘッドレス Claude Code が読解→ticker特定→python機械スクリーナ→定性判定→attach。
      // 注入対策: 利用可能ツールを WebFetch と「pipeline.screen 限定の Bash」のみに絞り、
      // ユーザー/プロジェクト設定の広い許可は読み込まず(--setting-sources "")、MCP も無効化。
      const tmpl = await fs.readFile(PROMPT_PATH, "utf-8");
      const prompt = tmpl
        .replaceAll("{{INPUT}}", input)
        .replaceAll("{{NOTE}}", note || "(なし)")
        .replaceAll("{{JOB}}", jobId);
      child = spawn(
        resolveClaudeBin(),
        [
          "-p",
          prompt,
          "--model",
          AGENT_MODEL,
          "--tools",
          "WebFetch",
          "Bash",
          "--allowedTools",
          "WebFetch",
          "Bash(.venv/bin/python -m pipeline.screen:*)",
          "--setting-sources",
          "",
          "--strict-mcp-config",
          "--output-format",
          "json",
        ],
        { cwd: REPO_ROOT, detached: true, stdio },
      );
    } else {
      // コード/銘柄名 → python 機械スクリーナを直接（定性判定なし・即時）
      const args = ["-m", "pipeline.screen", input, "--job", jobId, "--json"];
      if (note) args.push("--note", note);
      child = spawn(PY, args, { cwd: REPO_ROOT, detached: true, stdio });
    }
    child.on("error", (e) => onExit(null, `起動失敗: ${e.message}`));
    child.on("exit", (code) => onExit(code));
    child.unref();
  } catch {
    active = Math.max(0, active - 1);
    return Response.json({ error: "スクリーナの起動に失敗しました" }, { status: 500 });
  } finally {
    if (logFd !== null) {
      try {
        closeSync(logFd); // fd は子へ dup 済み。親側は閉じる
      } catch {
        /* noop */
      }
    }
  }

  return Response.json({ jobId, mode: isUrl ? "agent" : "screen" }, { status: 202 });
}
