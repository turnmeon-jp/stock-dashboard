// 増資/希薄化の機械検知（pipeline/dilution_check.py が生成する output/dilution_flags.json）。
// EDINET documents.json のメタデータのみで判定した一次候補（過検出側に倒す設計＝偽陽性許容）。
// 除外はしない・警告バッジのみ（最終判断はドシエ/人間の精査）。

export interface DilutionFlag {
  date: string;
  doc_description: string;
  doc_type: string;
  docID: string;
}

// GET /api/dilution のレスポンス（銘柄コード→フラグ配列。該当なしの銘柄はキー自体が存在しない）。
export type DilutionFlagsResponse = Record<string, DilutionFlag[]>;

/** 全銘柄分の増資/希薄化フラグを一度だけ取得（カード/行毎の個別fetchを避ける想定）。 */
export async function fetchDilutionFlags(): Promise<DilutionFlagsResponse> {
  try {
    const r = await fetch("/api/dilution", { cache: "no-store" });
    if (!r.ok) return {};
    const d = (await r.json()) as DilutionFlagsResponse;
    return d && typeof d === "object" ? d : {};
  } catch {
    return {};
  }
}

export interface DilutionBadge {
  label: string;
  tone: string;
  title: string;
}

/** flags が非空なら警告バッジを返す（該当なし/未生成は null）。 */
export function dilutionBadge(flags: DilutionFlag[] | null | undefined): DilutionBadge | null {
  if (!flags || flags.length === 0) return null;
  const latest = [...flags].sort((a, b) => b.date.localeCompare(a.date))[0];
  const extra = flags.length > 1 ? `（他${flags.length - 1}件）` : "";
  return {
    label: "⚠増資届出",
    tone: "bg-amber-100 text-amber-700",
    title: `${latest.date} ${latest.doc_description}${extra}`,
  };
}
