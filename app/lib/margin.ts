// 信用残の需給タグ（pipeline/margin_tags.py が daily_signals.py / watchlist.py で
// 候補・ウォッチ銘柄に付与。output/margin_stratify_report.md の検証結果に基づく）。
//
// バックテスト層別（edge_aligned トレード・10年）: 信用倍率(LongVol/ShrtVol) と
// 買い残/20日平均出来高 で層別すると OOS +0.33R/+0.40R差・銘柄ブロックブートストラップ
// 95%CI下限>0 で事前固定の合格基準を満たした。方向は「倍率高・買残厚いほど良い」
// （本質は売り残の薄さ=空売り圧の不在の可能性。ShrtVol=0群=非貸借銘柄が最好成績）。
// 2025年偏重の留意があるため、まだ機械フィルタにはせず参考タグ表示＋台帳での事後測定に留める。
//
// IS固定境界（pipeline/margin_tags.py・backtest/margin_stratify.py と同一値。変えない）。
export const MARGIN_RATIO_Q1 = 1.128;
export const MARGIN_RATIO_Q2 = 6.918;

export interface MarginTags {
  margin_ratio: number | null;
  long_per_adv: number | null;
  short_zero: boolean | null;
  margin_as_of: string | null;
}

export interface MarginBadge {
  label: string;
  tone: string;
  title: string;
}

// 報告空売り残高タグ（pipeline/short_tags.py。has_short二値が OOS差+0.139R・CI下限+0.008>0 で
// 事前基準合格 = 「大口空売り報告なし側が良い」。output/short_stratify_report.md 参照。
// タグ表示のみ＝機械フィルタではない。0.5%未満は報告義務がなく観測不能。
export interface ShortTags {
  short_reported?: boolean | null;
  short_sum?: number | null;
  short_n_filers?: number | null;
  short_as_of?: string | null;
}

/** 大口空売りバッジ。報告あり（0.5%以上の残高が現存）のときだけ表示（報告なしが多数派のため）。 */
export function shortBadge(t: ShortTags | null | undefined): MarginBadge | null {
  if (!t || !t.short_reported) return null;
  const sum = t.short_sum != null ? `${(t.short_sum * 100).toFixed(2)}%` : "-";
  return {
    label: "空売り残",
    tone: "bg-rose-50 text-rose-600",
    title: `機関の空売り残高報告あり: 合計${sum}・${t.short_n_filers ?? "-"}者` +
      (t.short_as_of ? `（${t.short_as_of}時点）` : "") +
      "。検証では報告なし側が+0.14R優位（タグ表示のみ・除外条件ではない）",
  };
}

/** 需給バッジ（参考情報。除外条件ではない・警告トーンにしない）。
 *  緑「需給◎」= margin_ratio >= q2 または short_zero（売残ゼロ=非貸借。倍率の分母ゼロ別枠）
 *  灰橙「需給重」= margin_ratio < q1
 *  それ以外・データ無しはバッジなし。 */
export function marginBadge(t: Partial<MarginTags> | null | undefined): MarginBadge | null {
  if (!t) return null;
  const { margin_ratio = null, long_per_adv = null, short_zero = null, margin_as_of = null } = t;
  const detail =
    `信用倍率(LongVol/ShrtVol)=${margin_ratio != null ? margin_ratio.toFixed(2) : "-"}` +
    ` / 買残÷20日平均出来高=${long_per_adv != null ? long_per_adv.toFixed(2) : "-"}` +
    (margin_as_of ? `（${margin_as_of}時点）` : "");

  if (short_zero) {
    return { label: "需給◎", tone: "bg-emerald-100 text-emerald-700", title: `売残ゼロ(非貸借)。${detail}` };
  }
  if (margin_ratio != null && margin_ratio >= MARGIN_RATIO_Q2) {
    return { label: "需給◎", tone: "bg-emerald-100 text-emerald-700", title: detail };
  }
  if (margin_ratio != null && margin_ratio < MARGIN_RATIO_Q1) {
    return { label: "需給重", tone: "bg-orange-50 text-orange-600", title: detail };
  }
  return null;
}
