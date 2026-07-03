// signals.json のスキーマ定義

// exit_monitor.json の add_on（買い増し=利乗せ限定レコメンド）。含み損銘柄は構造的に
// eligible にならない設計（ナンピン誘発の防止。pipeline/exit_monitor.py の analyze_holding 参照）。
export interface ExitAddOn {
  eligible: boolean;
  add_shares: number;
  limit: number | null;
  blended_cost: number | null;
  stop: number | null;
  reason: string | null;
}

// exit_monitor.json のスキーマ（出口監視）
export interface ExitHolding {
  code: string;
  name: string;
  shares: number;
  cost: number;
  theme?: string;
  cur?: number;
  pl_pct?: number;
  sma25?: number;
  sma75?: number;
  dist_pct?: number;
  stop_level?: number;
  action?: string;
  error?: string;
  add_on?: ExitAddOn;
}

export interface ExitWatch {
  code: string;
  name: string;
  cur?: number;
  sma25?: number;
  sma75?: number;
  dist_pct?: number;
  rsi?: number;
  status?: string;
  error?: string;
}

export interface ExitMonitorData {
  updated: string;
  regime: string;
  holdings: ExitHolding[];
  watchlist: ExitWatch[];
  theme_concentration: Record<string, number>;
}

// screen.json のスキーマ（気になる銘柄スクリーナー）
export interface ScreenTrend {
  code: string;
  name: string;
  cur?: number;
  sma25?: number;
  sma75?: number;
  dist_pct?: number;
  rsi?: number;
  status?: string;
  error?: string;
}

export interface ScreenGrowth {
  growth_pass?: boolean | null;
  growth_score?: number | null;
  rev_yoy?: number | null;
  as_of?: string | null;
  next_disclosure_est?: string | null;
  error?: string;
}

export interface ScreenConcentration {
  theme_concentration: Record<string, number>;
  warn?: string | null;
}

export interface ScreenSource {
  url?: string;
  title?: string;
  summary?: string;
  catalyst?: string;
}

export interface ScreenVerdict {
  call?: string;
  trend_read?: string;
  growth_read?: string;
  risk?: string;
  rationale?: string;
  judgment?: string; // 旧スキーマ後方互換
}

export interface ScreenReasoning {
  trend?: string;
  growth?: string;
  concentration?: string;
}

// 決算ハイライト（F・機械算出）
export interface ScreenEarnings {
  period?: string | null;
  disclosed?: string | null;
  sales?: number | null;
  op?: number | null;
  np?: number | null;
  sales_yoy?: number | null;
  op_yoy?: number | null;
  f_sales?: number | null;
  f_op?: number | null;
  sales_progress?: number | null;
  op_progress?: number | null;
}

// バリュエーション文脈（V・機械算出＋セクター中央値比較）
export interface ScreenValuation {
  per?: number | null;
  forward_per?: number | null;
  pbr?: number | null;
  roe_pct?: number | null;
  opm_pct?: number | null;
  fund_as_of?: string | null;
  sector?: string | null;
  sector_med_per?: number | null;
  sector_med_pbr?: number | null;
  sector_med_roe?: number | null;
}

// 直近ニュース1件（N・ヘッドレスagentがWebSearchで付与）
export interface ScreenNewsItem {
  date?: string | null;
  title?: string;
  takeaway?: string;
  url?: string;
  source?: string;
}

export interface ScreenEntry {
  id: string;
  input: string;
  note?: string | null;
  theme?: string | null;
  code?: string | null;
  name?: string | null;
  status: "processing" | "done" | "error";
  error?: string;
  candidates?: { code: string; name: string }[];
  screened_at?: string;
  trend?: ScreenTrend;
  growth?: ScreenGrowth;
  concentration?: ScreenConcentration;
  earnings?: ScreenEarnings; // F: 決算ハイライト
  valuation?: ScreenValuation; // V: バリュエーション文脈
  news?: ScreenNewsItem[]; // N: 直近ニュース（詳細取得で付与）
  reasoning?: ScreenReasoning; // 機械結果の「なぜ」（決定論・両経路）
  source?: ScreenSource; // ヘッドレスagentがURL要約を付与
  verdict?: ScreenVerdict; // ヘッドレスagentが定性落選判定を付与
  worker_exit?: { error?: string | null; at?: string }; // route がワーカー終了を記録
}

export interface ScreenStore {
  updated?: string;
  screens: ScreenEntry[];
}

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
  // 信用残の需給タグ（pipeline/margin_tags.py が付与。参考情報＝機械フィルタではない）
  margin_ratio?: number | null;
  long_per_adv?: number | null;
  short_zero?: boolean | null;
  margin_as_of?: string | null;
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

// 候補フォワード検証台帳の系統別成績（output/ledger_report.json）
export interface LedgerBucket {
  n: number;
  win_rate: number | null; // 超過リターン>0 の割合（0-1）
  median_excess: number | null; // 超過リターン中央値（比率。+1.2% は 0.012）
  mean_excess: number | null;
  tail_mean_top10pct: number | null; // 上位10%の平均（尾部の厚さ）
}

export interface LedgerReport {
  generated_at: string;
  n_ledger_rows: number;
  has_data: boolean; // false = まだ評価済み行なし（蓄積中）
  horizons: number[];
  systems: Record<string, Record<string, LedgerBucket>>; // systems[system][String(horizon)]
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
