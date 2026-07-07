import { promises as fs } from "node:fs";
import path from "node:path";

// ウォッチリスト（pipeline/watchlist.py が生成）。domain_screen 通過銘柄に
// エントリータイミング＋IFDOCO注文設計を付与したもの。
// process.cwd() は dashboard/ を指すため、その親の output/ を見る（discover と同じ）。
const WATCHLIST_PATH = path.join(process.cwd(), "..", "output", "watchlist.json");

export interface WatchOrder {
  ifd_entry: number;
  // 寄成上限=指値+0.5%（2026-07-07 執行規約: 寄りがこれ以下なら寄成・超えたら見送り）。
  // 付与前の旧JSONでは欠損しうるため表示側で ifd_entry から補完する
  max_open?: number | null;
  oco_stop: number;
  oco_tp_first: number;
  rr_first: number | null;
  trail_note: string;
  shares: number | null;
  invested: number | null;
  risk_yen: number | null;
  effective_r_pct: number | null;
  size_note: string | null;
}

export interface WatchItem {
  code: string;
  name: string;
  sector: string;
  // 品質×成長（なぜウォッチか。domain_screen 由来）
  roic_median: number | null;
  sales_cagr: number | null;
  op_cagr: number | null;
  per: number | null;
  cfo_op: number | null;
  is_quiet: boolean | null;
  // エントリータイミング
  status: string;             // 買い場 / 押し目待ち / 過熱 / 待ち / 見送り
  status_detail: string;
  setup_active: string | null;
  as_of: string;
  available_at: string;
  close: number;
  dist_to_entry_pct: number | null;
  rsi14: number;
  sma25: number;
  sma75: number | null;
  // 注文設計
  order: WatchOrder | null;
  atr14: number;
  turnover_oku: number | null;
  // 由来: "manual" = watchlist_codes.json 経由の手動追加 / "domain_screen" = 自動通過
  source?: "manual" | "domain_screen" | null;
  // 合流バッジ（P4）: pipeline/watchlist.py 生成時に domain_screen / scored_universe.json と join。
  // 旧データ（再生成前）には無いことがあるため optional。
  is_domain?: boolean | null;
  edge_aligned?: boolean | null;
  growth_pass?: boolean | null;
  // 信用残の需給タグ（pipeline/margin_tags.py が付与。参考情報＝機械フィルタではない）
  margin_ratio?: number | null;
  long_per_adv?: number | null;
  short_zero?: boolean | null;
  margin_as_of?: string | null;
  // 報告空売り残高タグ（pipeline/short_tags.py が付与。タグ表示のみ）
  short_reported?: boolean | null;
  short_sum?: number | null;
  short_n_filers?: number | null;
  short_as_of?: string | null;
}

export interface Regime {
  label: string;
  market_regime?: string;
  growth_regime?: string;
}

export interface WatchlistResponse {
  ok: boolean;
  message: string | null;
  generated_at: string | null;
  as_of: string | null;
  regime: Regime | null;
  n: number;
  items: WatchItem[];
}

function empty(message: string, ok: boolean): WatchlistResponse {
  return { ok, message, generated_at: null, as_of: null, regime: null, n: 0, items: [] };
}

export async function readWatchlist(): Promise<WatchlistResponse> {
  let raw: string;
  try {
    raw = await fs.readFile(WATCHLIST_PATH, "utf-8");
  } catch {
    return empty(
      "watchlist.json がまだ生成されていません。pipeline/watchlist.py を実行してください。",
      true
    );
  }
  let data: Partial<WatchlistResponse>;
  try {
    data = JSON.parse(raw) as Partial<WatchlistResponse>;
  } catch {
    return empty("watchlist.json の解析に失敗しました（JSON エラー）。", false);
  }
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    ok: true,
    message: items.length === 0 ? "ウォッチ対象が空です。" : null,
    generated_at: data.generated_at ?? null,
    as_of: data.as_of ?? null,
    regime: data.regime ?? null,
    n: typeof data.n === "number" ? data.n : items.length,
    items,
  };
}
