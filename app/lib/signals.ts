import { promises as fs } from "node:fs";
import path from "node:path";
import type { SignalsResponse } from "@/app/lib/types";

// プロジェクト直上の output/signals.json を参照する。
// process.cwd() は dashboard/ を指すため、その親の output/ を見る。
const SIGNALS_PATH = path.join(process.cwd(), "..", "output", "signals.json");

function emptyResponse(message: string, ok: boolean): SignalsResponse {
  return {
    ok,
    message,
    generated_at: null,
    as_of: null,
    regime: null,
    n_candidates: 0,
    n_edge_aligned: 0,
    candidates: [],
  };
}

// サーバー側で signals.json を読み込む。ファイル未存在/解析失敗時は
// わかりやすいメッセージ付きの空レスポンスを返す。
export async function readSignals(): Promise<SignalsResponse> {
  let raw: string;
  try {
    raw = await fs.readFile(SIGNALS_PATH, "utf-8");
  } catch {
    return emptyResponse(
      "signals.json がまだ生成されていません。pipeline/daily_signals.py を実行してください。",
      true
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return emptyResponse("signals.json の読み込みに失敗しました（JSON 解析エラー）。", false);
  }

  const d = data as Partial<SignalsResponse>;
  // Pythonが str(None) を "None" 文字列で出力するケースを null に正規化
  const candidates = (Array.isArray(d.candidates) ? d.candidates : []).map((c) => ({
    ...c,
    available_at:
      !c.available_at || c.available_at === "None" || c.available_at === "null"
        ? null
        : c.available_at,
  }));
  const nEdgeAligned =
    typeof d.n_edge_aligned === "number"
      ? d.n_edge_aligned
      : candidates.filter((c) => c.edge_aligned).length;

  return {
    ok: true,
    message: candidates.length === 0 ? "本日のエントリー候補はありません。" : null,
    generated_at: d.generated_at ?? null,
    as_of: d.as_of ?? null,
    regime: d.regime ?? null,
    n_candidates: typeof d.n_candidates === "number" ? d.n_candidates : candidates.length,
    n_edge_aligned: nEdgeAligned,
    candidates,
  };
}
