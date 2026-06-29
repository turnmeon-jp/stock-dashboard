"use client";

import { useCallback, useEffect, useState } from "react";
import type { ScreenEntry, ScreenStore } from "@/app/lib/types";

const short = (code?: string | null) => (code ? code.replace(/0$/, "") : "");

// トレンド判定の色調（✅押し目=緑 / 過熱・chase=黄 / 見送り=灰）
function trendTone(status?: string): string {
  const s = status ?? "";
  if (s.includes("✅")) return "text-emerald-700 bg-emerald-50";
  if (s.includes("過熱") || s.includes("chase")) return "text-amber-700 bg-amber-50";
  return "text-slate-600 bg-slate-50";
}

function fmtPct(v?: number | null): string {
  if (v === null || v === undefined) return "-";
  return `${v > 0 ? "+" : ""}${v}%`;
}

const oku = (v?: number | null) => (v === null || v === undefined ? "-" : `${(v / 1e8).toFixed(1)}億`);
// セクター中央値より割安/割高か（PER・PBRは低いほど割安、ROEは高いほど良い）
const cmpTone = (v?: number | null, med?: number | null, lowerBetter = true): string => {
  if (v == null || med == null) return "text-slate-700";
  const cheap = lowerBetter ? v < med : v > med;
  return cheap ? "text-emerald-700" : "text-rose-600";
};

