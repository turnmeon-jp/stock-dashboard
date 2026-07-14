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

// 時間ストップ（テーゼなし銘柄のデフォルト規律。pipeline/exit_monitor.py evaluate_time_stop 参照）
export interface ExitTimeStop {
  flag: "sell_candidate" | "warn" | null;
  note?: string;
  ret_pct?: number;
  window_bdays?: number;
  slope75_pct?: number;
}

// 保有銘柄の直近開示イベント（direction!=neutral のみ表示対象。pipeline/exit_monitor.py recent_events 参照）
export interface ExitEvent {
  date: string;
  kind: string;
  direction: "positive" | "negative" | "neutral";
  title: string;
}

// 保有テーゼの効力判定（pipeline/exit_monitor.py thesis_status 参照）
export interface ExitThesisStatus {
  mode: "event" | "income" | "expired" | "none";
  premise?: string | null;
  review_by?: string;
  days_left?: number;
  days_over?: number;
  falsifiers?: string[];
}

// 前回推奨の逆指値を割れたまま保有継続＝規律逸脱の検知（pipeline/exit_monitor.py detect_stop_breach 参照）
export interface ExitStopBreach {
  prev_date: string;
  prev_stop: number;
  gap_pct: number;
}

// テーゼの定性再点検（LLM等が事後に付与。まだ生成されていない銘柄では未設定）
export interface ExitThesisReview {
  verdict: "intact" | "weakened" | "broken";
  reviewed_at: string;
  summary: string;
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
  // 2026-07-04 保有フォローアップ拡張（後方互換のため全て optional）
  time_stop?: ExitTimeStop;
  events?: ExitEvent[];
  thesis_status?: ExitThesisStatus;
  stop_breach?: ExitStopBreach;
  thesis_review?: ExitThesisReview;
  // エントリー時の理由（holdings_cli --reason 由来）。剪定判断の文脈。null = 未記録。
  entry_reason?: string | null;
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

// 系統の昇格/廃止 判定（pipeline/candidate_ledger.py _verdict 参照・docs/ledger_criteria.md）。
// **候補の提示にすぎず、自動でエントリー条件・SOURCESを書き換える処理はない＝最終判断は人間。**
export type LedgerVerdict =
  | "insufficient_n"
  | "promote_candidate"
  | "demote_candidate"
  | "stale"
  | "watch";

// verdict の判定根拠（verdict_horizon＝既定20営業日のバケツのみを見る。他ホライズンは参考情報）
export interface LedgerVerdictDetail {
  n: number;
  median_excess: number | null;
  winrate: number | null; // win_rate ではなく winrate（Python側のキー名。バケツ側と綴りが異なる点に注意）
}

// config.yaml: ledger: セクション（判定基準。docs/ledger_criteria.md §2 に根拠）
export interface LedgerCriteria {
  verdict_horizon: number;
  min_n_promote: number;
  min_n_demote: number;
  promote_winrate: number;
  stale_days: number;
}

// systems[system] は "5"|"20"|"60"|"120" のホライズン別バケツと verdict/verdict_detail が
// 同階層に混在する（report() の出力形そのまま。ネストを変えていない）
export interface LedgerSystemReport {
  "5"?: LedgerBucket;
  "20"?: LedgerBucket;
  "60"?: LedgerBucket;
  "120"?: LedgerBucket;
  verdict?: LedgerVerdict;
  verdict_detail?: LedgerVerdictDetail;
}

export interface LedgerReport {
  generated_at: string;
  n_ledger_rows: number;
  has_data: boolean; // false = まだ評価済み行なし（蓄積中）
  horizons: number[];
  verdict_horizon?: number; // 判定に使うホライズン（既定20営業日）
  ledger_criteria?: LedgerCriteria;
  systems: Record<string, LedgerSystemReport>; // systems[system][String(horizon)] / .verdict / .verdict_detail
}

// api/ledger のレスポンス（ファイル欠損・解析失敗時は ok:false + message）
export interface LedgerReportResponse extends LedgerReport {
  ok: boolean;
  message: string | null;
}

// 実弾トレードの振り返り＝旧称ポストモーテム（output/real_postmortem.json）。逆解析の基準値（勝率21%・利小損大）と比較する趣旨。
export interface RealPostmortemTrade {
  code: string | null;
  name: string | null;
  date: string | null;
  holding_days: number | null;
  pl_pct: number | null;
  pl_yen: number | null;
  R: number | null;
  breach_days: number;
  timestop_first: string | null;
  days_after_timestop: number | null;
  exit_reason: string | null;
}

export interface RealPostmortemSummary {
  n: number;
  win_rate: number | null; // %（0-100）
  avg_win_pct: number | null;
  avg_loss_pct: number | null;
  payoff_ratio: number | null;
  median_holding_days: number | null;
  total_pl_yen: number;
  breach_trades: number; // 前回逆指値割れのまま保有継続した決済件数
}

export interface RealPostmortemData {
  generated_at: string;
  trades: RealPostmortemTrade[];
  summary: RealPostmortemSummary;
}

// 自動執行（output/execution_plan.json / execution_status.json）。
// mode: dry_run=模擬計算のみ / demo=証券会社デモ環境へ発注 / live=実弾発注。
export type ExecutionMode = "dry_run" | "demo" | "live" | string;

export interface ExecutionGuards {
  sent_today: number;
  daily_order_limit: number;
  max_order_yen: number;
  kill_switch: string | null; // null=平常 / 文字列=作動中（理由）
  unknown_count: number; // 応答不明の注文数（>0はCLI側で新規発注停止中の合図）
}

// excluded: null=承認可 / 文字列=見送り理由（ガードで弾かれた・寄り付き前計算不能等）
export interface ExecutionCandidate {
  code: string; // 立花コード（4桁、まれに5桁）
  jq_code: string; // J-Quants 5桁コード
  name: string;
  sector: string;
  setup_type: string;
  available_at: string;
  trigger_price: number;
  limit_price: number;
  shares: number;
  shares_original: number; // ガード（max_order_yen等）で縮小される前の株数
  est_cost: number;
  stop_loss: number;
  tp_first: number;
  rs120: number | null;
  // 16桁hex。承認/SL設置APIの整合性確認キー。excluded（見送り）行では null（承認対象外のため未発行）
  hash: string | null;
  excluded: string | null;
}

export interface ExecutionPlan {
  generated_at: string;
  as_of: string;
  mode: ExecutionMode;
  regime: { label: string; [key: string]: unknown };
  guards: ExecutionGuards;
  candidates: ExecutionCandidate[];
}

export type ExecutionIntentState =
  | "accepted"
  | "filled"
  | "partial"
  | "unknown"
  | "error"
  | "cancelled"
  | "approved" // Phase C+: 承認済・未発注（翌朝の寄り前ゲート判定待ち）
  | string;

export interface ExecutionIntent {
  intent_id: string;
  code: string;
  name: string;
  side: string;
  qty: number;
  state: ExecutionIntentState;
  order_number: string | null;
  limit_price: number | null;
  stop_trigger: number | null;
  updated_at: string;
  note?: string | null;
}

export interface ExecutionPosition {
  code: string;
  // バックエンド実装中（WP-A契約）。未実装期間は undefined/空文字のまま届き得る。
  name?: string;
  qty: number;
  sellable_qty: number;
}

export interface ExecutionNeedStop {
  code: string;
  name: string;
  qty: number;
  stop_trigger: number;
  hash: string;
}

// 寄り前ゲート（Phase C+）の銘柄別判定。execution.daily open-gate の出力契約。
export type ExecutionGateDecision =
  | "placed" // 発注した
  | "skipped_gate" // 気配が上限を超過等で見送り
  | "skipped_negative" // 悪材料検知で失効
  | "expired_stale" // 解禁日（stale）超過で失効
  | "rejected_guard" // ガード（日次枠・kill switch等）で拒否
  | "error"
  | string;

export interface ExecutionGateResult {
  code: string;
  name: string;
  decision: ExecutionGateDecision;
  gate_price: number | null; // 気配値。取得不能時 null
  limit_price: number;
  note: string;
  order_number: string; // 未発注（placed以外）は空文字
}

// status.gate はゲートを実行した日のみ存在するフィールド（未実行なら status.gate 自体が undefined）
export interface ExecutionGate {
  ran_at: string;
  results: ExecutionGateResult[];
}

export interface ExecutionStatus {
  updated: string;
  mode: ExecutionMode;
  kill_switch: string | null;
  daily: { sent: number; limit: number };
  unknown_count: number;
  intents: ExecutionIntent[];
  positions: ExecutionPosition[];
  need_stop: ExecutionNeedStop[];
  gate?: ExecutionGate;
}

// api/execution の GET レスポンス（未生成/破損は null・200。exit-monitor 流儀）
export interface ExecutionResponse {
  plan: ExecutionPlan | null;
  status: ExecutionStatus | null;
}

// 特殊状況（TOB/MBO裁定）。output/special_situations.json。観測モード
// （2026-07時点は売買判断材料ではなく、実測分布の蓄積が先。年率=スプレッド×365/(残日数+7)）。
export type SpecialSituationDealType = "TOB" | "MBO" | string;

export interface SpecialSituationActive {
  deal_key: string;
  target_code: string | null; // 抽出未完了(needs_review)ではnull
  target_name: string | null;
  bidder: string | null;
  deal_type: SpecialSituationDealType;
  offer_price: number | null; // 同上

