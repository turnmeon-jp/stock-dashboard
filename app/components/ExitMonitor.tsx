"use client";

import { useEffect, useState } from "react";
import type { ExitHolding, ExitMonitorData } from "@/app/lib/types";
import RealPostmortemSummary from "./RealPostmortemSummary";

// アクション文字列から行の色調を決める（損切り=赤 / 撤収=黄 / 過熱=緑）
function actionTone(action: string): string {
  if (action.includes("🔴") || action.includes("損切り:")) return "text-rose-700 bg-rose-50";
  if (action.includes("🟡") || action.includes("撤収")) return "text-amber-700 bg-amber-50";
  if (action.includes("🟢")) return "text-emerald-700 bg-emerald-50";
  return "text-slate-600";
}

// 末尾0を除いた東証4桁表示（数値コードのみ）
const short = (code: string) => code.replace(/0$/, "");

// thesis_review の verdict → バッジ絵文字・色調
function thesisReviewTone(verdict: string): { mark: string; cls: string } {
  if (verdict === "broken") return { mark: "🧨", cls: "bg-rose-100 text-rose-800" };
  if (verdict === "weakened") return { mark: "🟠", cls: "bg-amber-50 text-amber-700" };
  return { mark: "✅", cls: "bg-emerald-50 text-emerald-700" };
}

// 保有1件分の追加行（フォローアップ情報）。優先度順: 規律逸脱 > 時間ストップ > テーゼ状態 > テーゼ再点検 > 開示イベント
function followupRows(h: ExitHolding) {
  const rows: { key: string; cls: string; content: string }[] = [];

  if (h.stop_breach) {
    const b = h.stop_breach;
    rows.push({
      key: "breach",
      cls: "bg-rose-100 text-rose-800 font-medium",
      content: `⚠️規律逸脱: 前回逆指値${b.prev_stop}割れのまま保有継続（${b.gap_pct > 0 ? "+" : ""}${b.gap_pct}%・${b.prev_date}時点の推奨）`,
    });
  }

  const ts = h.time_stop;
  if (ts?.flag === "sell_candidate") {
    rows.push({ key: "timestop", cls: "bg-rose-50 text-rose-700", content: `🟥売却候補（時間ストップ）: ${ts.note ?? ""}` });
  } else if (ts?.flag === "warn") {
    rows.push({ key: "timestop", cls: "bg-amber-50 text-amber-700", content: `🟨停滞予告: ${ts.note ?? ""}` });
  }

  const thesis = h.thesis_status;
  if (thesis?.mode === "event") {
    rows.push({
      key: "thesis",
      cls: "bg-indigo-50 text-indigo-700",
      content: `⏸有効テーゼ: ${thesis.premise ?? ""}（レビュー期限${thesis.review_by ?? "-"}・あと${thesis.days_left ?? "-"}日）`,
    });
  } else if (thesis?.mode === "income") {
    rows.push({
      key: "thesis",
      cls: "bg-slate-50 text-slate-600",
      content: `🏦income枠: ${thesis.premise ?? "配当・優待目的"}（出口監視対象外）`,
    });
  } else if (thesis?.mode === "expired") {
    rows.push({
      key: "thesis",
      cls: "bg-orange-100 text-orange-800 font-medium",
      content: `⚠テーゼ期限切れ（期限${thesis.review_by ?? "-"}・${thesis.days_over ?? "-"}日超過）: 更新か手仕舞いの判断を`,
    });
  }

  if (h.thesis_review) {
    const r = h.thesis_review;
    const { mark, cls } = thesisReviewTone(r.verdict);
    rows.push({
      key: "review",
      cls,
      content: `${mark}テーゼ再点検(${r.reviewed_at}): ${r.summary}`,
    });
  }

  const events = (h.events ?? []).filter((e) => e.direction !== "neutral").slice(0, 3);
  for (const [i, e] of events.entries()) {
    const mark = e.direction === "positive" ? "📈" : "⚡";
    rows.push({ key: `event-${i}`, cls: "bg-white text-slate-600", content: `${mark}${e.date} ${e.title}` });
  }

  return rows;
}

