import { promises as fs } from "node:fs";
import path from "node:path";

// 開示検知アラート（pipeline/disclosure_alerts.py が生成）。
// alerts = ウォッチ+厳選+保有銘柄の直近TDnet開示 / upcoming = ドシエwatch_points由来の予定日。
// 予定はLLM調査由来の近似で網羅性はない（正本は会社IR）。
const ALERTS_PATH = path.join(process.cwd(), "..", "output", "disclosure_alerts.json");

export interface DisclosureAlert {
  date: string;
  time?: string;
  code: string;
  name: string;
  title: string;
  pdf_url?: string;
  kind: "earnings" | "revision" | "buyback" | "dilution" | "other" | string;
  sources?: string[];
}

export interface UpcomingEvent {
  code: string;
  name: string;
  date: string;
  note?: string;
  sources?: string[];
}

export interface DisclosureAlertsResponse {
  ok: boolean;
  message: string | null;
  generated_at: string | null;
  as_of: string | null;
  n_targets: number;
  alerts: DisclosureAlert[];
  upcoming: UpcomingEvent[];
}

function empty(message: string | null, ok: boolean): DisclosureAlertsResponse {
  return { ok, message, generated_at: null, as_of: null, n_targets: 0, alerts: [], upcoming: [] };
}

export async function readDisclosureAlerts(): Promise<DisclosureAlertsResponse> {
  let raw: string;
  try {
    raw = await fs.readFile(ALERTS_PATH, "utf-8");
  } catch {
    return empty(null, true); // 未生成はバナー非表示（エラーにしない）
  }
  let data: Partial<DisclosureAlertsResponse>;
  try {
    data = JSON.parse(raw) as Partial<DisclosureAlertsResponse>;
  } catch {
    return empty("disclosure_alerts.json の解析に失敗しました。", false);
  }
  return {
    ok: true,
    message: null,
    generated_at: data.generated_at ?? null,
    as_of: data.as_of ?? null,
    n_targets: typeof data.n_targets === "number" ? data.n_targets : 0,
    alerts: Array.isArray(data.alerts) ? data.alerts : [],
    upcoming: Array.isArray(data.upcoming) ? data.upcoming : [],
  };
}
