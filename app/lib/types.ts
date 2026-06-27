// signals.json のスキーマ定義

export interface Candidate {
  code: string;
  name: string;
  sector: string;
  market: string;
  setup_type: string;
  as_of: string;
  available_at: string | null;
  trigger_price: number;
  stop_loss: number;
  tp_first: number;
  trail_note: string;
  shares: number;
  invested: number;
  risk_yen: number;
  effective_r_pct: number;
  rsi14: number;
  atr14: number;
  dist_sma25_pct: number;
  turnover_oku: number;
  rs120: number | null; // 中期相対強さ%
  rs_healthy: boolean; // 中期トレンド健全帯 -4〜23%
  mid_liquidity: boolean; // 中型流動性帯
  edge_aligned: boolean; // = mid_liquidity AND rs_healthy AND 押し目
  // Layer2 成長フィルタ（daily_growth.py が付与）
  edge_full?: boolean; // = edge_aligned AND growth_pass
  growth_pass?: boolean | null;
  growth_score?: number | null;
  growth_rev_yoy?: number | null;
  next_disclosure_est?: string | null;
}

export type RegimeLabel = "risk_on" | "neutral" | "risk_off";

export interface Regime {
  label: RegimeLabel;
  // Layer0-A 大型株ブレッドス
  breadth: number;
  market_regime: RegimeLabel;
  risk_on_threshold: number;
  // Layer0-B グロース市場ブレッドス
  growth_breadth?: number | null;
  growth_regime?: RegimeLabel | null;
  growth_riskon_threshold?: number;
}

export interface SignalsData {
  generated_at: string | null;
  as_of: string | null;
  regime: Regime | null;
  n_candidates: number;
  n_edge_aligned: number;
  n_edge_full?: number; // daily_growth.py が付与
  candidates: Candidate[];
}

// API レスポンス（ファイル未存在などの状態を含む）
export interface SignalsResponse extends SignalsData {
  ok: boolean;
  message: string | null;
}

// チャートデータ（output/charts/{code}.json）
export interface Candle {
  time: string; // YYYY-MM-DD
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface TimeValue {
  time: string;
  value: number;
}

export interface ChartLevels {
  trigger_price: number;
  stop_loss: number;
  tp_first: number;
}

export interface ChartData {
  code: string;
  name: string;
  as_of: string;
  edge_aligned: boolean;
  candles: Candle[];
  volume: TimeValue[];
  sma25: TimeValue[];
  sma75: TimeValue[];
  rsi14: TimeValue[];
  levels: ChartLevels;
}

export interface ChartIndexItem {
  code: string;
  name: string;
  edge_aligned: boolean;
}

export interface ChartIndex {
  as_of: string | null;
  charts: ChartIndexItem[];
}

// ペーパートレード
export interface PaperPosition {
  code: string;
  name: string;
  entry_date: string;
  entry_price: number;
  stop_loss: number;
  tp_first: number;
  shares: number;
  risk_yen: number;
  half_taken: boolean;
  edge_aligned?: boolean;
  edge_full?: boolean;
  rs120?: number | null;
  current_price?: number | null;
  price_date?: string | null;
}

export interface PaperClosed {
  code: string;
  name: string;
  entry_date: string;
  entry_price: number;
  exit: number;
  shares: number;
  pnl: number;
  type: string;
  date: string;
  reason: string;
}

export interface PaperPositionsData {
  positions: PaperPosition[];
  closed: PaperClosed[];
  equity: number;
  started_at: string;
  // v2 DDトラッキング
  high_equity?: number;
  month_start?: string;
  month_start_equity?: number;
  dd_stopped?: boolean;
  dd_stop_reason?: string | null;
}

export type PaperLogType = "entry" | "half_profit" | "stop_loss" | "trail_exit" | "time_exit";

export interface PaperLogEntry {
  date: string;
  code: string;
  name: string;
  type: PaperLogType;
  entry: number;
  shares: number;
  stop_loss?: number;
  tp_first?: number;
  exit?: number;
  pnl?: number;
  reason?: string;
  exposure?: number; // レジーム別エクスポージャー係数（1.0 = risk_on）
}

// ポートフォリオ建玉（localStorage に永続化）
export interface Position {
  id: string;
  code: string;
  name: string;
  shares: number;
  buyPrice: number; // 取得単価
  buyDate: string; // 取得日 YYYY-MM-DD
  stopLoss: number; // 損切価格
  currentPrice: number | null; // 現在値（手入力）
}