export default function ExitMonitor() {
  const [data, setData] = useState<ExitMonitorData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/exit-monitor")
      .then((r) => r.json())
      .then((d: ExitMonitorData) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="py-6 text-center text-slate-400 text-sm">読み込み中…</p>;
  }
  if (!data || data.holdings.length === 0) {
    return (
      <div className="space-y-5">
        <p className="py-6 text-center text-slate-400 text-sm">
          出口監視データがありません（<code>python pipeline/exit_monitor.py</code> を実行）。
        </p>
        <RealPostmortemSummary />
      </div>
    );
  }

  const topTheme = Object.entries(data.theme_concentration)
    .filter(([t]) => t !== "現金等")
    .sort((a, b) => b[1] - a[1])[0] ?? ["", 0];
  const regimeClass =
    data.regime === "risk_off"
      ? "bg-rose-100 text-rose-700"
      : data.regime === "risk_on"
        ? "bg-emerald-100 text-emerald-700"
        : "bg-amber-100 text-amber-700";

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">更新: {data.updated}</span>
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${regimeClass}`}>
          regime: {data.regime}
        </span>
      </div>

      {/* テーマ集中バー */}
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="text-xs text-slate-500 mb-2">テーマ集中（相関リスク）</div>
        <div className="flex gap-0.5 h-4 rounded overflow-hidden bg-slate-100">
          {Object.entries(data.theme_concentration).map(([t, p]) => (
            <div
              key={t}
              className={t === "AI" ? "bg-blue-500" : "bg-slate-300"}
              style={{ width: `${p}%` }}
              title={`${t}: ${p}%`}
            />
          ))}
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {Object.entries(data.theme_concentration)
            .map(([t, p]) => `${t} ${p}%`)
            .join(" / ")}
        </div>
        {topTheme[1] > 25 && (
          <p className="mt-2 text-xs text-rose-600">
            ⚠️ {topTheme[0]}集中 {topTheme[1]}%（総資金比）&gt; 25%（単一テーマ過大）
          </p>
        )}
      </div>

      {/* 保有銘柄の出口アクション */}
      <div>
        <h3 className="font-semibold text-slate-700 mb-2 text-sm">保有銘柄の出口アクション</h3>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-600 text-left">
                {["銘柄", "取得", "現値", "含み", "逆指値", "アクション"].map((h, i) => (
                  <th key={i} className="px-3 py-2 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.holdings.flatMap((h) => {
                const rows = [
                  <tr key={h.code} className="border-t border-slate-100">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-mono text-slate-500">{short(h.code)}</span>{" "}
                      <span className="font-medium">{h.name}</span>
                      {h.theme === "AI" && <span className="ml-1 text-[10px] text-blue-500">AI</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{h.cost}</td>
                    <td className="px-3 py-2 text-right font-mono">{h.cur ?? "-"}</td>
                    <td
                      className={`px-3 py-2 text-right font-mono ${
                        (h.pl_pct ?? 0) > 0
                          ? "text-emerald-600"
                          : (h.pl_pct ?? 0) < 0
                            ? "text-rose-600"
                            : ""
                      }`}
                    >
                      {h.pl_pct !== undefined ? `${h.pl_pct > 0 ? "+" : ""}${h.pl_pct}%` : "-"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-rose-600">
                      {h.stop_level ?? "-"}
                    </td>
                    <td className={`px-3 py-2 text-xs ${actionTone(h.action ?? "")}`}>
                      {h.action ?? h.error ?? "-"}
                    </td>
                  </tr>,
                ];
                // フォローアップ情報（規律逸脱・時間ストップ・テーゼ状態・テーゼ再点検・開示イベント）
                for (const fr of followupRows(h)) {
                  rows.push(
                    <tr key={`${h.code}-${fr.key}`} className="border-t border-slate-100">
                      <td colSpan={6} className={`px-3 py-1.5 text-xs ${fr.cls}`}>
                        {fr.content}
                      </td>
                    </tr>
                  );
                }
                // 買い増し（利乗せ限定）: eligible の時だけ行を追加。非成立時は画面を汚さない。
                if (h.add_on?.eligible) {
                  const a = h.add_on;
                  rows.push(
                    <tr key={`${h.code}-addon`} className="border-t border-slate-100 bg-sky-50">
                      <td colSpan={6} className="px-3 py-1.5 text-xs text-sky-700">
                        🔼買い増し: 指値~{a.limit}(SMA25)・+{a.add_shares}株・混合建値{a.blended_cost}
                        ・逆指値{a.stop}維持（フリーロール条件成立）
                      </td>
                    </tr>
                  );
                }
                return rows;
              })}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        逆指値水準は移動平均ベースで毎日変動します。立花アプリ等で逆指値を更新する際の参照に。実発注は手動で。
      </p>

      <RealPostmortemSummary />
    </div>
  );
}
