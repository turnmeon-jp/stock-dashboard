"use client";

import { useEffect, useState } from "react";
import type { ExitHolding, ExitMonitorData } from "@/app/lib/types";
import RealPostmortemSummary from "./RealPostmortemSummary";
import TradeReportForm from "./TradeReportForm";

// アクション文字列から行の色調を決める（損切り=赤 / 撤収=黄 / 過熱=緑）
function actionTone(action: string): string {
  if (action.includes("🔴") || action.includes("損切り:")) return "text-rose-700 bg-rose-50";
  if (action.includes("🟡") || action.includes("撤収")) return "text-amber-700 bg-amber-50";
  if (action.includes("🟢")) return "text-emerald-700 bg-emerald-50";
  return "text-slate-600";
}

// 末尾0を除いた東証4桁表示（数値コードのみ）
const short = (code: string) => code.replace(/0$/, "");

// 折りたたみ時の「アクション要約バッジ」用。絵文字とその意味（title属性）
const BADGE_HINTS: Record<string, string> = {
  "🔴": "損切り・防衛線割れの検討",
  "🟡": "撤収検討",
  "🟢": "過熱・利確目安",
  "🏦": "income枠（配当・優待目的、出口監視対象外）",
  "⏸": "有効テーゼ保有中",
  "🧨": "テーゼ反証・破綻",
  "💰": "部分利確検討",
  "⚠️": "規律逸脱：前回逆指値を割れたまま保有継続",
  "🟥": "時間ストップ：売却候補",
  "🟨": "時間ストップ：停滞予告",
  "🟠": "テーゼ弱含み（再点検で懸念）",
  "🔼": "買い増し候補（利乗せ条件成立）",
};
const ACTION_TEXT_EMOJI = ["🔴", "🟡", "🟢", "🏦", "⏸", "🧨", "💰"];

// 保有1件の状態を絵文字だけで要約（折りたたみ時のヘッダに表示）。
// action文言中の絵文字＋各フォローアップ項目のフラグから重複なく抽出する。
function actionBadges(h: ExitHolding): string[] {
  const set = new Set<string>();
  const action = h.action ?? "";
  for (const e of ACTION_TEXT_EMOJI) {
    if (action.includes(e)) set.add(e);
  }
  if (h.stop_breach) set.add("⚠️");
  if (h.time_stop?.flag === "sell_candidate") set.add("🟥");
  else if (h.time_stop?.flag === "warn") set.add("🟨");
  if (h.thesis_review?.verdict === "broken") set.add("🧨");
  else if (h.thesis_review?.verdict === "weakened") set.add("🟠");
  if (h.add_on?.eligible) set.add("🔼");
  return [...set];
}

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

