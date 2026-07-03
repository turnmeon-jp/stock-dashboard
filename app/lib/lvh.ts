// アクティビスト大量保有報告の日次検知（pipeline/lvh_monitor.py が生成する output/lvh_alerts.json）。
// イベントスタディ（output/lvh_event_study_report.md）で+60営業日勝率55.6%（辛勝・CI下限は僅かに
// マイナス）を確認済みだが、対照群（運用会社等・事業会社）は全ホライズンで中央値マイナスのため、
// 機械トリガーにはしない。注意喚起バッジ＋事後測定（candidate_ledger system=lvh_activist）のみ。
// 除外はしない・警告バッジのみ（最終判断は人間の精査）。DilutionWarning と同じパターン。

export interface LvhAlert {
  date: string;
  code: string;
  name: string | null;
  filer: string;
  filer_class: string;
  doc_description: string;
  docID: string;
}

export interface LvhAlertsResponse {
  alerts: LvhAlert[];
  generated_at: string | null;
}

const EMPTY_RESPONSE: LvhAlertsResponse = { alerts: [], generated_at: null };

/** 全アラート（直近60日・新しい順）を一度だけ取得（カード/行毎の個別fetchを避ける想定）。 */
export async function fetchLvhAlerts(): Promise<LvhAlertsResponse> {
  try {
    const r = await fetch("/api/lvh", { cache: "no-store" });
    if (!r.ok) return EMPTY_RESPONSE;
    const d = (await r.json()) as LvhAlertsResponse;
    return d && Array.isArray(d.alerts) ? d : EMPTY_RESPONSE;
  } catch {
    return EMPTY_RESPONSE;
  }
}

/** 銘柄コード→アラート配列。バッジ表示側での個別フィルタを避けるための共通ヘルパー。 */
export function groupLvhAlertsByCode(alerts: LvhAlert[]): Map<string, LvhAlert[]> {
  const m = new Map<string, LvhAlert[]>();
  for (const a of alerts) {
    const arr = m.get(a.code);
    if (arr) arr.push(a);
    else m.set(a.code, [a]);
  }
  return m;
}

export interface LvhBadge {
  label: string;
  tone: string;
  title: string;
}

const LVH_CAVEAT =
  "イベントスタディ+60営業日勝率55.6%（辛勝）。運用会社等の届出は逆効果＝注意喚起であり売買シグナルではありません。";

/** アラートが非空なら注意喚起バッジを返す（該当なし/未生成は null）。 */
export function lvhBadge(alerts: LvhAlert[] | null | undefined): LvhBadge | null {
  if (!alerts || alerts.length === 0) return null;
  const latest = [...alerts].sort((a, b) => b.date.localeCompare(a.date))[0];
  const extra = alerts.length > 1 ? `（他${alerts.length - 1}件）` : "";
  return {
    label: "🎯大量保有",
    tone: "bg-fuchsia-100 text-fuchsia-700",
    title: `${latest.date} ${latest.filer}${extra}。${LVH_CAVEAT}`,
  };
}
