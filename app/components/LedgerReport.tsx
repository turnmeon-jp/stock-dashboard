"use client";

import { useEffect, useState } from "react";
import type {
  LedgerReportResponse,
  LedgerSystemReport,
  LedgerVerdict,
} from "@/app/lib/types";
import { fmtInt, fmtPct } from "@/app/lib/format";

// 系統キー（pipeline/candidate_ledger.py SOURCES）→ 表示ラベル。未知の系統（今後の追加）は
// 生キーのままフォールバック表示する（setupLabel と同じ方針。壊れず表示できることを優先）。
const SYSTEM_LABELS: Record<string, string> = {
  edge_aligned: "適合候補(Layer3)",
  growth_pass: "成長フィルタ通過",
  domain_screen: "品質×成長スクリーン",
  watchlist: "ウォッチ登録",
  revision_up: "上方修正",
  addon_reco: "買い増し推奨",
  lvh_activist: "アクティビスト大量保有",
  entry_funnel: "エントリー厳選ファネル",
  turnaround: "黒字転換トリガー",
  time_stop: "時間ストップ回避",
  addon_event_reco: "イベント買い増し推奨",
  partial_tp_reco: "部分利確推奨",
};
function systemLabel(s: string): string {
  return SYSTEM_LABELS[s] ?? s;
}

const HORIZON_LABELS: Record<string, string> = {
  "5": "5営業日",
  "20": "20営業日",
  "60": "60営業日",
  "120": "120営業日",
};

const VERDICT_ORDER: Record<LedgerVerdict, number> = {
  promote_candidate: 0,
  demote_candidate: 1,
  watch: 2,
  stale: 3,
  insufficient_n: 4,
};

const VERDICT_BADGE: Record<LedgerVerdict, { label: string; cls: string; hint: string }> = {
  promote_candidate: {
    label: "🟢 昇格候補",
    cls: "bg-emerald-100 text-emerald-800",
    hint: "有効な抽出方法かもしれない兆しあり",
  },
  demote_candidate: {
    label: "🔴 廃止候補",
    cls: "bg-rose-100 text-rose-800",
    hint: "この抽出方法はやめた方がよさそう",
  },
  insufficient_n: {
    label: "⚪ 標本不足",
    cls: "bg-slate-100 text-slate-500",
    hint: "まだ判定に十分なデータ量がない",
  },
  stale: {
    label: "🟡 発火不足",
    cls: "bg-amber-100 text-amber-700",
    hint: "最近この条件に該当する銘柄が出ていない",
  },
  watch: {
    label: "🔵 観察中",
    cls: "bg-blue-100 text-blue-700",
    hint: "判断保留、引き続き様子見",
  },
};

function verdictOf(entry: LedgerSystemReport): LedgerVerdict {
  return entry.verdict ?? "insufficient_n";
}

// 超過リターン（比率）→ 符号付き%表示。正=緑・負=赤・null=薄字「-」
function fmtExcess(v: number | null | undefined): string {
  if (v === null || v === undefined) return "-";
  const pct = v * 100;
  return `${pct > 0 ? "+" : ""}${fmtPct(pct, 1)}`;
}
function excessTone(v: number | null | undefined): string {
  if (v === null || v === undefined) return "text-slate-300";
  if (v > 0) return "text-emerald-600";
  if (v < 0) return "text-rose-600";
  return "text-slate-600";
}
// 勝率（比率0-1）→ %表示
function fmtRate(v: number | null | undefined): string {
  if (v === null || v === undefined) return "-";
  return fmtPct(v * 100, 0);
}
// n が最小標本数未満なら薄字にする（判定の信頼性が低いことの視覚化）
function nTone(n: number | null | undefined, minN: number): string {
  return (n ?? 0) < minN ? "text-slate-300" : "text-slate-700";
}

