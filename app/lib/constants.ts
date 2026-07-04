// 運用パラメータ

// 総資金は output/meta.json（app/lib/meta.ts の readMeta）から取得する。
// 実弾/ペーパーで金額が異なる（config.yaml capital.total / paper.capital_total）ため、
// ここでのハードコードは廃止（2026-07-04）。未取得時は各表示側で "-" にフォールバックする。

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
