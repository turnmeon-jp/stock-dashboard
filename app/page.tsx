import { readSignals } from "@/app/lib/signals";
import { readMeta } from "@/app/lib/meta";
import { fmtYen } from "@/app/lib/format";
import DashboardTabs from "@/app/components/DashboardTabs";
import RegimeBanner from "@/app/components/RegimeBanner";

// signals.json をリクエスト毎に読み直す
export const dynamic = "force-dynamic";

function fmtDateTime(s: string | null): string {
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function Home() {
  const [data, meta] = await Promise.all([readSignals(), readMeta()]);

  return (
    <>
      {/* タブバー（DashboardTabs先頭のnav）を画面最上部＝タイトルより上に置くため、
          ヘッダーはJSXとして渡しタブバーの直下に描画する（2026-07-09 ユーザー要望）。
          最上部密着のため上パディングは外す（pt-0） */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-2 pb-4 sm:px-4 sm:pb-6">
        <DashboardTabs
          candidates={data.candidates}
          message={data.message}
          regimeBanner={<RegimeBanner regime={data.regime} />}
          header={
            <header className="border-b border-slate-200 bg-white">
              <div className="px-1 py-3 sm:py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-1 sm:gap-2">
                  <h1 className="text-base font-bold text-slate-800 sm:text-xl">株式運用ダッシュボード</h1>
                  <p className="text-xs text-slate-400">裁量エントリー × 機械的出口規律</p>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                  <span>生成: <span className="text-slate-700">{fmtDateTime(data.generated_at)}</span></span>
                  <span>基準日: <span className="text-slate-700">{data.as_of ?? "-"}</span></span>
                  <span>
                    候補 <span className="text-slate-700">{data.n_candidates}件</span>
                    <span className="mx-1 text-slate-300">/</span>
                    適合 <span className="text-emerald-700 font-medium">{data.n_edge_aligned}件</span>
                  </span>
                  <span>
                    総資金（実弾）{" "}
                    <span className="text-slate-700 font-mono">
                      {meta.capital.real_total != null ? fmtYen(meta.capital.real_total) : "—"}
                    </span>
                  </span>
                </div>
              </div>
            </header>
          }
        />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-3 text-center text-[11px] text-slate-400">
          本ツールは自己運用の補助を目的としたものであり、投資助言ではありません。投資判断は自己責任で行ってください。
        </div>
      </footer>
    </>
  );
}
