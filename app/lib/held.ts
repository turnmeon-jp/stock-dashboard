// 保有中コードの取得（出口監視データ由来）。候補/ウォッチ/厳選の各カードに
// 「📌保有中」ガードを出すためのヘルパー。
// 背景（2026-07-09）: 保有銘柄が✅押し目候補として表示され、ナンピン（買い下がり）を
// 誘発しかけた。✅は新規目線の判定であり、保有銘柄への追加は出口監視の🔼
// （フリーロール=追加しても最悪で建値撤退が成立する時のみ）が唯一の正。
export const HELD_NOTE =
  "保有中: この表示は新規目線の判定。買い増しの判断は出口監視の🔼（フリーロール成立時のみ）を見る";

export async function fetchHeldCodes(): Promise<Set<string>> {
  try {
    const r = await fetch("/api/exit-monitor");
    if (!r.ok) return new Set();
    const d = await r.json();
    return new Set<string>(
      ((d.holdings ?? []) as { code?: string }[]).map((h) => h.code ?? "").filter(Boolean)
    );
  } catch {
    return new Set();
  }
}
