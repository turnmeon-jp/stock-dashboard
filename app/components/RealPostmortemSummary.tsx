"use client";

import { useEffect, useState } from "react";
import type { RealPostmortemData } from "@/app/lib/types";
import { fmtPct, fmtNum, fmtYen, fmtInt } from "@/app/lib/format";

// 勝率・ペイオフ比の色調（実トレード逆解析の基準値=勝率21%・利小損大 との比較用。表示のみ・売買判断ではない）
function winRateTone(wr: number | null): string {
  if (wr === null) return "text-slate-400";
  if (wr >= 50) return "text-emerald-600";
  if (wr > 21) return "text-amber-600";
  return "text-rose-600";
}
function payoffTone(pr: number | null): string {
  if (pr === null) return "text-slate-400";
  return pr >= 1 ? "text-emerald-600" : "text-rose-600";
}

export default function RealPostmortemSummary() {
  const [data, setData] = useState<RealPostmortemData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/real-postmortem")
      .then((r) => r.json())
      .then((d: RealPostmortemData) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="py-4 text-center text-slate-400 text-sm">読み込み中…</p>;
  }

  const s = data?.summary;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <h3 className="font-semibold text-slate-700 mb-2 text-sm">実弾トレードの振り返り（決済ごとの自己採点）</h3>

      {!s || s.n === 0 ? (
        <p className="text-sm text-slate-400">
          決済記録なし（<code>holdings_cli</code> で売買を記録すると蓄積）
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <div className="text-[11px] text-slate-500">勝率</div>
              <div className={`text-lg font-bold font-mono ${winRateTone(s.win_rate)}`}>
                {fmtPct(s.win_rate, 1)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">ペイオフ比</div>
              <div className={`text-lg font-bold font-mono ${payoffTone(s.payoff_ratio)}`}>
                {fmtNum(s.payoff_ratio, 2)}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">決済件数</div>
              <div className="text-sm font-mono text-slate-700">{fmtInt(s.n)}件</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">規律逸脱決済</div>
              <div className={`text-sm font-mono ${s.breach_trades > 0 ? "text-rose-600" : "text-slate-700"}`}>
                {fmtInt(s.breach_trades)}件
              </div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">平均益</div>
              <div className="text-sm font-mono text-emerald-600">{fmtPct(s.avg_win_pct, 1)}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">平均損</div>
              <div className="text-sm font-mono text-rose-600">{fmtPct(s.avg_loss_pct, 1)}</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">保有日数中央値</div>
              <div className="text-sm font-mono text-slate-700">{fmtNum(s.median_holding_days, 1)}日</div>
            </div>
            <div>
              <div className="text-[11px] text-slate-500">損益合計</div>
              <div className="text-sm font-mono text-slate-700">{fmtYen(s.total_pl_yen)}</div>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            参考: 実トレード逆解析の基準値＝勝率21%・利小損大（ペイオフ比低）。この基準との比較用の集計。
          </p>
        </>
      )}
    </div>
  );
}
