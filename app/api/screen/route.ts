import { promises as fs } from "node:fs";
import { existsSync, openSync, closeSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, execFile, type StdioOptions } from "node:child_process";
import { promisify } from "node:util";
import type { ScreenStore, ScreenEntry } from "@/app/lib/types";

const execFileP = promisify(execFile);

export const dynamic = "force-dynamic";

const REPO_ROOT = path.join(process.cwd(), "..");
const SCREEN_PATH = path.join(REPO_ROOT, "output", "screen.json");
const PY = path.join(REPO_ROOT, ".venv", "bin", "python");
const PROMPT_PATH = path.join(REPO_ROOT, "pipeline", "screen_prompt.md");
const PROMPT_ENRICH_PATH = path.join(REPO_ROOT, "pipeline", "screen_enrich_prompt.md");
const LOG_DIR = path.join(REPO_ROOT, "logs");
// 定性判定の質を優先し既定は sonnet。コスト最小化したい場合は env で haiku 等に上書き可。
const AGENT_MODEL = process.env.SCREEN_AGENT_MODEL || "claude-sonnet-4-6";
// 同時起動の上限（ループバック前提でも暴走/直接API連打を防ぐプロセス内ガード）
const MAX_ACTIVE = Number(process.env.SCREEN_MAX_ACTIVE || 4);
let active = 0;

const EMPTY: ScreenStore = { screens: [] };