function CriteriaSummary({ data }: { data: LedgerReportResponse }) {
  const c = data.ledger_criteria;
  const horizon = data.verdict_horizon ?? c?.verdict_horizon ?? 20;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 space-y-2">
      <p className="font-medium text-slate-500">
        この表は銘柄の推奨ではなく、抽出方法（系統）ごとの「その後の成績」の成績表。
      </p>
      <p className="flex flex-wrap gap-x-4 gap-y-1">
        <span>
          判定ホライズン: <b className="font-mono">{horizon}営業日</b>
        </span>
        <span>
          昇格の最小標本数: <b className="font-mono">n≥{c?.min_n_promote ?? 20}</b>
        </span>
        <span>
          廃止の最小標本数: <b className="font-mono">n≥{c?.min_n_demote ?? 30}</b>
        </span>
        <span>
          昇格の勝率閾値: <b className="font-mono">≥{fmtRate(c?.promote_winrate ?? 0.55)}</b>
        </span>
        <span>
          発火不足判定: <b className="font-mono">{c?.stale_days ?? 120}暦日</b>無発火
        </span>
      </p>
      <p className="font-medium text-amber-700">
        ⚠ verdict は候補提示のみ。系統の昇格・廃止の最終判断は人間が行う（自動でエントリー条件・SOURCESは変更されない）。
      </p>
    </div>
  );
}

function VerdictBadge({ v }: { v: LedgerVerdict }) {
  const b = VERDICT_BADGE[v];
  return (
    <span
      title={b.hint}
      className={`inline-block cursor-help whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ${b.cls}`}
    >
      {b.label}
    </span>
  );
}

