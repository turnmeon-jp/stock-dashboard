import type { CandidateReview, CandidateReviewsResponse } from "@/app/lib/types";

// 候補のLLM精査バッジ（output/candidate_reviews.json・WP-B）。ExecutionPanel.tsx から使う
// 共有部品（2026-07-15 CandidatesTable.tsx 削除に伴いここへ移設。実装は重複させない。
// 二重fetchは許容 = 各コンポーネントが自分のマウント時に一度だけ叩く）。
export const CANDIDATE_REVIEW_TITLE =
  "LLM落選判定（検証台帳で判定力を測定中・最終判断は人間）";

/** 候補のLLM精査一覧を一度だけ取得（jq_code→review のMap）。未生成/エラー時は空Map。 */
export async function fetchCandidateReviews(): Promise<Map<string, CandidateReview>> {
  try {
    const r = await fetch("/api/candidate-reviews", { cache: "no-store" });
    if (!r.ok) return new Map();
    const d = (await r.json()) as CandidateReviewsResponse;
    if (!d.exists || !d.data) return new Map();
    return new Map(Object.entries(d.data.reviews ?? {}));
  } catch {
    return new Map();
  }
}

const REVIEW_TONE: Record<CandidateReview["verdict"], string> = {
  veto: "bg-rose-100 text-rose-700",
  pass: "bg-emerald-100 text-emerald-700",
  insufficient: "bg-slate-100 text-slate-600",
};
const REVIEW_LABEL: Record<CandidateReview["verdict"], string> = {
  veto: "精査: 落選",
  pass: "精査: 通過",
  insufficient: "精査: 判定不能",
};

/** 未精査（review未取得）は非表示。vetoでも承認・発注系ボタンは封鎖しない（呼び出し側の責務）。 */
export function CandidateReviewBadge({ review }: { review?: CandidateReview | null }) {
  if (!review) return null;
  return (
    <span
      title={CANDIDATE_REVIEW_TITLE}
      className={`ml-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold cursor-help ${REVIEW_TONE[review.verdict]}`}
    >
      {REVIEW_LABEL[review.verdict]}
    </span>
  );
}
