"use client";

import { useEffect, useState } from "react";
import type { ExitMonitorData } from "@/app/lib/types";

// アクション文字列から行の色調を決める（損切り=赤 / 撤収=黄 / 過熱=緑）
function actionTone(action: string): string {
  if (action.includes("🔴") || action.includes("損切り:")) return "text-rose-700 bg-rose-50";
  if (action.includes("🟡") || action.includes("撤収")) return "text-amber-700 bg-amber-50";
  if (action.includes("🟢")) return "text-emerald-700 bg-emerald-50";
  return "text-slate-600";
}

// 末尾0を除いた東証4桁表示（数値コードのみ）
const short = (code: string) => code.replace(/0$/, "");

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
      <p className="py-6 text-center text-slate-400 text-sm">
        出口監視データがありません（<code>python pipeline/exit_monitor.py</code> を実行）。
      </p>
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
    </div>
  );
}