// 既存エントリの機械結果を agent プロンプトへ注入する要約（ニュース定性判定の文脈）
function mechSummary(e: ScreenEntry): string {
  const lines: string[] = [];
  const t = e.trend;
  if (t) lines.push(`- トレンド: ${t.status ?? "-"}（株価${t.cur ?? "-"} / SMA25 ${t.sma25 ?? "-"} / SMA75 ${t.sma75 ?? "-"} / 乖離${t.dist_pct ?? "-"}% / RSI ${t.rsi ?? "-"}）`);
  const g = e.growth;
  if (g) lines.push(`- 成長: pass=${g.growth_pass} / score=${g.growth_score ?? "-"} / rev_yoy=${g.rev_yoy != null ? (g.rev_yoy * 100).toFixed(1) + "%" : "-"} / 次回決算~${g.next_disclosure_est ?? "-"}`);
  const v = e.valuation;
  if (v) lines.push(`- バリュエーション: PER ${v.per ?? v.forward_per ?? "-"} / PBR ${v.pbr ?? "-"} / ROE ${v.roe_pct ?? "-"}%（セクター中央値 PER ${v.sector_med_per ?? "-"} / PBR ${v.sector_med_pbr ?? "-"} / ROE ${v.sector_med_roe ?? "-"}%）`);
  const ea = e.earnings;
  if (ea) lines.push(`- 直近決算(${ea.period ?? "-"} ${ea.disclosed ?? ""}): 売上YoY ${ea.sales_yoy ?? "-"}% / 営業益YoY ${ea.op_yoy ?? "-"}% / 通期進捗 売上${ea.sales_progress ?? "-"}%・営業益${ea.op_progress ?? "-"}%`);
  return lines.length ? lines.join("\n") : "(機械結果なし)";
}

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
  let body: { input?: string; note?: string; enrich?: string };
  try {
    body = (await req.json()) as { input?: string; note?: string; enrich?: string };
  } catch {
    return Response.json({ error: "JSON 本文が不正です" }, { status: 400 });
  }

  const input = (body.input ?? "").trim();
  const note = (body.note ?? "").trim();
  const enrich = (body.enrich ?? "").trim(); // 詳細取得: 既存ジョブIDへニュース＋定性を付与
  if (note.length > 4000) {
    return Response.json({ error: "note が長すぎます" }, { status: 400 });
  }
  if (active >= MAX_ACTIVE) {
    return Response.json({ error: "混雑中です。少し待って再試行してください。" }, { status: 429 });
  }

  // 起動コマンドを構築（enrich / URL / コード の3経路）。共通の spawn 部は後段で一度だけ。
  let jobId: string;
  let mode: "agent" | "screen";
  let bin: string;
  let args: string[];
  let doStub = false;

  if (enrich) {
    // 詳細取得（N: 直近ニュース＋定性判定をオンデマンドで既存ジョブに付与）
    if (!/^\d+-[a-z0-9]+$/i.test(enrich)) {
      return Response.json({ error: "enrich ジョブID が不正です" }, { status: 400 });
    }
    let entry: ScreenEntry | null = null;
    try {
      const store = JSON.parse(await fs.readFile(SCREEN_PATH, "utf-8")) as ScreenStore;
      entry = (store.screens ?? []).find((s) => s.id === enrich) ?? null;
    } catch {
      /* 後段で未存在として弾く */
    }
    if (!entry || !entry.code) {
      return Response.json({ error: "対象ジョブが見つかりません（先に機械スクリーニングしてください）" }, { status: 400 });
    }
    jobId = enrich;
    mode = "agent";
    // 再実行前に前回の worker_exit/verdict/news を消す（古い終了情報でポーリングが即完了扱いに
    // なり「取得中」表示と二重起動防止が壊れるのを防ぐ）。
    try {
      await execFileP(PY, ["-m", "pipeline.screen", "--clear-enrich", "--job", jobId],
        { cwd: REPO_ROOT, timeout: 10_000 });
    } catch {
      /* 失敗してもポーリングは新しい worker_exit/verdict で吸収される */
    }
    // ニュース検索は内部5桁(155A0)でなく一般の4桁証券コード(155A)を使う（検索精度）。
    const code4 = String(entry.code).replace(/0$/, "");
    // WebSearch でニュース検索→定性→既存ジョブへ attach。ツールは WebSearch/WebFetch と
    // pipeline.screen 限定 Bash のみ。広い設定許可は読まず(--setting-sources "")、MCP 無効化。
    const tmpl = await fs.readFile(PROMPT_ENRICH_PATH, "utf-8");
    const prompt = tmpl
      .replaceAll("{{INPUT}}", code4)
      .replaceAll("{{NAME}}", String(entry.name ?? entry.code))
      .replaceAll("{{NOTE}}", note || entry.note || "(なし)")
      .replaceAll("{{JOB}}", jobId)
      .replaceAll("{{MECH}}", mechSummary(entry));
    bin = resolveClaudeBin();
    args = [
      "-p", prompt, "--model", AGENT_MODEL,
      "--tools", "WebSearch", "WebFetch", "Bash",
      "--allowedTools", "WebSearch", "WebFetch", "Bash(.venv/bin/python -m pipeline.screen:*)",
      "--setting-sources", "", "--strict-mcp-config", "--output-format", "json",
    ];
  } else {
    if (!input || input.length > 2000) {
      return Response.json({ error: "input が空、または長すぎます" }, { status: 400 });
    }
    jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    doStub = true;
    const isUrl = /^https?:\/\//i.test(input);
    if (isUrl) {
      // URL → ヘッドレス Claude Code が読解→ticker特定→python機械スクリーナ→定性判定→attach。
      mode = "agent";
      const tmpl = await fs.readFile(PROMPT_PATH, "utf-8");
      const prompt = tmpl
        .replaceAll("{{INPUT}}", input)
        .replaceAll("{{NOTE}}", note || "(なし)")
        .replaceAll("{{JOB}}", jobId);
      bin = resolveClaudeBin();
      args = [
        "-p", prompt, "--model", AGENT_MODEL,
        "--tools", "WebFetch", "Bash",
        "--allowedTools", "WebFetch", "Bash(.venv/bin/python -m pipeline.screen:*)",
        "--setting-sources", "", "--strict-mcp-config", "--output-format", "json",
      ];
    } else {
      // コード/銘柄名 → python 機械スクリーナを直接（定性判定なし・即時）
      mode = "screen";
      bin = PY;
      args = ["-m", "pipeline.screen", input, "--job", jobId, "--json"];
      if (note) args.push("--note", note);
    }
  }

  // 「処理中」エントリを先に作る（新規ジョブのみ。enrich は既存エントリを更新するため不要）
  if (doStub) {
    try {
      const stubArgs = ["-m", "pipeline.screen", "--stub", "--job", jobId, input];
      if (note) stubArgs.push("--note", note);
      await execFileP(PY, stubArgs, { cwd: REPO_ROOT, timeout: 10_000 });
    } catch {
      /* stub失敗はワーカーが後でエントリを作るため致命ではない */
    }
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
    const child = spawn(bin, args, { cwd: REPO_ROOT, detached: true, stdio });
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

  return Response.json({ jobId, mode }, { status: 202 });
}