/* ---- スマホ用カード（保有銘柄） ---- */
function HoldingCard({
  h,
  isOpen,
  onToggle,
  reportOpen,
  isReported,
  onReportToggle,
  onReported,
}: {
  h: ExitHolding;
  isOpen: boolean;
  onToggle: () => void;
  reportOpen: boolean;
  isReported: boolean;
  onReportToggle: () => void;
  onReported: () => void;
}) {
  const badges = actionBadges(h);
  const plTone = (h.pl_pct ?? 0) > 0 ? "text-emerald-600" : (h.pl_pct ?? 0) < 0 ? "text-rose-600" : "text-slate-500";

  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* カードヘッダ（タップで開閉）: 銘柄名・含み損益%・アクション要約バッジのみ */}
      <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer" onClick={onToggle}>
        <div className="min-w-0 flex-1">
          <span className="font-mono text-xs text-slate-500">{short(h.code)}</span>{" "}
          <span className="font-medium text-sm text-slate-800">{h.name}</span>
          {h.theme === "AI" && <span className="ml-1 text-[10px] text-blue-500">AI</span>}
        </div>
        <span className={`shrink-0 font-mono text-sm font-semibold ${plTone}`}>
          {h.pl_pct !== undefined ? `${h.pl_pct > 0 ? "+" : ""}${h.pl_pct}%` : "-"}
        </span>
        <span className="flex shrink-0 items-center gap-0.5 text-sm">
          {badges.length === 0 ? (
            <span className="text-[10px] text-slate-300">-</span>
          ) : (
            badges.map((b) => (
              <span key={b} title={BADGE_HINTS[b]} className="cursor-help">
                {b}
              </span>
            ))
          )}
        </span>
        <span className={`shrink-0 text-[10px] transition-transform ${isOpen ? "rotate-180" : ""}`}>▼</span>
      </div>

      {/* 展開部: 数値・推奨全文・テーゼ・イベント・売却報告 */}
      {isOpen && (
        <div className="space-y-2 border-t border-slate-100 px-3 pb-3 pt-2 text-xs">
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            <div>
              <span className="text-slate-400">株数</span>{" "}
              <span className="font-mono">{h.shares}</span>
            </div>
            <div>
              <span className="text-slate-400">取得</span>{" "}
              <span className="font-mono">{h.cost}</span>
            </div>
            <div>
              <span className="text-slate-400">現値</span>{" "}
              <span className="font-mono">{h.cur ?? "-"}</span>
            </div>
            <div>
              <span className="text-slate-400">逆指値</span>{" "}
              <span className="font-mono text-rose-600">{h.stop_level ?? "-"}</span>
            </div>
          </div>

          <p className={`rounded px-2 py-1.5 ${actionTone(h.action ?? "")}`}>{h.action ?? h.error ?? "-"}</p>

          <p className={`rounded px-2 py-1 ${h.entry_reason ? "text-slate-600" : "italic text-slate-300"}`}>
            📝 {h.entry_reason || "エントリー理由未記録"}
          </p>

          {followupRows(h).map((fr) => (
            <p key={fr.key} className={`rounded px-2 py-1.5 ${fr.cls}`}>
              {fr.content}
            </p>
          ))}

          {h.add_on?.eligible && (
            <p className="rounded bg-sky-50 px-2 py-1.5 text-sky-700">
              🔼買い増し: 指値~{h.add_on.limit}(SMA25)・+{h.add_on.add_shares}株・混合建値{h.add_on.blended_cost}
              ・逆指値{h.add_on.stop}維持（フリーロール条件成立）
            </p>
          )}

          <div>
            {isReported ? (
              <span className="text-[11px] text-emerald-600">✔ 報告済</span>
            ) : (
              <button
                onClick={onReportToggle}
                className={`rounded border px-2 py-1 text-xs font-medium ${
                  reportOpen
                    ? "border-slate-300 bg-slate-100 text-slate-600"
                    : "border-rose-300 text-rose-600 hover:bg-rose-50"
                }`}
              >
                {reportOpen ? "閉じる" : "売却報告"}
              </button>
            )}
          </div>

          {reportOpen && !isReported && (
            <TradeReportForm
              kind="close"
              code={h.code}
              name={h.name}
              defaultShares={h.shares}
              defaultPrice={h.cur}
              onSuccess={onReported}
            />
          )}
        </div>
      )}
    </div>
  );
}

