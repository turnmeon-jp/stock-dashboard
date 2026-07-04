"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { EntryFunnelResponse, FunnelEntry } from "@/app/lib/entryFunnel";
import { fetchDossierList, type DossierSummary } from "@/app/lib/dossier";
import { marginBadge, shortBadge } from "@/app/lib/margin";
import DossierPanel from "./DossierPanel";

const short = (code: string) => code.replace(/0$/, "");
const yen = (v: number | null | undefined) =>
  v == null ? "-" : Math.round(v).toLocaleString("ja-JP");

// pipeline/dossier.py の VERDICT_CALLS のうち拒否権を発動する2値（entry_funnel.py と同一契約）
const REJECT_CALLS = new Set(["落選", "重大懸念"]);

function stanceTone(stance?: string): string {
  if (stance === "normal") return "bg-emerald-50 border-emerald-200 text-emerald-800";
  if (stance === "stop") return "bg-red-50 border-red-200 text-red-800";
  return "bg-amber-50 border-amber-200 text-amber-800";
}

function stanceLabel(stance?: string): string {
  if (stance === "normal") return "新規OK";
  if (stance === "stop") return "新規停止";
  return "新規は半分以下";
}

function dossierBadge(call: string | null | undefined): { label: string; tone: string; title: string } {
  if (call === "落選事由なし")
    return { label: "ドシエ✓ 落選事由なし", tone: "bg-emerald-100 text-emerald-700", title: "LLM落選判定を通過（買い推奨ではない）" };
  if (call === "懸念あり・監視")
    return { label: "ドシエ: 懸念あり・監視", tone: "bg-amber-100 text-amber-700", title: "落選ではないがソフトな監視点あり。詳細は下のドシエ参照" };
  return { label: "ドシエ未審査", tone: "bg-slate-100 text-slate-500", title: "ドシエ未生成。下のパネルから生成できます（拒否権チェック前）" };
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-slate-400">{label}</span>
      <span className={`text-sm font-medium tabular-nums ${tone ?? "text-slate-700"}`}>{value}</span>
    </div>
  );
}

