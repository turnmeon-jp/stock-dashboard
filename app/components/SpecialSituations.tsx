"use client";

import { useEffect, useState } from "react";
import type {
  SpecialSituationActive,
  SpecialSituationsResponse,
} from "@/app/lib/types";
import { fmtInt, fmtPct } from "@/app/lib/format";

// 種別バッジ（既存トーンに合わせる: TOB=sky・MBO=violet）。未知の種別は中立色でフォールバック表示。
const DEAL_TYPE_BADGE: Record<string, string> = {
  TOB: "bg-sky-100 text-sky-700",
  MBO: "bg-violet-100 text-violet-700",
};
function dealTypeBadge(t: string): string {
  return DEAL_TYPE_BADGE[t] ?? "bg-slate-100 text-slate-600";
}

// null/undefined は "—"。それ以外は指定フォーマッタで表示。
function fmtOrDash(n: number | null | undefined, fmt: (v: number) => string): string {
  if (n === null || n === undefined) return "—";
  return fmt(n);
}

// スプレッド/年率の色調。マイナス（市場価格>買付価格＝対抗期待等）は rose、プラスは emerald。
function spreadTone(v: number | null | undefined): string {
  if (v === null || v === undefined) return "text-slate-400";
  if (v < 0) return "text-rose-600";
  if (v > 0) return "text-emerald-600";
  return "text-slate-600";
}

function ActiveRow({ d }: { d: SpecialSituationActive }) {
  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-2 whitespace-nowrap" title={d.conditions_note || undefined}>
        {d.needs_review && (
          <span title="条件の自動抽出に失敗。開示原文の確認が必要" className="mr-1 cursor-help">
            ⚠️
          </span>
        )}
        {/* target_code は抽出未完了(needs_review)の案件で null になり得る（codexレビューP2） */}
        <span className="font-mono text-xs text-slate-500">{d.target_code ? d.target_code.replace(/0$/, "") : "—"}</span>{" "}
        <span className="font-medium">{d.target_name || "(抽出中)"}</span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-semibold ${dealTypeBadge(d.deal_type)}`}>
          {d.deal_type}
        </span>
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{d.bidder}</td>
      <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{fmtInt(d.offer_price)}</td>
      <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{fmtOrDash(d.close, fmtInt)}</td>
      <td className={`px-3 py-2 text-right font-mono whitespace-nowrap ${spreadTone(d.spread_pct)}`}>
        {fmtOrDash(d.spread_pct, (n) => fmtPct(n, 1))}
      </td>
      <td className={`px-3 py-2 text-right font-mono whitespace-nowrap ${spreadTone(d.annualized_pct)}`}>
        {fmtOrDash(d.annualized_pct, (n) => fmtPct(n, 1))}
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-slate-500">{d.period_end}</td>
      <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{d.days_left ?? "—"}</td>
    </tr>
  );
}

export default function SpecialSituations() {
  const [resp, setResp] = useState<SpecialSituationsResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/special-situations")
      .then((r) => r.json())
      .then((d: SpecialSituationsResponse) => setResp(d))
      .catch(() => setResp(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="py-6 text-center text-slate-400 text-sm">読み込み中…</p>;
  }
  if (!resp || !resp.exists || !resp.data) {
    return (
      <p className="py-6 text-center text-slate-400 text-sm">
        特殊状況データがありません（夜バッチ後に生成されます）。
      </p>
    );
  }

  const data = resp.data;

  // アクティブ案件は年率%降順。null は最後（円建て利回りが未計算＝優先度が低い扱い）。
  const sortedActive = [...data.active].sort((a, b) => {
    const av = a.annualized_pct;
    const bv = b.annualized_pct;
    if (av === null || av === undefined) return bv === null || bv === undefined ? 0 : 1;
    if (bv === null || bv === undefined) return -1;
    return bv - av;
  });

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        {data.note || "観測モード — 売買判断は1〜2ヶ月の実測分布を見てから"}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>as_of: {data.as_of || "-"}</span>
        <span>
          アクティブ{fmtInt(data.summary.n_active)}件 / 完了{fmtInt(data.summary.n_completed)}件
          {data.summary.avg_premium_pct !== null && data.summary.avg_premium_pct !== undefined && (
            <> ・ 平均プレミアム{fmtPct(data.summary.avg_premium_pct, 1)}</>
          )}
        </span>
      </div>

      {/* needs_review: 条件の自動抽出に失敗した案件。開示原文の確認が必要 */}
      {data.needs_review.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
          <p className="font-medium">
            ⚠️ 条件の自動抽出に失敗。開示原文の確認が必要（{data.needs_review.length}件）
          </p>
          <ul className="space-y-0.5">
            {data.needs_review.map((r) => (
              <li key={r.deal_key}>
                <span className="font-medium">{r.target_name}</span>
                <span className="ml-1 text-amber-600">（{r.announced}）</span>
                <span className="ml-1">— {r.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* アクティブ案件 */}
      <div>
        <h3 className="font-semibold text-slate-700 mb-2 text-sm">アクティブ案件</h3>
        {sortedActive.length === 0 ? (
          <p className="py-4 text-center text-slate-400 text-sm">アクティブな案件はありません。</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-left">
                  <th className="px-3 py-2 font-medium whitespace-nowrap">銘柄</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">種別</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">買付者</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">買付価格</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">現値</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">スプレッド%</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">年率%</th>
                  <th className="px-3 py-2 font-medium whitespace-nowrap">期限</th>
                  <th className="px-3 py-2 font-medium text-right whitespace-nowrap">残日</th>
                </tr>
              </thead>
              <tbody>
                {sortedActive.map((d) => (
                  <ActiveRow key={d.deal_key} d={d} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-slate-400">
          銘柄名にカーソルを合わせると条件（conditions_note）を表示。年率% = スプレッド×365/(残日数+7)。
        </p>
      </div>

      {/* 完了案件: 簡素なリスト */}
      <div>
        <h3 className="font-semibold text-slate-700 mb-2 text-sm">完了案件</h3>
        {data.completed.length === 0 ? (
          <p className="py-4 text-center text-slate-400 text-sm">観測データ蓄積中</p>
        ) : (
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm divide-y divide-slate-100">
            {data.completed.map((c) => (
              <div key={c.deal_key} className="px-3 py-2 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5">
                  <span>
                    <span className="font-medium">{c.target_name}</span>
                    <span
                      className={`ml-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${dealTypeBadge(c.deal_type)}`}
                    >
                      {c.deal_type}
                    </span>
                  </span>
                  <span className="font-mono text-xs text-slate-500">{fmtInt(c.offer_price)}円</span>
                </div>
                <div className="mt-0.5 text-xs text-slate-400">
                  {c.announced} 〜 {c.period_end}
                  {c.result_note && <span className="ml-2 text-slate-600">{c.result_note}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
