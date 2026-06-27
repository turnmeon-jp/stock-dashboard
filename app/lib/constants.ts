// 運用パラメータ

// 総資金（円）
export const TOTAL_CAPITAL = 3_000_000;

// 集中対象とする上位件数（5銘柄集中）
export const TOP_N = 5;

// setup_type の日本語表示
export const SETUP_LABELS: Record<string, string> = {
  pullback: "押し目",
  breakout: "ブレイク",
  reversal: "反転",
};

export function setupLabel(t: string): string {
  return SETUP_LABELS[t] ?? t;
}