export default function ExitMonitor() {
  const [data, setData] = useState<ExitMonitorData | null>(null);
  const [loading, setLoading] = useState(true);
  // 売却報告フォームを開いている銘柄コード（同時に開くのは1つ）と、報告済みコード
  const [reportOpen, setReportOpen] = useState<string | null>(null);
  const [reported, setReported] = useState<Set<string>>(new Set());
  // スマホカードの開閉銘柄コード（同時に開くのは1つ。デスクトップ表は従来どおり常時展開）
  const [openHolding, setOpenHolding] = useState<string | null>(null);

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
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-slate-500">更新: {data.updated}</span>
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${regimeClass}`}
          title="市場全体の地合い。攻めてよい時期かの判定"
        >
          regime: {data.regime}
        </span>
      </div>

      {/* アイコン凡例（一言） */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
        <span title="有効テーゼ：前提が崩れていない限り保有継続">⏸ テーゼ保有中</span>
        <span title="時間ストップ：一定期間成果が出ず見切りの目安">🟥 時間ストップ</span>
        <span title="部分利確：含み益の一部を確保する目安">💰 部分利確</span>
        <span title="規律逸脱：前回の逆指値を守れず保有継続してしまっている">⚠️ 規律逸脱</span>
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

        {/* スマホ: カード形式（銘柄・含み損益%・アクション要約バッジのみ。タップで詳細展開） */}
        <div className="md:hidden space-y-2">
          {data.holdings.map((h) => {
            const isReported = reported.has(h.code);
            const isOpen = openHolding === h.code;
            return (
              <HoldingCard
                key={h.code}
                h={h}
                isOpen={isOpen}
                onToggle={() => setOpenHolding(isOpen ? null : h.code)}
                reportOpen={reportOpen === h.code}
                isReported={isReported}
                onReportToggle={() => setReportOpen(reportOpen === h.code ? null : h.code)}
                onReported={() => setReported((prev) => new Set(prev).add(h.code))}
              />
            );
          })}
        </div>

        {/* デスクトップ: テーブル形式（従来どおり常時展開） */}
        <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-600 text-left">
                {["銘柄", "株数", "取得", "現値", "含み", "逆指値", "報告"].map((h, i) => (
                  <th
                    key={i}
                    // 「株数」「取得」列はスマホでは非表示（主要列のみ表示。含みで代替可能なため）
                    className={`px-3 py-2 font-medium whitespace-nowrap ${i === 1 || i === 2 ? "hidden sm:table-cell" : ""}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.holdings.flatMap((h) => {
                const isReported = reported.has(h.code);
                const rows = [
                  <tr key={h.code} className="border-t border-slate-200">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-mono text-slate-500">{short(h.code)}</span>{" "}
                      <span className="font-medium">{h.name}</span>
                      {h.theme === "AI" && <span className="ml-1 text-[10px] text-blue-500">AI</span>}
                    </td>
                    <td className="hidden px-3 py-2 text-right font-mono sm:table-cell">{h.shares}</td>
                    <td className="hidden px-3 py-2 text-right font-mono sm:table-cell">{h.cost}</td>
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
                    <td className="px-3 py-2 text-right">
                      {isReported ? (
                        <span className="whitespace-nowrap text-[10px] text-emerald-600">✔ 報告済</span>
                      ) : (
                        <button
                          onClick={() => setReportOpen(reportOpen === h.code ? null : h.code)}
                          className={`whitespace-nowrap rounded border px-2 py-0.5 text-[10px] font-medium ${
                            reportOpen === h.code
                              ? "border-slate-300 bg-slate-100 text-slate-600"
                              : "border-rose-300 text-rose-600 hover:bg-rose-50"
                          }`}
                        >
                          {reportOpen === h.code ? "閉じる" : "売却報告"}
                        </button>
                      )}
                    </td>
                  </tr>,
                  // アクション（機械判断）: 右端カラムだと長文が潰れるため全幅行で表示
                  <tr key={`${h.code}-action`}>
                    <td colSpan={7} className={`px-3 py-1.5 text-xs ${actionTone(h.action ?? "")}`}>
                      {h.action ?? h.error ?? "-"}
                    </td>
                  </tr>,
                ];
                // 売却報告フォーム（開いている銘柄のみ）
                if (reportOpen === h.code && !isReported) {
                  rows.push(
                    <tr key={`${h.code}-report`}>
                      <td colSpan={7} className="px-3 py-2">
                        <TradeReportForm
                          kind="close"
                          code={h.code}
                          name={h.name}
                          defaultShares={h.shares}
                          defaultPrice={h.cur}
                          onSuccess={() => setReported((prev) => new Set(prev).add(h.code))}
                        />
                      </td>
                    </tr>
                  );
                }
                // エントリー理由（剪定コンテキスト。未記録は薄字で明示）
                rows.push(
                  <tr key={`${h.code}-reason`} className="border-t border-slate-100">
                    <td
                      colSpan={7}
                      className={`px-3 py-1 text-xs ${h.entry_reason ? "text-slate-600" : "italic text-slate-300"}`}
                    >
                      📝 {h.entry_reason || "エントリー理由未記録"}
                    </td>
                  </tr>
                );
                // フォローアップ情報（規律逸脱・時間ストップ・テーゼ状態・テーゼ再点検・開示イベント）
                for (const fr of followupRows(h)) {
                  rows.push(
                    <tr key={`${h.code}-${fr.key}`} className="border-t border-slate-100">
                      <td colSpan={7} className={`px-3 py-1.5 text-xs ${fr.cls}`}>
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
                      <td colSpan={7} className="px-3 py-1.5 text-xs text-sky-700">
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