function HorizonDetailTable({ entry, horizons }: { entry: LedgerSystemReport; horizons: string[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-100 text-slate-500 text-left">
            <th className="px-2 py-1.5 font-medium whitespace-nowrap">ホライズン</th>
            <th className="px-2 py-1.5 font-medium text-right whitespace-nowrap cursor-help" title="n＝標本数。判定に使ったトレード件数">
              n
            </th>
            <th className="px-2 py-1.5 font-medium text-right whitespace-nowrap cursor-help" title="市場平均に勝った割合">
              勝率
            </th>
            <th
              className="px-2 py-1.5 font-medium text-right whitespace-nowrap cursor-help"
              title="ユニバース（市場全体）の中央値と比べた超過リターン"
            >
              中央値超過
            </th>
            <th className="px-2 py-1.5 font-medium text-right whitespace-nowrap cursor-help" title="ユニバース平均と比べた超過リターンの平均">
              平均超過
            </th>
            <th
              className="px-2 py-1.5 font-medium text-right whitespace-nowrap cursor-help"
              title="成績上位10%だけに絞った場合の平均超過リターン（大化けの可能性の目安）"
            >
              上位10%平均
            </th>
          </tr>
        </thead>
        <tbody>
          {horizons.map((h) => {
            const b = entry[h as "5" | "20" | "60" | "120"];
            return (
              <tr key={h} className="border-t border-slate-100">
                <td className="px-2 py-1.5 whitespace-nowrap text-slate-500">
                  {HORIZON_LABELS[h] ?? `${h}営業日`}
                </td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtInt(b?.n ?? 0)}</td>
                <td className="px-2 py-1.5 text-right font-mono">{fmtRate(b?.win_rate)}</td>
                <td className={`px-2 py-1.5 text-right font-mono ${excessTone(b?.median_excess)}`}>
                  {fmtExcess(b?.median_excess)}
                </td>
                <td className={`px-2 py-1.5 text-right font-mono ${excessTone(b?.mean_excess)}`}>
                  {fmtExcess(b?.mean_excess)}
                </td>
                <td className={`px-2 py-1.5 text-right font-mono ${excessTone(b?.tail_mean_top10pct)}`}>
                  {fmtExcess(b?.tail_mean_top10pct)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SystemRow({
  system,
  entry,
  minNPromote,
  horizons,
  open,
  onToggle,
}: {
  system: string;
  entry: LedgerSystemReport;
  minNPromote: number;
  horizons: string[];
  open: boolean;
  onToggle: () => void;
}) {
  const verdict = verdictOf(entry);
  const detail = entry.verdict_detail;
  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50 ${open ? "bg-blue-50" : ""}`}
      >
        <td className="px-3 py-2 whitespace-nowrap">
          <span className={`inline-block transition-transform mr-1 text-[10px] text-slate-400 ${open ? "rotate-90" : ""}`}>
            ▶
          </span>
          <span className="font-medium">{systemLabel(system)}</span>
          <span className="ml-1 font-mono text-[10px] text-slate-300">{system}</span>
        </td>
        <td className="px-3 py-2 whitespace-nowrap">
          <VerdictBadge v={verdict} />
        </td>
        <td className={`hidden sm:table-cell px-3 py-2 text-right font-mono whitespace-nowrap ${nTone(detail?.n, minNPromote)}`}>
          {fmtInt(detail?.n ?? 0)}
        </td>
        <td className={`hidden sm:table-cell px-3 py-2 text-right font-mono whitespace-nowrap ${excessTone(detail?.median_excess)}`}>
          {fmtExcess(detail?.median_excess)}
        </td>
        <td className="hidden sm:table-cell px-3 py-2 text-right font-mono whitespace-nowrap text-slate-600">
          {fmtRate(detail?.winrate)}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="p-0">
            <div className="bg-slate-50 px-3 py-2">
              <HorizonDetailTable entry={entry} horizons={horizons} />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function LedgerReport() {
  const [data, setData] = useState<LedgerReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [openSystem, setOpenSystem] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ledger")
      .then((r) => r.json())
      .then((d: LedgerReportResponse) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <p className="py-6 text-center text-slate-400 text-sm">読み込み中…</p>;
  }
  if (!data || !data.ok || Object.keys(data.systems).length === 0) {
    return (
      <p className="py-6 text-center text-slate-400 text-sm">
        {data?.message ?? "検証データがありません（pipeline/candidate_ledger.py --report を実行）。"}
      </p>
    );
  }

  const minNPromote = data.ledger_criteria?.min_n_promote ?? 20;
  const horizons = (data.horizons.length ? data.horizons : [5, 20, 60, 120]).map(String);

  const rows = Object.entries(data.systems).sort(([, a], [, b]) => {
    const oa = VERDICT_ORDER[verdictOf(a)];
    const ob = VERDICT_ORDER[verdictOf(b)];
    if (oa !== ob) return oa - ob;
    return (b.verdict_detail?.n ?? 0) - (a.verdict_detail?.n ?? 0);
  });

  return (
    <div className="space-y-4">
      <CriteriaSummary data={data} />

      {!data.has_data && (
        <p className="text-xs text-slate-400">
          まだ評価済み（forward確定）の行がありません。発火から日が浅いため既定状態＝全系統「標本不足」。
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>更新: {data.generated_at || "-"}</span>
        <span>台帳行数: {fmtInt(data.n_ledger_rows)}</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-600 text-left">
              <th className="px-3 py-2 font-medium whitespace-nowrap" title="候補の抽出方法（採用条件のパターン）">系統</th>
              <th className="px-3 py-2 font-medium whitespace-nowrap" title="この抽出方法を続けるべきかの機械判定（最終判断は人間）">判定</th>
              <th className="hidden sm:table-cell px-3 py-2 font-medium text-right whitespace-nowrap cursor-help" title="n＝標本数。判定に使ったトレード件数">
                n
              </th>
              <th
                className="hidden sm:table-cell px-3 py-2 font-medium text-right whitespace-nowrap cursor-help"
                title="20営業日後、ユニバース中央値と比べた超過リターン"
              >
                中央値超過(20d)
              </th>
              <th className="hidden sm:table-cell px-3 py-2 font-medium text-right whitespace-nowrap cursor-help" title="20営業日後、市場平均に勝った割合">
                勝率(20d)
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([system, entry]) => (
              <SystemRow
                key={system}
                system={system}
                entry={entry}
                minNPromote={minNPromote}
                horizons={horizons}
                open={openSystem === system}
                onToggle={() => setOpenSystem(openSystem === system ? null : system)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-400">
        行タップで5/20/60/120営業日の全ホライズン成績を展開表示。中央値超過リターンはユニバース中央値比（比率）。
      </p>
    </div>
  );
}