  close: number | null;
  spread_pct: number | null;
  annualized_pct: number | null;
  period_start: string;
  period_end: string;
  days_left: number | null;
  premium_pct: number | null;
  conditions_note: string;
  needs_review: boolean;
  announced: string;
}

export interface SpecialSituationCompleted {
  deal_key: string;
  target_name: string;
  deal_type: SpecialSituationDealType;
  offer_price: number;
  announced: string;
  period_end: string;
  result_note: string | null;
}

export interface SpecialSituationNeedsReview {
  deal_key: string;
  target_name: string;
  announced: string;
  reason: string;
}

export interface SpecialSituationSummary {
  n_active: number;
  n_completed: number;
  avg_premium_pct: number | null;
}

export interface SpecialSituationsData {
  generated_at: string;
  as_of: string;
  note: string;
  active: SpecialSituationActive[];
  completed: SpecialSituationCompleted[];
  needs_review: SpecialSituationNeedsReview[];
  summary: SpecialSituationSummary;
}

// api/special-situations の GET レスポンス。exit-monitor 等と異なり「0件」と「夜バッチ未実行で
// ファイル自体が無い」を区別して空状態文言を出し分けるため exists フラグを明示する。
export interface SpecialSituationsResponse {
  exists: boolean;
  data: SpecialSituationsData | null;
}

// 候補のLLM精査バッジ（output/candidate_reviews.json）。落選判定エンジン（dossier.ts と同系統の
// 買い語彙なしスキーマ）を候補一覧に軽量表示するためのバッチ生成物。まだ検証台帳で判定力を
// 測定中の段階のため、veto（落選）判定でも承認ボタン等は封鎖しない＝最終判断は人間（WP-B仕様）。
export type CandidateReviewVerdict = "veto" | "pass" | "insufficient";
export type CandidateReviewConfidence = "high" | "low";

export interface CandidateReview {
  verdict: CandidateReviewVerdict;
  confidence: CandidateReviewConfidence;
  reasons: string[]; // 最大3件
  one_liner: string;
  reviewed_at: string; // YYYY-MM-DD
}

export interface CandidateReviewsData {
  updated: string; // iso秒
  reviews: Record<string, CandidateReview>; // key = jq_code（5桁）
}

// api/candidate-reviews の GET レスポンス。special-situations と同じ exists 流儀
// （夜バッチ未実行でファイル自体が無い状態と「0件」を区別し、未生成ならバッジ非表示にする）。
export interface CandidateReviewsResponse {
  exists: boolean;
  data: CandidateReviewsData | null;
}