function ResultCard({
  e,
  pendingVerdict,
  onEnrich,
  enriching,
}: {
  e: ScreenEntry;
  pendingVerdict: boolean;
  onEnrich?: (id: string) => void;
  enriching?: boolean;
}) {
  const t = e.trend;
  const g = e.growth;
  const c = e.concentration;
  const v = e.valuation;
  const ea = e.earnings;
  const news = e.news;
  const canEnrich = e.status === "done" && !!e.code && !e.verdict && (!news || news.length === 0);
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-mono text-slate-400">{short(e.code)}</span>{" "}
          <span className="font-semibold text-slate-800">{e.name ?? e.input}</span>
          {e.theme && <span className="ml-2 text-xs text-blue-500">{e.theme}</span>}
        </div>
        <span className="text-[11px] text-slate-400">{e.screened_at}</span>
      </div>

      {e.status === "processing" && !e.trend && (
        <p className="text-xs text-slate-400">スクリーニング処理中…</p>
      )}
      {e.status === "error" && (
        <p className="text-sm text-rose-600">エラー: {e.error}</p>
      )}
      {e.candidates && e.candidates.length > 0 && (
        <p className="text-xs text-slate-500">
          候補: {e.candidates.map((x) => `${short(x.code)} ${x.name}`).join(" / ")}
        </p>
      )}

      {/* ソース（URL要約：ヘッドレスagentが付与） */}
      {e.source && (e.source.summary || e.source.catalyst) && (
        <div className="rounded bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {e.source.title && <div className="font-medium text-slate-700">{e.source.title}</div>}
          {e.source.summary && <div className="mt-0.5">{e.source.summary}</div>}
          {e.source.catalyst && <div className="mt-0.5">カタリスト: {e.source.catalyst}</div>}
          {e.source.url && (
            <a href={e.source.url} target="_blank" rel="noreferrer" className="mt-0.5 inline-block text-blue-500 underline break-all">
              ソース
            </a>
          )}
        </div>
      )}

      {/* トレンド/エントリー */}
      {t && (
        <div className={`rounded px-3 py-2 text-sm ${trendTone(t.status)}`}>
          <div className="font-medium">{t.status ?? t.error ?? "-"}</div>
          <div className="mt-1 text-xs text-slate-500">
            株価 {t.cur ?? "-"} / SMA25 {t.sma25 ?? "-"} ・ SMA75 {t.sma75 ?? "-"} / 乖離{" "}
            {fmtPct(t.dist_pct)} / RSI {t.rsi ?? "-"}
          </div>
        </div>
      )}

      {/* 成長 + 集中 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        {g && (
          <div className="rounded border border-slate-100 px-3 py-2">
            <div className="text-slate-400 mb-1">成長</div>
            <div className="text-slate-700">
              pass={String(g.growth_pass)} / score={g.growth_score ?? "-"} / rev_yoy={" "}
              {g.rev_yoy !== null && g.rev_yoy !== undefined ? `${(g.rev_yoy * 100).toFixed(1)}%` : "-"}
            </div>
            {g.next_disclosure_est && (
              <div className="text-slate-400 mt-0.5">次回決算~{g.next_disclosure_est}</div>
            )}
          </div>
        )}
        {c && (
          <div className="rounded border border-slate-100 px-3 py-2">
            <div className="text-slate-400 mb-1">テーマ集中（総資金比）</div>
            <div className="text-slate-700">
              {Object.entries(c.theme_concentration)
                .map(([k, v]) => `${k} ${v}%`)
                .join(" / ")}
            </div>
            {c.warn && <div className="mt-0.5 text-amber-600">{c.warn}</div>}
          </div>
        )}
      </div>

      {/* V: バリュエーション文脈（セクター中央値比較） */}
      {v && (
        <div className="rounded border border-slate-100 px-3 py-2 text-xs">
          <div className="text-slate-400 mb-1">バリュエーション{v.sector ? `（${v.sector}）` : ""}</div>
          <div className="grid grid-cols-3 gap-x-3 gap-y-0.5">
            <div>PER <span className={`font-mono ${cmpTone(v.per ?? v.forward_per, v.sector_med_per)}`}>{v.per ?? v.forward_per ?? "-"}</span></div>
            <div>PBR <span className={`font-mono ${cmpTone(v.pbr, v.sector_med_pbr)}`}>{v.pbr ?? "-"}</span></div>
            <div>ROE <span className={`font-mono ${cmpTone(v.roe_pct, v.sector_med_roe, false)}`}>{v.roe_pct != null ? `${v.roe_pct}%` : "-"}</span></div>
            <div className="text-slate-400">中央{v.sector_med_per ?? "-"}</div>
            <div className="text-slate-400">中央{v.sector_med_pbr ?? "-"}</div>
            <div className="text-slate-400">中央{v.sector_med_roe != null ? `${v.sector_med_roe}%` : "-"}</div>
          </div>
        </div>
      )}

      {/* F: 直近決算ハイライト */}
      {ea && (
        <div className="rounded border border-slate-100 px-3 py-2 text-xs">
          <div className="text-slate-400 mb-1">
            直近決算ハイライト（{ea.period ?? "-"}{ea.disclosed ? ` ・${ea.disclosed}開示` : ""}）
          </div>
          <div className="text-slate-700">
            売上 {oku(ea.sales)}（YoY {fmtPct(ea.sales_yoy)}）／ 営業益 {oku(ea.op)}（YoY {fmtPct(ea.op_yoy)}）
          </div>
          <div className="text-slate-500 mt-0.5">
            通期会社予想 売上{oku(ea.f_sales)}・営業益{oku(ea.f_op)} → 進捗 売上{ea.sales_progress ?? "-"}%・営業益{ea.op_progress ?? "-"}%
          </div>
        </div>
      )}

      {/* N: 直近ニュース（詳細取得で付与） */}
      {news && news.length > 0 && (
        <div className="rounded border border-slate-100 px-3 py-2 text-xs space-y-1.5">
          <div className="text-slate-400">直近ニュース</div>
          {news.map((n, i) => (
            <div key={i} className="text-slate-700">
              {n.date && <span className="text-slate-400">{n.date} </span>}
              {n.url ? (
                <a href={n.url} target="_blank" rel="noreferrer" className="text-blue-600 underline">{n.title ?? "(記事)"}</a>
              ) : (
                <span className="font-medium">{n.title}</span>
              )}
              {n.source && <span className="text-slate-400"> [{n.source}]</span>}
              {n.takeaway && <div className="text-slate-500 mt-0.5">{n.takeaway}</div>}
            </div>
          ))}
        </div>
      )}

      {/* 詳細取得（オンデマンドで直近ニュース＋定性判定を付与） */}
      {canEnrich && onEnrich && (
        <button
          onClick={() => onEnrich(e.id)}
          disabled={enriching}
          className="rounded border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
        >
          {enriching ? "ニュース＋定性を取得中…（最大1〜2分）" : "🔎 詳細取得（直近ニュース＋定性判定）"}
        </button>
      )}

      {/* なぜこの結果か（決定論的な機械の理由・両経路） */}
      {e.reasoning && (e.reasoning.trend || e.reasoning.growth || e.reasoning.concentration) && (
        <div className="rounded border border-slate-100 bg-slate-50/70 px-3 py-2 text-xs text-slate-600 space-y-1">
          <div className="font-medium text-slate-500">なぜこの結果か</div>
          {e.reasoning.trend && <div>📈 {e.reasoning.trend}</div>}
          {e.reasoning.growth && <div>📊 {e.reasoning.growth}</div>}
          {e.reasoning.concentration && <div>⚖️ {e.reasoning.concentration}</div>}
        </div>
      )}

      {/* 定性判定（ヘッドレスagentが付与） */}
      {e.verdict ? (
        <div className="rounded border-l-4 border-blue-400 bg-blue-50 px-3 py-2 space-y-1">
          <div className="text-sm font-semibold text-blue-800">判定: {e.verdict.call ?? "-"}</div>
          {e.verdict.trend_read && (
            <div className="text-xs text-slate-700">
              <span className="text-slate-500">トレンド: </span>
              {e.verdict.trend_read}
            </div>
          )}
          {e.verdict.growth_read && (
            <div className="text-xs text-slate-700">
              <span className="text-slate-500">成長: </span>
              {e.verdict.growth_read}
            </div>
          )}
          {e.verdict.risk && (
            <div className="text-xs text-slate-700">
              <span className="text-slate-500">リスク: </span>
              {e.verdict.risk}
            </div>
          )}
          {(e.verdict.rationale || e.verdict.judgment) && (
            <div className="text-xs text-slate-700 whitespace-pre-wrap">
              <span className="text-slate-500">根拠: </span>
              {e.verdict.rationale ?? e.verdict.judgment}
            </div>
          )}
        </div>
      ) : (
        pendingVerdict && (
          <p className="text-xs text-slate-400">定性判定を生成中…（URLの読解に最大1〜2分）</p>
        )
      )}
    </div>
  );
}

