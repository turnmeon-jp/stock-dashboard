import { promises as fs } from "node:fs";
import { openSync, closeSync } from "node:fs";
import path from "node:path";
import { spawn, execFile, type StdioOptions } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

export const dynamic = "force-dynamic";

const REPO_ROOT = path.join(process.cwd(), "..");
const PY = path.join(REPO_ROOT, ".venv", "bin", "python");
const DOSSIER_DIR = path.join(REPO_ROOT, "output", "dossiers");
const WATCHLIST_PATH = path.join(REPO_ROOT, "output", "watchlist.json");
const DOMAIN_SCREEN_PATH = path.join(REPO_ROOT, "output", "domain_screen.json");
const LOG_DIR = path.join(REPO_ROOT, "logs");
// ドシエは Opus 4.8 の長時間ジョブのため、screen の MAX_ACTIVE(4) とは
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

// 202レスポンスに載せる表示用の銘柄名（UIの「◯◯を生成中」表示のみに使う）。
// プロンプトへ渡す名前は pipeline/dossier.py 側（_display_name）が同じ順で解決する。
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

  const name = await resolveName(code);

  // 生成そのものは pipeline/dossier.py --run-one に委譲する（--batch と同一経路）。
  // 2026-08-04修正: 旧実装はここで claude CLI を直接組み立てていたが、pipeline 側が
  // 2026-07-05に「機械コンテキストのプロンプト埋め込み＋最終メッセージのresult回収
  // （ワーカーの書込権限ゼロ化）」へ移行したのに追従できず、{{CONTEXT_JSON}} 未展開のまま
  // 起動し、かつ誰も result を回収しないため常に「attach未実行」で error 化していた。
  // 起動条件を2箇所に持たない＝再発防止の本体。
  const args = ["-m", "pipeline.dossier", "--run-one", "--code", code];

  // 「処理中」エントリを先に作る（--stub は done を上書きしないため二重起動でも安全側）。
  // --run-one 側も冒頭で stub するが、ここで先に立てておくことで起動直後の GET/二重POSTが
  // 「未生成」に見える窓を塞ぐ。
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
  // （ランナーが kill/クラッシュで死ぬと「処理中」のまま永久に固まるため、exitCode に
  //   関わらず status を確認する）。
  async function finalizeExit(exitCode: number | null, errMsg?: string): Promise<void> {
    let status: string | undefined;
    try {
      const raw = await fs.readFile(dossierPath, "utf-8");
      status = (JSON.parse(raw) as { status?: string }).status;
    } catch {
      status = undefined;
    }
    if (status === "done") return; // 成果物が既にあるなら何もしない（上書きしない）
    // --run-one は失敗理由（タイムアウト/スキーマ検証不合格/result回収失敗）を自分で
    // error に記録して終わる。ここで一般化した文言を被せると真因が消えるので触らない。
    if (status === "error") return;
    const msg =
      errMsg ??
      (exitCode !== 0
        ? `ワーカー異常終了(code ${exitCode})`
        : "ランナーが完了記録を残さずに終了しました");
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
    const child = spawn(PY, args, { cwd: REPO_ROOT, detached: true, stdio });
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