function EntryCard({
  e,
  dossier,
  dossierListReady,
  muted,
}: {
  e: FunnelEntry;
  dossier?: DossierSummary;
  dossierListReady: boolean;
  muted: boolean;
}) {
  const mb = marginBadge(e);
  const sb = shortBadge(e);
  const db = dossierBadge(dossier?.verdict_call ?? e.dossier_call);
  return (
    <div className={`rounded-lg border border-slate-200 bg-white p-3 shadow-sm ${muted ? "opacity-60" : ""}`}>
      {/* ヘッダ: 銘柄・補助タグ・ドシエ判定 */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-800">{e.name}</span>
            <span className="text-xs text-slate-400">{short(e.code)}</span>
            {e.change_trigger && (
              <span
                className="rounded bg-sky-100 px-1 text-[10px] font-semibold text-sky-700 cursor-help"
                title={`直近7日以内の上方修正 ${e.revision_pct != null ? `+${e.revision_pct}%` : ""}（${e.revision_date ?? "-"}）`}
              >
                変化⤴
              </span>
            )}
            {e.turnaround_recent && (
              <span
                className="rounded bg-teal-100 px-1 text-[10px] font-semibold text-teal-700 cursor-help"
                title={`黒字転換（${e.turnaround_kind === "actual" ? "実績" : "予想"}・${e.turnaround_date ?? "-"}）。台帳で事後測定中の変化トリガー`}
              >
                黒転
              </span>
            )}
            {e.lvh_recent && (
              <span
                className="rounded bg-violet-100 px-1 text-[10px] font-semibold text-violet-700 cursor-help"
                title="直近7日以内にアクティビスト大量保有報告あり（注意喚起・売買シグナルではない）"
              >
                🎯
              </span>
            )}
            {mb && (
              <span title={mb.title} className={`rounded px-1 text-[10px] font-semibold cursor-help ${mb.tone}`}>
                {mb.label}
              </span>
            )}
            {sb && (
              <span title={sb.title} className={`rounded px-1 text-[10px] font-semibold cursor-help ${sb.tone}`}>
                {sb.label}
              </span>
            )}
            {e.in_watchlist && (
              <span className="rounded bg-blue-50 px-1 text-[10px] text-blue-600" title="ウォッチリスト登録済み">
                ウォッチ済
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-400">
            {e.sector}
            {e.setup_type ? ` · ${e.setup_type}` : ""}
          </div>
        </div>
        <span title={db.title} className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-semibold cursor-help ${db.tone}`}>
          {db.label}
        </span>
      </div>

      {/* 現況・成長 */}
      <div className="mt-2 grid grid-cols-4 gap-2 border-t border-slate-100 pt-2">
        <Metric label="RSI14" value={e.rsi14 != null ? `${e.rsi14}` : "-"} />
        <Metric
          label="SMA25乖離"
          value={e.dist_sma25_pct != null ? `${e.dist_sma25_pct > 0 ? "+" : ""}${e.dist_sma25_pct}%` : "-"}
        />
        <Metric label="成長スコア" value={e.growth_score != null ? `${e.growth_score}` : "-"} />
        <Metric
          label="売上YoY"
          value={e.growth_rev_yoy != null ? `${e.growth_rev_yoy > 0 ? "+" : ""}${Math.round(e.growth_rev_yoy * 100)}%` : "-"}
        />
      </div>

      {/* 注文プラン（IFDOCO）: これが決まっているから入ってよい */}
      <div className="mt-2 rounded bg-slate-50 p-2">
        <div className="mb-1 text-[10px] font-semibold text-slate-500">注文プラン（IFDOCO・出口は入る前に確定）</div>
        <div className="grid grid-cols-3 gap-2">
          <Metric label="IFD 買い" value={yen(e.trigger_price)} tone="text-blue-700" />
          <Metric label="OCO 損切" value={yen(e.stop_loss)} tone="text-red-600" />
          <Metric label="OCO 利確" value={yen(e.tp_first)} tone="text-emerald-700" />
        </div>
        <div className="mt-1 text-[11px] text-slate-500">
          {e.shares != null ? (
            <>
              {e.shares.toLocaleString()}株 / 投資 ¥{yen(e.invested)} / リスク ¥{yen(e.risk_yen)}
              {e.effective_r_pct != null && `（R=${e.effective_r_pct}%）`}
            </>
          ) : (
            <span className="text-amber-600">サイズ不能</span>
          )}
        </div>
        {e.trail_note && <div className="mt-0.5 text-[10px] text-slate-400">{e.trail_note}</div>}
      </div>

      <div className="mt-2 flex items-center justify-end">
        <Link href={`/stock/${e.code}`} className="text-xs text-blue-600 hover:underline">
          チャート →
        </Link>
      </div>

      <DossierPanel code={e.code} initial={dossier} listReady={dossierListReady} />
    </div>
  );
}

export default function EntryFunnel() {
  const [data, setData] = useState<EntryFunnelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [dossierMap, setDossierMap] = useState<Map<string, DossierSummary>>(new Map());
  const [dossierListReady, setDossierListReady] = useState(false);

  useEffect(() => {
    fetch("/api/entry-funnel")
      .then((r) => r.json())
      .then((d: EntryFunnelResponse) => setData(d))
      .catch(() =>
        setData({
          ok: false, message: "取得に失敗しました。", generated_at: null, as_of: null,
          regime: null, gate: null, funnel: [], n_pending_dossier: 0,
          entries: [], rejected: [], lvh_recent: [],
        })
      )
      .finally(() => setLoading(false));
  }, []);

  // ドシエ一覧を一度だけ取得（バッジ表示＋日中に生成されたドシエの拒否権を即反映するライブ上書き）
  useEffect(() => {
    fetchDossierList()
      .then((list) => setDossierMap(new Map(list.map((d) => [d.code, d]))))
      .finally(() => setDossierListReady(true));
  }, []);

  // バッチ後に生成されたドシエが「落選/重大懸念」なら entries から rejected へ移す（判定契約は entry_funnel.py と同一）
  const { liveEntries, liveRejected } = useMemo(() => {
    const rejected = (data?.rejected ?? []).map((r) => ({
      code: r.code, name: r.name, call: r.dossier_call, rationale: r.dossier_rationale ?? null,
    }));
    const entries: FunnelEntry[] = [];
    for (const e of data?.entries ?? []) {
      const call = dossierMap.get(e.code)?.verdict_call ?? e.dossier_call;
      if (call && REJECT_CALLS.has(call)) {
        rejected.push({ code: e.code, name: e.name, call, rationale: null });
      } else {
        entries.push(e);
      }
    }
    return { liveEntries: entries, liveRejected: rejected };
  }, [data, dossierMap]);

  if (loading) return <p className="text-sm text-slate-400">読み込み中…</p>;
  if (!data) return <p className="text-sm text-red-500">データがありません。</p>;

  const gate = data.gate;
  const isStop = gate?.stance === "stop";

  return (
    <div>
      {/* レジームゲート: 銘柄を見る前に「今日どれだけ入ってよいか」を決める */}
      {gate && (
        <div className={`mb-3 rounded-lg border px-3 py-2 ${stanceTone(gate.stance)}`}>
          <span className="font-semibold">{stanceLabel(gate.stance)}</span>
          <span className="ml-2 text-sm">{gate.note}</span>
          {data.regime && (
            <span className="ml-2 text-xs opacity-70">
              （market: {data.regime.market_regime ?? "-"} / growth: {data.regime.growth_regime ?? "-"}）
            </span>
          )}
        </div>
      )}

      {/* ファネル件数 */}
      <div className="mb-3 flex flex-wrap items-center gap-1 text-sm text-slate-600">
        {data.funnel.map((s, i) => (
          <span key={s.key} className="flex items-center gap-1">
            {i > 0 && <span className="text-slate-300">→</span>}
            <span className={i === data.funnel.length - 1 ? "font-semibold text-slate-800" : ""}>
              {s.label} <span className="tabular-nums">{s.key === "dossier" ? liveEntries.length : s.n}</span>
            </span>
          </span>
        ))}
        {data.n_pending_dossier > 0 && (
          <span className="ml-1 text-xs text-slate-400">（うち未審査 {data.n_pending_dossier}）</span>
        )}
        {data.as_of && <span className="ml-auto text-xs text-slate-400">{data.as_of} 時点</span>}
      </div>

      {/* 絞り込みの説明（折りたたみ） */}
      <details className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium text-slate-700">
          📋 どう絞り込んでいる？（4段ファネル）
        </summary>
        <div className="mt-2 space-y-1 text-slate-600">
          <p><b>1. レジームゲート</b>：地合い（risk_on / neutral / risk_off）で今日の新規参入量を先に決める。</p>
          <p><b>2. エッジ整合</b>：バックテストで勝てた唯一の条件「中型流動性 × RS健全帯 × 押し目 × risk_on」。</p>
          <p><b>3. ×成長</b>：Layer2成長フィルタ（growth_pass）。成長のない品質株は土俵違いなので落とす。</p>
          <p><b>4. ドシエ拒否権</b>：LLM落選判定。「落選」「重大懸念」は機械的に除外（下の落選一覧）。未審査は通過扱いだが、精査前にドシエ生成を推奨。</p>
          <p className="text-slate-500">
            補助タグ（絞り込みには使わない参考情報）：
            <span className="mx-1 rounded bg-emerald-100 px-1 text-[11px] text-emerald-700">需給◎</span>=信用残層別（OOS +0.33R/+0.40R 検証済）
            <span className="mx-1 rounded bg-sky-100 px-1 text-[11px] text-sky-700">変化⤴</span>=7日以内の上方修正
            <span className="mx-1 rounded bg-violet-100 px-1 text-[11px] text-violet-700">🎯</span>=アクティビスト大量保有（+60d勝率55.6%）
          </p>
          <p className="rounded bg-amber-50 px-2 py-1 text-[13px] text-amber-800">
            ⚠️ これは「買い推奨」ではなく精査キュー。エントリーはチャートを自分の目で見て裁量で。
            ただし<b>出口（損切・利確）が事前に決まっていない銘柄には入らない</b>のが唯一の絶対ルール。
          </p>
        </div>
      </details>

      {data.message && (
        <p className="mb-3 rounded bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          {data.message}
        </p>
      )}

      {/* 厳選エントリー候補 */}
      {liveEntries.length === 0 ? (
        <p className="mb-3 rounded bg-slate-50 border border-slate-200 px-3 py-3 text-sm text-slate-500">
          全段を通過した候補が今日はありません。無理に入らないのが正解の日です。
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {liveEntries.map((e) => (
            <EntryCard
              key={e.code}
              e={e}
              dossier={dossierMap.get(e.code)}
              dossierListReady={dossierListReady}
              muted={isStop}
            />
          ))}
        </div>
      )}

      {/* ドシエ落選（拒否権発動） */}
      {liveRejected.length > 0 && (
        <details className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium text-red-700">
            ⚠ ドシエ落選で除外 {liveRejected.length}件
          </summary>
          <ul className="mt-2 space-y-2">
            {liveRejected.map((r) => (
              <li key={r.code} className="text-red-800">
                <span className="font-semibold">{r.name}</span>
                <span className="ml-1 text-xs text-red-500">{short(r.code)}</span>
                <span className="ml-2 rounded bg-red-100 px-1 text-[11px] font-semibold">{r.call}</span>
                {r.rationale && <p className="mt-0.5 text-[12px] text-red-700/80">{r.rationale}</p>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* 直近アクティビスト検知（候補外も精査キューに出す） */}
      {data.lvh_recent.length > 0 && (
        <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2">
          <div className="text-sm font-medium text-violet-800">🎯 直近7日のアクティビスト大量保有報告</div>
          <p className="text-[11px] text-violet-600">
            検証: 提出後60日勝率55.6%（辛勝）。注意喚起であり売買シグナルではない。候補外でも精査の価値あり。
          </p>
          <ul className="mt-1 space-y-1 text-sm text-violet-900">
            {data.lvh_recent.map((a) => (
              <li key={`${a.docID ?? a.code}-${a.date}`} className="flex flex-wrap items-center gap-2">
                <span className="text-xs tabular-nums text-violet-500">{a.date}</span>
                <span className="font-medium">{a.name}</span>
                <span className="text-xs text-violet-400">{short(a.code)}</span>
                <span className="text-xs text-violet-600">{a.filer}</span>
                {a.in_candidates ? (
                  <span className="rounded bg-violet-200 px-1 text-[10px] text-violet-800">候補内</span>
                ) : (
                  <span className="rounded bg-white px-1 text-[10px] text-violet-500">候補外</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-3 text-xs text-slate-400">
        エントリーは裁量（チャートを自分の目で確認）。約定したら exit_monitor へ登録し、損切・トレールは機械に従う。
        結果は勝ち負けにかかわらず検証台帳・ポストモーテムへ。
      </p>
    </div>
  );
}
