"use client";

import { useEffect, useState } from "react";
import type { PaperPositionsData, PaperLogEntry, Candidate, LedgerReport } from "@/app/lib/types";
import { fmtInt, fmtPct, fmtYen } from "@/app/lib/format";

const INITIAL_CAPITAL = 3_000_000;
const R_BASE = 30_000; // 3,000,000 * 1%
// レジーム別Rキャップ（config.yaml と同値）
const R_CAP: Record<string, number> = { risk_on: 5, neutral: 3, risk_off: 1 };

const LOG_TYPE_LABELS: Record<string, string> = {
  entry: "エントリー",
  half_profit: "半利確",
  stop_loss: "損切",
  trail_exit: "トレール",
  time_exit: "時間切れ",
};

// 候補台帳（candidate_ledger）の系統キー → 表示名
const LEDGER_SYSTEM_LABELS: Record<string, string> = {
  edge_aligned: "今日の候補（edge_aligned）",
  growth_pass: "成長通過（Layer2）",
  domain_screen: "土俵（domain_screen）",
  watchlist: "ウォッチ",
};

function daysSince(dateStr: string): number {
  const start = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

function SummaryCard({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "pos" | "neg" | "neutral";
}) {
  const toneClass =
    tone === "pos" ? "text-emerald-600" : tone === "neg" ? "text-rose-600" : "text-slate-800";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-base sm:text-lg font-semibold font-mono ${toneClass}`}>{value}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

interface SectorConcentration {
  sectors: Record<string, { count: number; pct: number }>;
  max_sector: string | null;
  max_pct: number;
  warn: boolean;
  warn_threshold_pct: number;
}

export default function PaperTrade({ candidates }: { candidates: Candidate[] }) {
  const [posData, setPosData] = useState<PaperPositionsData | null>(null);
  const [log, setLog] = useState<PaperLogEntry[]>([]);
  const [sectorConc, setSectorConc] = useState<SectorConcentration | null>(null);
  const [ledger, setLedger] = useState<LedgerReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<PaperLogEntry | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/paper").then((r) => {
        if (!r.ok) throw new Error(`/api/paper: HTTP ${r.status}`);
        return r.json() as Promise<PaperPositionsData>;
      }),
      fetch("/api/paper/log").then((r) => {
        if (!r.ok) throw new Error(`/api/paper/log: HTTP ${r.status}`);
        return r.json() as Promise<PaperLogEntry[]>;
      }),
      fetch("/api/paper/postmortem").then((r) => r.ok ? r.json() : null).catch(() => null),
      fetch("/api/ledger")
        .then((r) => (r.ok ? (r.json() as Promise<LedgerReport | null>) : null))
        .catch(() => null),
    ])
      .then(([pos, lg, pm, led]) => {
        setPosData(pos);
        setLog(Array.isArray(lg) ? lg : []);
        setSectorConc(pm?.sector_concentration ?? null);
        setLedger(led ?? null);
      })
      .catch((err) => {
        console.error("ペーパートレードデータの取得に失敗:", err);
        setPosData({ positions: [], closed: [], equity: 0, started_at: "" });
        setLog([]);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="py-12 text-center text-slate-400 text-sm">データを読み込んでいます...</div>
    );
  }

  if (!posData || posData.started_at === "") {
    return (
      <div className="py-12 text-center text-slate-400 text-sm">
        ペーパートレードデータがまだありません。
        <br />
        <span className="text-xs">output/paper_positions.json を生成してください。</span>
      </div>
    );
  }

  const {
    positions, closed, equity, started_at,
    high_equity, month_start_equity,
    dd_stopped, dd_stop_reason,
  } = posData;

  // 建玉は時価(current_price)で評価。取得単価だと総資産・損益・DDがバックエンドの
  // 時価ベース high_equity と不整合になり、DD警告が誤発動する（current_price 欠落時のみ取得単価）。
  const positionValue = positions.reduce(
    (s, p) => s + (p.current_price ?? p.entry_price) * p.shares,
    0
  );
  const totalAsset = equity + positionValue;
  const pnlYen = totalAsset - INITIAL_CAPITAL;
  const pnlPct = (pnlYen / INITIAL_CAPITAL) * 100;

  const realizedPnl = closed.reduce((s, c) => s + c.pnl, 0);

  // 1エントリー=1試行。決済確定イベント（損切/トレール/時間切れ）のみカウント。
  // half_profit は半決済なのでここでは除外（同トレードが二重カウントされる）
  const closedTrades = log.filter(
    (e) => e.type === "stop_loss" || e.type === "trail_exit" || e.type === "time_exit"
  );
  const winCount = closedTrades.filter((e) => (e.pnl ?? 0) > 0).length;
  const winRate = closedTrades.length > 0 ? (winCount / closedTrades.length) * 100 : null;
  const avgPnl =
    closedTrades.length > 0
      ? closedTrades.reduce((s, e) => s + (e.pnl ?? 0), 0) / closedTrades.length
      : null;

  // ポートフォリオR計算（建玉のrisk_yen合計 / R_BASE）
  const portfolioR = positions.reduce((s, p) => s + (p.risk_yen ?? 0), 0) / R_BASE;

  // DD計算
  const hwm = high_equity ?? INITIAL_CAPITAL;
  const monthBase = month_start_equity ?? INITIAL_CAPITAL;
  const cumDdPct = ((totalAsset - hwm) / hwm) * 100;
  const monthDdPct = ((totalAsset - monthBase) / monthBase) * 100;

  const edgeCodes = new Set(candidates.filter((c) => c.edge_aligned).map((c) => c.code));
  const positionCodes = positions.map((p) => p.code);
  const edgeMatchCount = positionCodes.filter((code) => edgeCodes.has(code)).length;
  const edgeFullCount = positions.filter((p) => p.edge_full).length;

  const sortedLog = [...log].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const elapsed = daysSince(started_at);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* DDストップバナー */}
      {dd_stopped && (
        <div className="rounded-lg border border-rose-400 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span className="font-bold">⚠️ 取引停止中</span>
          {dd_stop_reason && <span className="ml-2">— {dd_stop_reason}</span>}
        </div>
      )}

      {/* セクター集中警告 */}
      {sectorConc?.warn && (
        <div className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-bold">セクター集中注意</span>
          <span className="ml-2">
            {sectorConc.max_sector} が {sectorConc.max_pct.toFixed(0)}%
            （閾値 {sectorConc.warn_threshold_pct}%）
          </span>
          <span className="ml-2 text-amber-600 text-xs">— テーマ分散を検討してください</span>
        </div>
      )}

      {/* DD警告（未停止だが-5%超） */}
      {!dd_stopped && (cumDdPct <= -5 || monthDdPct <= -5) && (
        <div className="rounded-lg border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠️ DD注意: 累計{fmtPct(cumDdPct)} / 月次{fmtPct(monthDdPct)}
          （停止基準: 累計-15% / 月次-8%）
        </div>
      )}

      {/* ポートフォリオR メーター */}
      <div className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-slate-700 text-sm">リスク使用量</h3>
          <span className="text-xs text-slate-500">
            {portfolioR.toFixed(1)}R 使用中
            <span className="ml-2 text-slate-400">（上限: risk_on=5R / neutral=3R / risk_off=1R）</span>
          </span>
        </div>
        <div className="flex gap-3 text-xs">
          {(["risk_on", "neutral", "risk_off"] as const).map((label) => {
            const cap = R_CAP[label];
            const pct = Math.min((portfolioR / cap) * 100, 100);
            const barColor =
              pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-400" : "bg-emerald-500";
            return (
              <div key={label} className="flex-1">
                <div className="flex justify-between mb-0.5 text-slate-500">
                  <span>{label}</span>
                  <span>{cap}R上限</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* DDメーター */}
      <div className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
        <h3 className="font-semibold text-slate-700 text-sm mb-2">ドローダウン</h3>
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="flex justify-between mb-0.5 text-slate-500">
              <span>累計DD</span>
              <span className={cumDdPct <= -10 ? "text-rose-600 font-semibold" : cumDdPct <= -5 ? "text-amber-600" : "text-slate-600"}>
                {cumDdPct > 0 ? "+" : ""}{fmtPct(cumDdPct)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${Math.abs(cumDdPct) >= 12 ? "bg-rose-500" : Math.abs(cumDdPct) >= 7 ? "bg-amber-400" : "bg-slate-300"}`}
                style={{ width: `${Math.min(Math.abs(cumDdPct) / 15 * 100, 100)}%` }}
              />
            </div>
            <div className="text-slate-400 mt-0.5">停止基準 -15%</div>
          </div>
          <div>
            <div className="flex justify-between mb-0.5 text-slate-500">
              <span>月次DD</span>
              <span className={monthDdPct <= -6 ? "text-rose-600 font-semibold" : monthDdPct <= -4 ? "text-amber-600" : "text-slate-600"}>
                {monthDdPct > 0 ? "+" : ""}{fmtPct(monthDdPct)}
              </span>
            </div>
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${Math.abs(monthDdPct) >= 6 ? "bg-rose-500" : Math.abs(monthDdPct) >= 4 ? "bg-amber-400" : "bg-slate-300"}`}
                style={{ width: `${Math.min(Math.abs(monthDdPct) / 8 * 100, 100)}%` }}
              />
            </div>
            <div className="text-slate-400 mt-0.5">停止基準 -8%</div>
          </div>
        </div>
      </div>

      {/* サマリーカード: スマホ2列 / デスクトップ4列 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard
          label="総資産（取得額ベース）"
          value={fmtYen(totalAsset)}
          sub={`開始: ${started_at}（${elapsed}日経過）※時価未取得`}
        />
        <SummaryCard
          label="損益額 / 損益率"
          value={`${pnlYen >= 0 ? "+" : ""}${fmtInt(pnlYen)}円`}
          sub={`${pnlPct >= 0 ? "+" : ""}${fmtPct(pnlPct)} vs 300万`}
          tone={pnlYen > 0 ? "pos" : pnlYen < 0 ? "neg" : "neutral"}
        />
        <SummaryCard
          label="現金 / 建玉評価"
          value={fmtYen(equity)}
          sub={`建玉 ${fmtYen(positionValue)}（${positions.length}件）`}
        />
        <SummaryCard
          label="確定損益"
          value={`${realizedPnl >= 0 ? "+" : ""}${fmtInt(realizedPnl)}円`}
          tone={realizedPnl > 0 ? "pos" : realizedPnl < 0 ? "neg" : "neutral"}
          sub={`決済済 ${closed.length}件`}
        />
      </div>

      {/* パフォーマンス */}
      <div className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4 shadow-sm">
        <h3 className="font-semibold text-slate-700 mb-2 sm:mb-3">パフォーマンス</h3>
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-3 sm:gap-6 text-xs sm:text-sm">
          <span>
            決済済トレード数{" "}
            <span className="font-mono font-medium block sm:inline">{closedTrades.length}件</span>
          </span>
          <span>
            勝率{" "}
            <span className="font-mono font-medium block sm:inline">
              {winRate !== null ? fmtPct(winRate) : "-"}
            </span>
          </span>
          <span>
            平均損益{" "}
            <span
              className={`font-mono font-medium block sm:inline ${
                avgPnl === null
                  ? "text-slate-500"
                  : avgPnl > 0
                    ? "text-emerald-600"
                    : avgPnl < 0
                      ? "text-rose-600"
                      : ""
              }`}
            >
              {avgPnl !== null ? `${avgPnl >= 0 ? "+" : ""}${fmtInt(avgPnl)}円` : "-"}
            </span>
          </span>
          <span>
            検証エッジ適合{" "}
            <span className="font-mono font-medium text-blue-700 block sm:inline">
              {edgeMatchCount}/{positions.length}件
            </span>
          </span>
          <span>
            成長+技術(edge_full){" "}
            <span className="font-mono font-medium text-violet-700 block sm:inline">
              {edgeFullCount}/{positions.length}件
            </span>
          </span>
        </div>
      </div>

      {/* 建玉一覧 */}
      <div>
        <h3 className="font-semibold text-slate-700 mb-2">建玉一覧</h3>

        {/* スマホ: カード形式 */}
        <div className="md:hidden space-y-2">
          {positions.length === 0 && (
            <p className="py-6 text-center text-slate-400 text-sm">現在の建玉はありません。</p>
          )}
          {positions.map((p) => {
            const distPct = ((p.entry_price - p.stop_loss) / p.entry_price) * 100;
            const highRisk = distPct > 5;
            const cp = p.current_price ?? null;
            const unrealizedPnl = cp !== null ? (cp - p.entry_price) * p.shares : null;
            return (
              <div
                key={p.code}
                className={`rounded-lg border p-3 shadow-sm ${highRisk ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <span className="font-mono text-xs text-slate-500">{p.code}</span>{" "}
                    <span className="font-medium text-sm">{p.name}</span>
                  </div>
                  <a
                    href={`/stock/${p.code}`}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    詳細
                  </a>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <div>
                    <span className="text-slate-400">取得日</span>{" "}
                    <span className="text-slate-600">{p.entry_date}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">株数</span>{" "}
                    <span className="font-mono">{fmtInt(p.shares)}株</span>
                  </div>
                  <div>
                    <span className="text-slate-400">取得単価</span>{" "}
                    <span className="font-mono">{fmtInt(p.entry_price)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">現在値</span>{" "}
                    <span className="font-mono">
                      {cp !== null ? fmtInt(cp) : <span className="text-slate-300">-</span>}
                    </span>
                  </div>
                  {unrealizedPnl !== null && (
                    <div className="col-span-2">
                      <span className="text-slate-400">含み損益</span>{" "}
                      <span
                        className={`font-mono font-medium ${unrealizedPnl > 0 ? "text-emerald-600" : unrealizedPnl < 0 ? "text-rose-600" : ""}`}
                      >
                        {unrealizedPnl >= 0 ? "+" : ""}{fmtInt(unrealizedPnl)}円
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-slate-400">損切価格</span>{" "}
                    <span className={`font-mono ${highRisk ? "text-rose-600 font-semibold" : "text-rose-600"}`}>
                      {fmtInt(p.stop_loss)}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">利確目安</span>{" "}
                    <span className="font-mono text-emerald-600">{fmtInt(p.tp_first)}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">損切距離</span>{" "}
                    <span className={`font-mono ${highRisk ? "text-rose-600 font-semibold" : ""}`}>
                      {fmtPct(distPct)}
                    </span>
                    {highRisk && <span className="ml-1 text-rose-500">⚠️</span>}
                  </div>
                  <div>
                    <span className="text-slate-400">半利確</span>{" "}
                    {p.half_taken ? (
                      <span className="text-emerald-600 font-medium">済</span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {positions.some((p) => ((p.entry_price - p.stop_loss) / p.entry_price) * 100 > 5) && (
            <p className="text-xs text-rose-600">※ 赤背景行は損切距離が5%超のため注意が必要です。</p>
          )}
        </div>

        {/* デスクトップ: テーブル形式 */}
        <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-600 text-left">
                {[
                  "銘柄",
                  "取得日",
                  "取得単価",
                  "株数",
                  "投資額",
                  "現在値",
                  "含み損益",
                  "損切価格",
                  "利確目安",
                  "損切距離",
                  "半利確",
                  "",
                ].map((h, i) => (
                  <th key={i} className="px-3 py-2 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {positions.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-3 py-8 text-center text-slate-400">
                    現在の建玉はありません。
                  </td>
                </tr>
              )}
              {positions.map((p) => {
                const distPct = ((p.entry_price - p.stop_loss) / p.entry_price) * 100;
                const highRisk = distPct > 5;
                const invested = p.entry_price * p.shares;
                const cp = p.current_price ?? null;
                const unrealizedPnl = cp !== null ? (cp - p.entry_price) * p.shares : null;
                return (
                  <tr
                    key={p.code}
                    className={`border-t border-slate-100 ${highRisk ? "bg-rose-50" : "hover:bg-slate-50"}`}
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-mono text-slate-500">{p.code}</span>{" "}
                      <span className="font-medium">{p.name}</span>
                      {p.edge_full && (
                        <span className="ml-1.5 inline-block rounded bg-violet-100 px-1 py-0.5 text-[10px] font-medium text-violet-700">
                          EF
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{p.entry_date}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtInt(p.entry_price)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtInt(p.shares)}</td>
                    <td className="px-3 py-2 text-right font-mono">{fmtYen(invested)}</td>
                    <td className="px-3 py-2 text-right font-mono text-slate-700">
                      {cp !== null ? (
                        <>
                          {fmtInt(cp)}
                          {p.price_date && (
                            <span className="ml-1 text-[10px] text-slate-400">{p.price_date}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono ${
                        unrealizedPnl === null
                          ? "text-slate-300"
                          : unrealizedPnl > 0
                            ? "text-emerald-600"
                            : unrealizedPnl < 0
                              ? "text-rose-600"
                              : "text-slate-600"
                      }`}
                    >
                      {unrealizedPnl !== null
                        ? `${unrealizedPnl >= 0 ? "+" : ""}${fmtInt(unrealizedPnl)}`
                        : "-"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-rose-600">
                      {fmtInt(p.stop_loss)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-emerald-600">
                      {fmtInt(p.tp_first)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-mono ${highRisk ? "text-rose-600 font-semibold" : "text-slate-600"}`}
                    >
                      {fmtPct(distPct)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {p.half_taken ? (
                        <span className="text-emerald-600 font-medium">済</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <a
                        href={`/stock/${p.code}`}
                        className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        詳細
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {positions.some((p) => ((p.entry_price - p.stop_loss) / p.entry_price) * 100 > 5) && (
          <p className="mt-2 text-xs text-rose-600 hidden md:block">
            ※ 赤背景行は損切距離が5%超のため注意が必要です。
          </p>
        )}
      </div>

      {/* 取引履歴詳細モーダル（スマホ用） */}
      {selectedLog && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center md:hidden"
          onClick={() => setSelectedLog(null)}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative w-full rounded-t-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ハンドル */}
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-300" />
            <div className="mb-4 flex items-start justify-between">
              <div>
                <span className="font-mono text-sm text-slate-500">{selectedLog.code}</span>{" "}
                <span className="font-semibold text-slate-800">{selectedLog.name ?? ""}</span>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="ml-4 rounded-full p-1.5 text-slate-400 hover:bg-slate-100"
                aria-label="閉じる"
              >
                ✕
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-slate-400">日付</dt>
                <dd className="font-mono text-slate-700">{selectedLog.date}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">種別</dt>
                <dd>
                  <span
                    className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                      selectedLog.type === "entry"
                        ? "bg-blue-100 text-blue-700"
                        : selectedLog.type === "half_profit"
                          ? "bg-emerald-100 text-emerald-700"
                          : selectedLog.type === "stop_loss"
                            ? "bg-rose-100 text-rose-700"
                            : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {LOG_TYPE_LABELS[selectedLog.type] ?? selectedLog.type}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">取得単価</dt>
                <dd className="font-mono text-slate-700">{fmtInt(selectedLog.entry)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">決済単価</dt>
                <dd className="font-mono text-slate-700">
                  {selectedLog.exit != null ? fmtInt(selectedLog.exit) : "-"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">株数</dt>
                <dd className="font-mono text-slate-700">{fmtInt(selectedLog.shares)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-400">損益</dt>
                <dd
                  className={`font-mono font-semibold ${
                    selectedLog.pnl == null
                      ? "text-slate-400"
                      : selectedLog.pnl > 0
                        ? "text-emerald-600"
                        : selectedLog.pnl < 0
                          ? "text-rose-600"
                          : "text-slate-600"
                  }`}
                >
                  {selectedLog.pnl != null
                    ? `${selectedLog.pnl >= 0 ? "+" : ""}${fmtInt(selectedLog.pnl)}円`
                    : "-"}
                </dd>
              </div>
              {selectedLog.reason && (
                <div className="col-span-2">
                  <dt className="text-xs text-slate-400">理由</dt>
                  <dd className="text-slate-600 text-xs mt-0.5">{selectedLog.reason}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>
      )}

      {/* 取引履歴 */}
      <div>
        <h3 className="font-semibold text-slate-700 mb-2">取引履歴（全件・日付降順）</h3>

        {/* スマホ: タップで詳細モーダル */}
        <div className="md:hidden overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-100 text-slate-600 text-left">
                {["日付", "銘柄", "種別", "損益", ""].map((h, i) => (
                  <th key={i} className="px-2 py-2 font-medium whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedLog.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-2 py-6 text-center text-slate-400">
                    取引履歴がありません。
                  </td>
                </tr>
              )}
              {sortedLog.map((e, i) => {
                const pnl = e.pnl ?? null;
                const pnlClass =
                  pnl === null
                    ? "text-slate-400"
                    : pnl > 0
                      ? "text-emerald-600"
                      : pnl < 0
                        ? "text-rose-600"
                        : "text-slate-600";
                return (
                  <tr
                    key={i}
                    className="border-t border-slate-100 active:bg-slate-50"
                    onClick={() => setSelectedLog(e)}
                  >
                    <td className="px-2 py-1.5 whitespace-nowrap text-slate-600">{e.date}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <span className="font-mono text-slate-500">{e.code}</span>
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      <span
                        className={`inline-block rounded px-1 py-0.5 text-[10px] font-medium ${
                          e.type === "entry"
                            ? "bg-blue-100 text-blue-700"
                            : e.type === "half_profit"
                              ? "bg-emerald-100 text-emerald-700"
                              : e.type === "stop_loss"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {LOG_TYPE_LABELS[e.type] ?? e.type}
                      </span>
                    </td>
                    <td className={`px-2 py-1.5 text-right font-mono ${pnlClass}`}>
                      {pnl !== null ? `${pnl >= 0 ? "+" : ""}${fmtInt(pnl)}` : "-"}
                    </td>
                    <td className="px-2 py-1.5 text-slate-300 text-right">›</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {sortedLog.length > 0 && (
            <p className="px-3 py-2 text-[10px] text-slate-400">行をタップすると詳細を表示</p>
          )}
        </div>

        {/* デスクトップ: 全列 */}
        <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-100 text-slate-600 text-left">
                {["日付", "銘柄", "種別", "取得単価", "決済単価", "株数", "損益", "理由"].map(
                  (h, i) => (
                    <th key={i} className="px-3 py-2 font-medium whitespace-nowrap">
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody>
              {sortedLog.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                    取引履歴がありません。
                  </td>
                </tr>
              )}
              {sortedLog.map((e, i) => {
                const pnl = e.pnl ?? null;
                const pnlClass =
                  pnl === null
                    ? "text-slate-400"
                    : pnl > 0
                      ? "text-emerald-600"
                      : pnl < 0
                        ? "text-rose-600"
                        : "text-slate-600";
                return (
                  <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 whitespace-nowrap text-slate-600">{e.date}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className="font-mono text-slate-500">{e.code}</span>{" "}
                      <span className="font-medium">{e.name}</span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${
                          e.type === "entry"
                            ? "bg-blue-100 text-blue-700"
                            : e.type === "half_profit"
                              ? "bg-emerald-100 text-emerald-700"
                              : e.type === "stop_loss"
                                ? "bg-rose-100 text-rose-700"
                                : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {LOG_TYPE_LABELS[e.type] ?? e.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{fmtInt(e.entry)}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {e.exit != null ? fmtInt(e.exit) : "-"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{fmtInt(e.shares)}</td>
                    <td className={`px-3 py-2 text-right font-mono ${pnlClass}`}>
                      {pnl !== null ? `${pnl >= 0 ? "+" : ""}${fmtInt(pnl)}` : "-"}
                    </td>
                    <td className="px-3 py-2 text-slate-500 text-xs">{e.reason ?? "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 候補スクリーン成績（candidate_ledger のフォワード検証。系統×ホライズンの超過リターン） */}
      <div>
        <h3 className="font-semibold text-slate-700 mb-2">候補スクリーン成績（フォワード検証）</h3>
        {!ledger || !ledger.has_data ? (
          <p className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-400 shadow-sm">
            蓄積中（2週間程度で初回レポート）
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-left">
                  <th className="px-3 py-2 font-medium whitespace-nowrap">系統</th>
                  {ledger.horizons.map((h) => (
                    <th key={h} className="px-3 py-2 font-medium text-right whitespace-nowrap">
                      {h}営業日
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Object.entries(ledger.systems).map(([sys, buckets]) => (
                  <tr key={sys} className="border-t border-slate-100">
                    <td className="px-3 py-2 whitespace-nowrap">
                      {LEDGER_SYSTEM_LABELS[sys] ?? sys}
                    </td>
                    {ledger.horizons.map((h) => {
                      const b = buckets[String(h)];
                      if (!b || b.n === 0) {
                        return (
                          <td key={h} className="px-3 py-2 text-right text-slate-300">
                            -
                          </td>
                        );
                      }
                      const medPct = (b.median_excess ?? 0) * 100;
                      return (
                        <td key={h} className="px-3 py-2 text-right font-mono whitespace-nowrap">
                          <span
                            className={
                              medPct > 0
                                ? "text-emerald-600"
                                : medPct < 0
                                  ? "text-rose-600"
                                  : "text-slate-600"
                            }
                          >
                            {medPct >= 0 ? "+" : ""}
                            {fmtPct(medPct)}
                          </span>
                          <span className="ml-1 text-slate-400">
                            (勝率{b.win_rate != null ? Math.round(b.win_rate * 100) : "-"}% n=
                            {b.n})
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-[10px] text-slate-400">
              値=超過リターン中央値（対ユニバース中央値）。勝率=超過&gt;0の割合。
              起点はスナップショット翌営業日の調整後終値（AdjC）。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
