import Link from "next/link";
import { notFound } from "next/navigation";
import { readChart } from "@/app/lib/charts";
import { readSignals } from "@/app/lib/signals";
import { fmtInt, fmtNum, fmtPct, fmtYen } from "@/app/lib/format";
import { setupLabel } from "@/app/lib/constants";
import type { Candidate } from "@/app/lib/types";
import CandleChart from "@/app/components/CandleChart";

// チャート/signals は都度読み直す
export const dynamic = "force-dynamic";

function lastValue(arr: { value: number }[]): number | null {
  return arr.length ? arr[arr.length - 1].value : null;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-0.5 font-mono text-base font-semibold text-slate-800">{value}</div>
    </div>
  );
}

function OrderPlan({ c }: { c: Candidate }) {
  return (
    <div className="rounded-lg border-l-4 border-amber-400 bg-amber-50 p-4 text-sm leading-relaxed text-slate-800">
      <p className="mb-2 font-semibold">
        IFDOCO注文プラン
        <span className="ml-2 text-xs font-normal text-slate-500">
          {c.available_at ?? "-"} 以降に発注
        </span>
      </p>

      {/* 第1注文 */}
      <div className="mb-2 rounded border border-amber-300 bg-white px-3 py-2">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          ① IFD 第1注文（エントリー）
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span>
            買い指値{" "}
            <span className="font-mono font-bold text-blue-700">{fmtNum(c.trigger_price)}</span>
          </span>
          <span>
            株数 <span className="font-semibold">{fmtInt(c.shares)}株</span>
          </span>
          <span className="text-slate-500">投資額 {fmtYen(c.invested)}</span>
        </div>
      </div>

      {/* 第2注文 OCO */}
      <div className="rounded border border-amber-300 bg-white px-3 py-2">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
          ② OCO 第2注文（第1注文約定後に自動発注）
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span>
            損切（逆指値）{" "}
            <span className="font-mono font-bold text-rose-600">{fmtNum(c.stop_loss)}</span>
          </span>
          <span className="text-slate-400">OR</span>
          <span>
            利確（指値）{" "}
            <span className="font-mono font-bold text-emerald-700">{fmtNum(c.tp_first)}</span>
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          許容損失 {fmtYen(c.risk_yen)}（{fmtPct(c.effective_r_pct, 2)}）
          {c.trail_note ? `　${c.trail_note}` : ""}
        </p>
      </div>
    </div>
  );
}

export default async function StockPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const [chart, signals] = await Promise.all([readChart(code), readSignals()]);

  if (!chart) notFound();

  const candidate = signals.candidates.find((c) => c.code === code) ?? null;

  const lastClose = chart.candles.length
    ? chart.candles[chart.candles.length - 1].close
    : null;
  const lastSma25 = lastValue(chart.sma25);
  const lastRsi = lastValue(chart.rsi14);
  // SMA25 乖離: candidate 優先、無ければチャートから算出
  const distSma25 =
    candidate?.dist_sma25_pct ??
    (lastClose !== null && lastSma25 ? ((lastClose - lastSma25) / lastSma25) * 100 : null);

  return (
    <>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-2 py-3 sm:px-4 sm:py-4">
          <Link href="/" className="text-sm text-blue-600 hover:underline">
            ← ダッシュボードへ戻る
          </Link>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <h1 className="text-xl font-bold text-slate-800">
              <span className="font-mono text-slate-400">{chart.code}</span> {chart.name}
            </h1>
            {chart.edge_aligned && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                ✓ 検証エッジ適合
              </span>
            )}
            {candidate && (
              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-700">
                {setupLabel(candidate.setup_type)}
              </span>
            )}
            <span className="text-xs text-slate-400">基準日: {chart.as_of}</span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-2 py-4 sm:px-4 sm:py-6">
        <section className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="終値" value={fmtNum(lastClose)} />
          <Stat label="SMA25乖離" value={distSma25 === null ? "-" : fmtPct(distSma25)} />
          <Stat label="RSI(14)" value={fmtNum(lastRsi)} />
          <Stat label="RS120(%)" value={candidate ? fmtPct(candidate.rs120) : "-"} />
          <Stat label="ATR(14)" value={candidate ? fmtNum(candidate.atr14) : "-"} />
        </section>

        <section className="mb-5 rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span>
              <span className="inline-block h-2 w-3 align-middle" style={{ background: "#2563eb" }} />{" "}
              SMA25
            </span>
            <span>
              <span className="inline-block h-2 w-3 align-middle" style={{ background: "#ea580c" }} />{" "}
              SMA75
            </span>
            <span className="text-green-700">— 指値</span>
            <span className="text-rose-600">— 損切</span>
            <span className="text-slate-400">— 利確目安</span>
          </div>
          <CandleChart data={chart} />
        </section>

        {candidate ? (
          <OrderPlan c={candidate} />
        ) : (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
            この銘柄は現在のエントリー候補に含まれていないため、注文プランはありません。
          </p>
        )}
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3 text-center text-[11px] text-slate-400">
          本ツールは自己運用の補助を目的としたものであり、投資助言ではありません。投資判断は自己責任で行ってください。
        </div>
      </footer>
    </>
  );
}
