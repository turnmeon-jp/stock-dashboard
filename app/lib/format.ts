// 数値フォーマットのユーティリティ

// 3桁区切り（整数）。null/NaN は "-"。
export function fmtInt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return Math.round(n).toLocaleString("ja-JP");
}

// 3桁区切り（小数。価格などで端数を保持）
export function fmtNum(
  n: number | null | undefined,
  digits = 1
): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return n.toLocaleString("ja-JP", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  });
}

// パーセント（小数を保持して % を付与）
export function fmtPct(
  n: number | null | undefined,
  digits = 1
): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return `${n.toLocaleString("ja-JP", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  })}%`;
}

// 円表記（3桁区切り + 円）
export function fmtYen(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "-";
  return `${fmtInt(n)}円`;
}
