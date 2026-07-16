import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readWatchlist } from "@/app/lib/watchlist";
import { WATCH_REASON_KEYS, DEFAULT_WATCH_REASON } from "@/app/lib/watchReasons";

const execFileP = promisify(execFile);

// リクエスト毎にファイルを読み直す（日次更新を即反映）。
export const dynamic = "force-dynamic";

const REPO_ROOT = path.join(process.cwd(), "..");
const PY = path.join(REPO_ROOT, ".venv", "bin", "python");
// 証券コード = 3数字 + 英数字1（4桁, 例 7203）、または末尾0を付けたJ-Quants 5桁（例 72030）。
// pipeline/screen.py の SEC_CODE/JQ_CODE と同じ許容範囲（最終検証は pipeline.watchlist 側でも行う）。
const CODE_RE = /^\d{3}[0-9A-Z]0?$/;
// 棚卸しフォームのイベント日（YYYY-MM-DD厳格。実在日かどうかの検証はCLI側）
const EVENT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NOTE_MAX_LEN = 100;

// action → pipeline.watchlist CLIフラグ / エラーメッセージ用ラベル
// （WP-A: exec_on/exec_off追加・WP-B: renew=棚卸し継続／retire=棚卸し除外を追加）
const ACTION_FLAGS = {
  add: "--add",
  remove: "--remove",
  exec_on: "--exec-on",
  exec_off: "--exec-off",
  renew: "--renew",
  retire: "--retire",
} as const;
const ACTION_LABELS: Record<keyof typeof ACTION_FLAGS, string> = {
  add: "追加",
  remove: "削除",
  exec_on: "自動執行ONへの切替",
  exec_off: "自動執行OFFへの切替",
  renew: "棚卸し継続",
  retire: "棚卸し除外",
};
type Action = keyof typeof ACTION_FLAGS;

// reason/event_date を受け付けるaction、note を受け付けるaction（それ以外に付いてきたら400。
// CLIに未対応の引数を渡さないための線引き）
const REASON_ACTIONS = new Set<Action>(["add", "renew"]);
const NOTE_ACTIONS = new Set<Action>(["add", "renew", "retire"]);
const REASON_KEY_SET = new Set(WATCH_REASON_KEYS);

export async function GET() {
  const data = await readWatchlist();
  return Response.json(data, { status: data.ok ? 200 : 500 });
}

export async function POST(req: Request) {
  let body: { code?: string; action?: string; reason?: string; note?: string; event_date?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "JSON 本文が不正です" }, { status: 400 });
  }

  const code = (body.code ?? "").trim().toUpperCase();
  const action = body.action as Action | undefined;
  // `in` はプロトタイプ継承キー（"toString"等）も通してしまい、未知actionが400でなく
  // execFile経路へ進み得る（codexレビューP2）。自身のキーのみ許可する
  if (!action || !Object.prototype.hasOwnProperty.call(ACTION_FLAGS, action)) {
    return Response.json(
      { error: "action は add / remove / exec_on / exec_off / renew / retire のいずれかです" },
      { status: 400 },
    );
  }
  if (!CODE_RE.test(code)) {
    return Response.json({ error: `コード形式が不正です: ${code}` }, { status: 400 });
  }

  // 棚卸し登録理由（5択のみ許可。domain_screen はバックエンド自動付与専用のためUI経由は拒否
  // - codexレビューP2の「許可リストのみ通す」方針を踏襲）
  let reason: string | undefined;
  if (REASON_ACTIONS.has(action)) {
    if (typeof body.reason === "string" && body.reason.trim() !== "") {
      reason = body.reason.trim();
      if (!REASON_KEY_SET.has(reason)) {
        return Response.json({ error: `reason が不正です: ${reason}` }, { status: 400 });
      }
    } else if (action === "add") {
      // 追加はCLI契約上reason必須。星ボタン等（発掘/執行/気になる銘柄タブ）はreasonを送らない
      // 旧フローのため、ここで既定値を補って後方互換を保つ（それらのUIは今回の変更対象外）
      reason = DEFAULT_WATCH_REASON;
    }
    // renewでreason省略時はundefinedのまま渡す＝理由設定済み銘柄の1タップ継続はCLI側が既存値を保持
  } else if (body.reason !== undefined) {
    return Response.json({ error: `action=${action} は reason を受け付けません` }, { status: 400 });
  }

  // メモ（改行を除去したうえで100字以内のみ許可）
  let note: string | undefined;
  if (NOTE_ACTIONS.has(action)) {
    if (typeof body.note === "string" && body.note.trim() !== "") {
      note = body.note.replace(/[\r\n]+/g, " ").trim();
      if (note.length > NOTE_MAX_LEN) {
        return Response.json({ error: `note は${NOTE_MAX_LEN}字以内です` }, { status: 400 });
      }
    }
  } else if (body.note !== undefined) {
    return Response.json({ error: `action=${action} は note を受け付けません` }, { status: 400 });
  }

  // イベント日（reason=event_wait時のみ意味を持つが、形式検証はaction単位で行う）
  let eventDate: string | undefined;
  if (REASON_ACTIONS.has(action)) {
    if (typeof body.event_date === "string" && body.event_date.trim() !== "") {
      eventDate = body.event_date.trim();
      if (!EVENT_DATE_RE.test(eventDate)) {
        return Response.json({ error: `event_date の形式が不正です: ${eventDate}` }, { status: 400 });
      }
    }
  } else if (body.event_date !== undefined) {
    return Response.json({ error: `action=${action} は event_date を受け付けません` }, { status: 400 });
  }

  const args = ["-m", "pipeline.watchlist", ACTION_FLAGS[action], code];
  if (reason) args.push("--reason", reason);
  if (note) args.push("--note", note);
  if (eventDate) args.push("--event-date", eventDate);

  try {
    await execFileP(PY, args, {
      cwd: REPO_ROOT,
      timeout: 30_000,
    });
  } catch (e) {
    const err = e as { stderr?: string; message?: string };
    const detail = (err.stderr || err.message || "unknown error").trim().slice(0, 500);
    return Response.json(
      { error: `${ACTION_LABELS[action]}に失敗しました: ${detail}` },
      { status: 500 },
    );
  }

  const data = await readWatchlist();
  return Response.json({ ok: true, action, code, watchlist: data }, { status: 200 });
}
