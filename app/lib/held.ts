// 保有中コードの取得（出口監視データ由来）。候補/ウォッチ/厳選の各カードに
// 「📌保有中」ガードを出すためのヘルパー。
// 背景（2026-07-09）: 保有銘柄が✅押し目候補として表示され、ナンピン（買い下がり）を
// 誘発しかけた。✅は新規目線の判定であり、保有銘柄への追加は出口監視の🔼
// （フリーロール=追加しても最悪で建値撤退が成立する時のみ）が唯一の正。
export const HELD_NOTE =
  "保有中: この表示は新規目線の判定。買い増しの判断は出口監視の🔼（フリーロール成立時のみ）を見る";

// 取得失敗は null を返す（「保有ゼロ」と区別する）。バッジ表示だけなら空集合に畳んで
// 構わないが、ExecutionPanel の承認ボタン封鎖のように「保有していないなら開ける」判定に
// 使う場合、失敗を空集合に見せると危険側（塞ぐべき行が開く）に倒れるため呼び出し側で
// 安全側へ倒せるようにしておく（2026-08-17）。
export async function fetchHeldCodes(): Promise<Set<string> | null> {
  try {
    const r = await fetch("/api/exit-monitor");
    if (!r.ok) return null;
    const d = await r.json();
    return new Set<string>(
      ((d.holdings ?? []) as { code?: string }[]).map((h) => h.code ?? "").filter(Boolean)
    );
  } catch {
    return null;
  }
}
