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

function ResultCard({ e, pendingVerdict }: { e: ScreenEntry; pendingVerdict: boolean }) {
  const t = e.trend;
  const g = e.growth;
  const c = e.concentration;
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
        />
      )}

      {history.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-600">これまでのスクリーニング</h3>
          {history.map((e) => (
            <ResultCard key={e.id} e={e} pendingVerdict={false} />
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
