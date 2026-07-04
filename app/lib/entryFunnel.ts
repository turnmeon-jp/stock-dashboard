import { promises as fs } from "node:fs";
import path from "node:path";

// エントリー厳選ファネル（pipeline/entry_funnel.py が生成する output/entry_funnel.json）。
// 「レジームゲート → エッジ整合 → ×成長 → ドシエ拒否権」の join 結果スナップショット。
// 判定の正本は各生成元（daily_signals / daily_growth / dossier）。
const FUNNEL_PATH = path.join(process.cwd(), "..", "output", "entry_funnel.json");

export interface FunnelStage {
  key: string; // all | edge | edge_growth | dossier
  label: string;
  n: number;
}

export interface FunnelGate {
  stance: "normal" | "half" | "stop" | string;
  note: string;
}

export interface FunnelRegime {
  label: string;
  market_regime?: string;
  growth_regime?: string;
  breadth?: number | null;
  growth_breadth?: number | null;
}

// signals.json の candidate をそのまま引き継ぎ、entry_funnel.py が join フィールドを付与
export interface FunnelEntry {
  code: string;
  name: string;
  sector: string;
  market?: string;
  setup_type?: string;
  as_of?: string;
  available_at?: string;
  // 注文プラン（IFDOCO: trigger=IFD買い / stop_loss=OCO損切 / tp_first=OCO利確）
  trigger_price: number | null;
  stop_loss: number | null;
  tp_first: number | null;
  trail_note?: string | null;
  shares: number | null;
  invested: number | null;
  risk_yen: number | null;
  effective_r_pct: number | null;
  // テクニカル・成長
  rsi14?: number | null;
  atr14?: number | null;
  dist_sma25_pct?: number | null;
  rs120?: number | null;
  turnover_oku?: number | null;
  growth_pass?: boolean | null;
  growth_score?: number | null;
  growth_rev_yoy?: number | null;
  next_disclosure_est?: string | null;
  // 需給タグ（margin_tags.py 由来。marginBadge で表示）
  margin_ratio?: number | null;
  long_per_adv?: number | null;
  short_zero?: boolean | null;
  margin_as_of?: string | null;
  // 報告空売り残高タグ（short_tags.py 由来。shortBadge で表示）
  short_reported?: boolean | null;
  short_sum?: number | null;
  short_n_filers?: number | null;
  short_as_of?: string | null;
  // entry_funnel.py の join フィールド
  dossier_call: string | null; // null = 未審査（ドシエ未生成）
  dossier_as_of?: string | null;
  change_trigger?: boolean;
  revision_pct?: number | null;
  revision_date?: string | null;
  // 黒字転換（変化トリガー族。actual=実績の負→正 / forecast=赤字直後の黒字予想初出）
  turnaround_kind?: "actual" | "forecast" | string | null;
  turnaround_date?: string | null;
  turnaround_recent?: boolean;
  lvh_recent?: boolean;
  in_watchlist?: boolean;
}

export interface FunnelRejected {
  code: string;
  name: string;
  sector?: string;
  dossier_call: string;
  dossier_rationale?: string | null;
  dossier_as_of?: string | null;
}

export interface FunnelLvhAlert {
  date: string;
  code: string;
  name: string;
  filer: string;
  filer_class?: string;
  doc_description?: string;
  docID?: string;
  in_candidates?: boolean;
}

export interface EntryFunnelResponse {
  ok: boolean;
  message: string | null;
  generated_at: string | null;
  as_of: string | null;
  regime: FunnelRegime | null;
  gate: FunnelGate | null;
  funnel: FunnelStage[];
  n_pending_dossier: number;
  entries: FunnelEntry[];
  rejected: FunnelRejected[];
  lvh_recent: FunnelLvhAlert[];
}

function empty(message: string, ok: boolean): EntryFunnelResponse {
  return {
    ok, message, generated_at: null, as_of: null, regime: null, gate: null,
    funnel: [], n_pending_dossier: 0, entries: [], rejected: [], lvh_recent: [],
  };
}

export async function readEntryFunnel(): Promise<EntryFunnelResponse> {
  let raw: string;
  try {
    raw = await fs.readFile(FUNNEL_PATH, "utf-8");
  } catch {
    return empty(
      "entry_funnel.json がまだ生成されていません。pipeline/entry_funnel.py を実行してください。",
      true
    );
  }
  let data: Partial<EntryFunnelResponse>;
  try {
    data = JSON.parse(raw) as Partial<EntryFunnelResponse>;
  } catch {
    return empty("entry_funnel.json の解析に失敗しました（JSON エラー）。", false);
  }
  return {
    ok: true,
    message: (data.message as string | null) ?? null,
    generated_at: data.generated_at ?? null,
    as_of: data.as_of ?? null,
    regime: data.regime ?? null,
    gate: data.gate ?? null,
    funnel: Array.isArray(data.funnel) ? data.funnel : [],
    n_pending_dossier: typeof data.n_pending_dossier === "number" ? data.n_pending_dossier : 0,
    entries: Array.isArray(data.entries) ? data.entries : [],
    rejected: Array.isArray(data.rejected) ? data.rejected : [],
    lvh_recent: Array.isArray(data.lvh_recent) ? data.lvh_recent : [],
  };
}