export default function StockScreener({
  autoCode,
  onConsumed,
}: {
  autoCode?: string | null;
  onConsumed?: () => void;
} = {}) {
  const [input, setInput] = useState("");
  const [note, setNote] = useState("");
  const [store, setStore] = useState<ScreenStore>({ screens: [] });
  const [activeJob, setActiveJob] = useState<{ id: string; mode: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  // 初回: 履歴ロード
  useEffect(() => {
    fetch("/api/screen", { cache: "no-store" })
      .then((r) => r.json())
      .then((s: ScreenStore) => setStore(s))
      .catch(() => {});
  }, []);

  // ポーリング（送信中のジョブが確定するまで）
  useEffect(() => {
    if (!activeJob) return;
    let cancelled = false;
    // agent経路（URL読解＋判定）は数分かかりうるので長め。コード直接入力は短時間で確定。
    const deadline = Date.now() + (activeJob.mode === "agent" ? 600_000 : 90_000);
    const tick = async () => {
      try {
        const r = await fetch("/api/screen", { cache: "no-store" });
        const s: ScreenStore = await r.json();
        if (cancelled) return;
        setStore(s);
        const e = s.screens.find((x) => x.id === activeJob.id);
        // agent経路は機械doneの後にverdictをattachするので verdict/worker_exit で確定。
        // コード経路は機械の done/error で確定。
        const isFinal =
          e &&
          (activeJob.mode === "agent"
            ? !!e.verdict || !!e.worker_exit
            : e.status === "done" || e.status === "error");
        if (isFinal || Date.now() > deadline) {
          if (!isFinal) setTimedOut(true);
          setActiveJob(null);
        }
      } catch {
        /* 一時的なエラーは握りつぶして次tick */
      }
    };
    tick();
    const iv = setInterval(tick, 2500);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [activeJob]);

  const submit = useCallback(async (override?: string) => {
    const q = (override ?? input).trim();
    if (!q || submitting || activeJob) return;
    setSubmitting(true);
    setError(null);
    setTimedOut(false);
    try {
      const r = await fetch("/api/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: q, note: note.trim() }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error ?? "起動に失敗しました");
        return;
      }
      setActiveJob({ id: d.jobId, mode: d.mode });
    } catch {
      setError("通信エラー");
    } finally {
      setSubmitting(false);
    }
  }, [input, note, submitting, activeJob]);

  // 詳細取得: 既存ジョブにニュース＋定性をオンデマンド付与（agent経路で同じポーリングに乗せる）
  const enrich = useCallback(
    async (entryId: string) => {
      if (submitting || activeJob) return;
      setError(null);
      setTimedOut(false);
      try {
        const r = await fetch("/api/screen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enrich: entryId }),
        });
        const d = await r.json();
        if (!r.ok) {
          setError(d.error ?? "詳細取得の起動に失敗しました");
          return;
        }
        setActiveJob({ id: d.jobId, mode: d.mode });
      } catch {
        setError("通信エラー");
      }
    },
    [submitting, activeJob],
  );

  // 発掘タブからコードを受け取ったら自動でスクリーニング（ハック→精査の動線）
  useEffect(() => {
    if (!autoCode) return;
    setInput(autoCode);
    submit(autoCode);
    onConsumed?.();
    // autoCode の変化のみで発火（submit はクロージャ参照）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCode]);

  const activeEntry = activeJob ? store.screens.find((x) => x.id === activeJob.id) : undefined;
  const history = store.screens.filter((x) => x.id !== activeJob?.id);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <label className="block text-sm font-medium text-slate-700">
          気になる銘柄を入力（ニュース/XのURL、または 銘柄コード/銘柄名）
        </label>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="https://… または 7203 / トヨタ"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
        />
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="メモ（なぜ気になったか・材料など。任意）"
          rows={2}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={() => submit()}
            disabled={submitting || !!activeJob || !input.trim()}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-300"
          >
            {activeJob ? "処理中…" : submitting ? "送信中…" : "スクリーニング"}
          </button>
          {activeJob && (
            <span className="text-xs text-slate-500">
              {activeJob.mode === "agent"
                ? "URLを読解し判定中（最大1〜2分）"
                : "機械スクリーニング中…"}
            </span>
          )}
          {error && <span className="text-xs text-rose-600">{error}</span>}
          {timedOut && (
            <span className="text-xs text-amber-600">
              まだ処理中の可能性があります。少し待ってリロードするか、logs/screen.*.log を確認してください。
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-400">
          URL入力時はヘッドレス Claude Code が読解→ticker特定→機械スクリーニング→定性判定を行います（API課金なし）。
          コード/名の直接入力は機械スクリーニングのみ（即時）。
        </p>
      </div>

      {activeEntry && (
        <ResultCard
          e={activeEntry}
          pendingVerdict={!!activeJob && activeJob.mode === "agent" && !activeEntry.verdict}
          onEnrich={enrich}
          enriching={activeJob?.id === activeEntry.id}
        />
      )}

      {history.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-600">これまでのスクリーニング</h3>
          {history.map((e) => (
            <ResultCard
              key={e.id}
              e={e}
              pendingVerdict={false}
              onEnrich={enrich}
              enriching={activeJob?.id === e.id}
            />
          ))}
        </div>
      )}

      {store.screens.length === 0 && !activeJob && (
        <p className="py-4 text-center text-sm text-slate-400">
          まだスクリーニング結果がありません。上で銘柄を入力してください。
        </p>
      )}
    </div>
  );
}
