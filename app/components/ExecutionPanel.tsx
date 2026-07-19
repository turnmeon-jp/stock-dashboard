"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  Candidate,
  CandidateReview,
  ExecutionCandidate,
  ExecutionIntent,
  ExecutionNeedStop,
  ExecutionResponse,
  PmGateResult,
} from "@/app/lib/types";
import { fmtInt, fmtNum, fmtPct, fmtYen } from "@/app/lib/format";
import { setupLabel, TOP_N } from "@/app/lib/constants";
// 資金メタ情報（output/meta.json）。PaperTrade.tsx と同じ配信経路（/api/meta）を共用する。
// 承認確認ダイアログのR換算（想定損失÷real_risk_per_trade_yen）に使う。
import type { MetaResponse } from "@/app/lib/meta";
// 候補のLLM精査バッジ（WP-B）。app/lib/candidateReviews.tsx の共有部品を使う
// （実装を重複させない・二重fetchは許容）。
import { CandidateReviewBadge, fetchCandidateReviews } from "@/app/lib/candidateReviews";

// モード→バッジ色（dry_run=地味・demo=注意・live=強調。誤発注防止のため live は特に目立たせる）
function modeTone(mode: string): string {
  if (mode === "live") return "bg-rose-600 text-white";
  if (mode === "demo") return "bg-amber-500 text-white";
  return "bg-slate-500 text-white"; // dry_run
}
function modeLabel(mode: string): string {
  if (mode === "live") return "本番（実弾）";
  if (mode === "demo") return "デモ";
  if (mode === "dry_run") return "ドライラン（発注なし）";
  return mode;
}

// intent state → バッジ色
function intentTone(state: string): string {
  switch (state) {
    case "accepted":
      return "bg-sky-100 text-sky-700";
    case "filled":
      return "bg-emerald-100 text-emerald-700";
    case "partial":
      return "bg-amber-100 text-amber-700";
    case "approved":
      return "bg-amber-100 text-amber-700"; // 承認済・未発注（ゲート待ち）
    case "unknown":
    case "error":
      return "bg-rose-100 text-rose-700";
    case "cancelled":
      return "bg-slate-100 text-slate-500";
    default:
      return "bg-slate-100 text-slate-600";
  }
}
const INTENT_STATE_LABELS: Record<string, string> = {
  accepted: "受付済",
  filled: "約定",
  partial: "一部約定",
  unknown: "応答不明",
  error: "エラー",
  cancelled: "取消",
  approved: "ゲート待ち",
};

// 寄り前ゲート（Phase C+）の判定結果 → バッジ色・ラベル
const GATE_DECISION_TONE: Record<string, string> = {
  placed: "bg-emerald-100 text-emerald-700",
  skipped_gate: "bg-slate-100 text-slate-600",
  skipped_negative: "bg-rose-100 text-rose-700",
  expired_stale: "bg-slate-100 text-slate-600",
  rejected_guard: "bg-rose-100 text-rose-700",
  error: "bg-rose-100 text-rose-700",
};
const GATE_DECISION_LABELS: Record<string, string> = {
  placed: "発注",
  skipped_gate: "気配見送り",
  skipped_negative: "悪材料失効",
  expired_stale: "解禁日超過",
  rejected_guard: "ガード拒否",
  error: "エラー",
};

// 後場ゲート（pm-gate・観測モード）の would_place → バッジ色・ラベル
// 「発注相当」は実発注と誤読されないよう、寄り前ゲートの実発注色（emerald）とは分け、
// 観測であることが伝わる amber系にとどめる。
function pmGateWouldPlaceTone(wouldPlace: boolean): string {
  return wouldPlace ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500";
}
function pmGateWouldPlaceLabel(wouldPlace: boolean): string {
  return wouldPlace ? "発注相当（観測）" : "見送り";
}

// 承認確認ダイアログの想定損失（SLまで）計算。stop_loss >= limit_price は
// 異常値（本来ロング候補ではあり得ない）のため null を返し、表示側は「—」に畳む。
function estimatedLoss(
  c: ExecutionCandidate,
  riskPerTradeYen: number,
): { yen: number | null; r: number | null } {
  if (c.stop_loss >= c.limit_price) return { yen: null, r: null };
  const yen = c.shares * (c.limit_price - c.stop_loss);
  const r = riskPerTradeYen > 0 ? yen / riskPerTradeYen : null;
  return { yen, r };
}

// 引数なし系オペレーションのボタンラベル（結果バナーの見出しにも流用）
const OPS_LABELS: Record<string, string> = {
  "open-gate": "ゲート実行",
  "post-open": "引け後処理",
  ratchet: "SLラチェット",
};

// ボタン内の簡易スピナー（busy時のみ表示。CSS animate-spin を流用）
function Spinner() {
  return (
    <span
      className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white align-[-2px]"
      aria-hidden
    />
  );
}

// PaperTrade.tsx のボトムシート型確認モーダルを踏襲（スマホ=下から/デスクトップ=中央）。
// 発注・SL設置・緊急停止は取り消し不能な操作のため、全項目を見せてから明示確認させる。
function ConfirmSheet({
  title,
  tone,
  rows,
  note,
  confirmLabel,
  busy,
  error,
  disabled,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  tone?: string;
  rows: { label: string; value: React.ReactNode }[];
  note?: string;
  confirmLabel: string;
  busy: boolean;
  error?: string | null;
  disabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-slate-300 sm:hidden" />
        <div className="mb-4 flex items-start justify-between">
          <h3 className="font-semibold text-slate-800">{title}</h3>
          <button
            onClick={onClose}
            disabled={busy}
            className="ml-4 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-50"
            aria-label="閉じる"
          >
            ✕
          </button>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
          {rows.map((r, i) => (
            <div key={i}>
              <dt className="text-xs text-slate-400">{r.label}</dt>
              <dd className="break-all font-mono text-slate-700">{r.value}</dd>
            </div>
          ))}
        </dl>
        {children}
        {note && (
          <p className="mt-3 rounded bg-amber-50 px-2 py-1.5 text-xs text-amber-800">{note}</p>
        )}
        {error && (
          <p className="mt-3 rounded bg-rose-50 px-2 py-1.5 text-xs text-rose-700">{error}</p>
        )}
        <button
          onClick={onConfirm}
          disabled={busy || disabled}
          className={`mt-4 flex w-full items-center justify-center gap-2 rounded px-3 py-2 text-sm font-medium text-white disabled:opacity-50 ${
            tone ?? "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {busy && <Spinner />}
          {busy ? "処理中…" : confirmLabel}
        </button>
      </div>
    </div>
  );
}

// 候補行の詳細展開（CandidatesTable.tsx の行タップ→注文プラン展開/詳細ボタンの流儀を踏襲）。
// execution_plan の候補は signals.json（candidates prop）と jq_code で突合し、
// RSI/SMA25乖離/RS120/売買代金/成長フラグ等の豊富な指標を補完表示する。
// 未突合（対象外・失効等）でも jq_code さえあればチャート・精査は開けるためボタンは常に出す。
function ExecCandidateDetail({
  ec,
  candidate,
  review,
  onScreen,
  watched,
  onWatchAdd,
  addingWatch,
  watchErrorMsg,
}: {
  ec: ExecutionCandidate;
  candidate?: Candidate;
  review?: CandidateReview | null;
  onScreen?: (code: string) => void;
  // ウォッチ追加（CandidatesTable.tsx の addWatch と同じPOST先・楽観制御を移植。
  // jq_code=5桁のJ-Quantsコードを渡す＝/api/watchlist の CODE_RE が受理する形式）
  watched?: boolean;
  onWatchAdd?: (jqCode: string) => void;
  addingWatch?: boolean;
  watchErrorMsg?: string | null;
}) {
  return (
    <div className="border-t border-slate-100 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 sm:p-4">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-slate-500">{ec.jq_code}</span>
        <span className="font-semibold text-slate-800">{ec.name}</span>
        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
          {setupLabel(ec.setup_type)}
        </span>
        {candidate?.edge_aligned && (
          <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
            ✓ 適合
          </span>
        )}
        {candidate?.growth_pass === true && (
          <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">
            成長通過
          </span>
        )}
        {ec.excluded && (
          <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
            見送り: {ec.excluded}
          </span>
        )}
      </div>

      {/* 執行プラン由来（常に表示できる数値） */}
      <div className="mb-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        <div>
          <span className="text-slate-400">寄指上限</span>{" "}
          <span className="font-mono font-semibold text-blue-700">{fmtYen(ec.limit_price)}</span>
        </div>
        <div>
          <span className="text-slate-400">損切（逆指値）</span>{" "}
          <span className="font-mono font-semibold text-rose-600">{fmtYen(ec.stop_loss)}</span>
        </div>
        <div>
          <span className="text-slate-400">利確目標</span>{" "}
          <span className="font-mono font-semibold text-emerald-700">{fmtYen(ec.tp_first)}</span>
        </div>
        <div>
          <span className="text-slate-400">執行可能日</span>{" "}
          <span className="font-mono">{ec.available_at}</span>
        </div>
      </div>

      {/* signals.json 突合分（見つかった場合のみ） */}
      {candidate ? (
        <div className="mb-2 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
          <div>
            <span className="text-slate-400">RSI(14)</span>{" "}
            <span className="font-mono">{fmtNum(candidate.rsi14)}</span>
          </div>
          <div>
            <span className="text-slate-400">SMA25乖離</span>{" "}
            <span className="font-mono">{fmtPct(candidate.dist_sma25_pct)}</span>
          </div>
          <div>
            <span className="text-slate-400">RS120</span>{" "}
            <span className="font-mono">{fmtPct(candidate.rs120)}</span>
          </div>
          <div>
            <span className="text-slate-400">売買代金</span>{" "}
            <span className="font-mono">{fmtNum(candidate.turnover_oku)}億</span>
          </div>
          <div className="col-span-2">
            <span className="text-slate-400">市場/セクター</span> {candidate.market} / {candidate.sector}
          </div>
          <div>
            <span className="text-slate-400">許容損失</span>{" "}
            <span className="font-mono">
              {fmtYen(candidate.risk_yen)}（{fmtPct(candidate.effective_r_pct, 2)}）
            </span>
          </div>
          <div>
            <span className="text-slate-400">成長</span>{" "}
            <span className="font-mono">
              {candidate.growth_pass == null ? "-" : candidate.growth_pass ? "通過" : "非通過"}
              {candidate.growth_rev_yoy != null ? `（増収${fmtPct(candidate.growth_rev_yoy * 100)}）` : ""}
            </span>
          </div>
        </div>
      ) : (
        <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
          本日のsignals候補に見当たりません（対象外・失効の可能性）。RSI等の詳細指標は表示できません。
        </p>
      )}

      {/* LLM精査（output/candidate_reviews.json・WP-B）。veto判定でも承認自体は封鎖しない＝
          最終判断は人間。未精査（review未取得）はセクション自体を出さない。 */}
      {review && (
        <div className="mb-2 rounded border border-slate-200 bg-white px-3 py-2">
          <div className="mb-1 flex flex-wrap items-center gap-1.5">
            <span className="text-slate-400">精査</span>
            <CandidateReviewBadge review={review} />
            <span className="text-[10px] text-slate-400">
              確信度{review.confidence === "high" ? "高" : "低"} ・ {review.reviewed_at}
            </span>
          </div>
          {review.one_liner && <p className="mb-1 text-slate-700">{review.one_liner}</p>}
          {review.reasons && review.reasons.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-4 text-slate-600">
              {review.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* jq_code欠損（旧データ）では遷移先が /stock/undefined になるためボタン自体を出さない */}
      {ec.jq_code && (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/stock/${ec.jq_code}`}
            className="rounded border border-blue-300 bg-white px-3 py-1.5 text-center text-xs font-medium text-blue-700 hover:bg-blue-50"
          >
            詳細チャートを開く
          </Link>
          {onScreen && (
            <button
              onClick={() => onScreen(ec.jq_code)}
              className="rounded border border-blue-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              この銘柄を精査 →
            </button>
          )}
          {onWatchAdd && (
            watched ? (
              <span className="inline-flex items-center rounded border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-600">
                ✓ ウォッチ追加済み
              </span>
            ) : (
              <button
                onClick={() => onWatchAdd(ec.jq_code)}
                disabled={addingWatch}
                className="rounded border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              >
                {addingWatch ? "追加中…" : "☆ ウォッチに追加"}
              </button>
            )
          )}
        </div>
      )}
      {watchErrorMsg && <p className="mt-1 text-[10px] text-rose-600">{watchErrorMsg}</p>}
    </div>
  );
}

type ConfirmState =
  | { kind: "approve"; candidate: ExecutionCandidate }
  | { kind: "place-stop"; item: ExecutionNeedStop }
  | { kind: "kill" }
  | { kind: "open-gate" }
  | null;

export default function ExecutionPanel({
  candidates = [],
  onScreen,
  focusCode,
  onFocusConsumed,
}: {
  // signals.json の全候補（DashboardTabs から渡される）。execution_plan の候補(jq_code)と
  // 突合して詳細指標を補完表示するために使う（詳細動線の唯一のデータソース＝追加fetch不要）。
  candidates?: Candidate[];
  // 「この銘柄を精査」→気になる銘柄タブへの動線（Discover.tsx / CandidatesTable.tsx と同じ流儀）
  onScreen?: (code: string) => void;
  // 今日のアクション→該当候補行の自動展開（DashboardTabs から。jq_code 5桁 or 立花4桁コード）。
  // 処理後は onFocusConsumed で消費を通知する（StockScreener の autoCode/onConsumed と同じ流儀）
  focusCode?: string | null;
  onFocusConsumed?: () => void;
}) {
  const [data, setData] = useState<ExecutionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);

  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [killReason, setKillReason] = useState("");

  // 候補行の詳細展開（開いている jq_code。1件のみ・CandidatesTable と同じ単一アコーディオン）
  const [openCode, setOpenCode] = useState<string | null>(null);

  // 候補のLLM精査バッジ（WP-B）: 一覧を一度だけ取得。未生成時は空Map＝全行バッジ非表示。
  const [reviewMap, setReviewMap] = useState<Map<string, CandidateReview>>(new Map());
  useEffect(() => {
    fetchCandidateReviews().then(setReviewMap);
  }, []);

  // 資金メタ情報（承認確認ダイアログのR換算用）。PaperTrade.tsx と同じ /api/meta を叩く
  // だけの一度きり取得（執行パネル操作のたびに再取得する必要はない）。
  const [meta, setMeta] = useState<MetaResponse | null>(null);
  useEffect(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then(setMeta)
      .catch(() => {});
  }, []);

  // 既存ウォッチ銘柄（CandidatesTable.tsx から移植した「追加済み」判定フロー）
  const [watchedCodes, setWatchedCodes] = useState<Set<string>>(new Set());
  const [addingWatchCode, setAddingWatchCode] = useState<string | null>(null);
  const [watchError, setWatchError] = useState<{ code: string; message: string } | null>(null);

  useEffect(() => {
    fetch("/api/watchlist", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { items?: { code: string }[] }) => setWatchedCodes(new Set((d.items ?? []).map((x) => x.code))))
      .catch(() => {});
  }, []);

  const addToWatch = useCallback(async (code: string) => {
    setAddingWatchCode(code);
    setWatchError(null);
    try {
      const r = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, action: "add" }),
      });
      const d = await r.json();
      if (!r.ok) {
        setWatchError({ code, message: d.error ?? "ウォッチ追加に失敗しました" });
        return;
      }
      setWatchedCodes((prev) => new Set(prev).add(code));
    } catch {
      setWatchError({ code, message: "通信エラー" });
    } finally {
      setAddingWatchCode(null);
    }
  }, []);

  // 候補の絞り込み表示: 既定=優先上位TOP_N件のみ。6件目以降と見送り行は折りたたみ（既定閉）
  const [showRest, setShowRest] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);

  // signals.json 候補を jq_code でMap化（O(1)突合）
  const candidateMap = useMemo(
    () => new Map(candidates.map((c) => [c.code, c])),
    [candidates],
  );

  // 承認/SL設置に成功したhash（同一プラン内での再送信防止。TradeReportForm/ExitMonitor流儀）
  const [doneHashes, setDoneHashes] = useState<Set<string>>(new Set());

  // focusCode で展開した行へのスクロール予約。展開state（openCode/showRest等）と同一バッチで
  // 積み、再描画で行DOMが確定した後の effect で scrollIntoView する（折りたたみ内の行は
  // 展開前にDOMに存在しないため、直接スクロールできない）。
  const [scrollKey, setScrollKey] = useState<string | null>(null);
  useEffect(() => {
    if (!scrollKey) return;
    document
      .getElementById(`exec-cand-${scrollKey}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
    setScrollKey(null);
  }, [scrollKey]);

  // 今日のアクション→該当候補行の自動展開（2026-07-15 実運用指摘対応）。
  // focusCode は jq_code 5桁（"65010"/"130A0"）と立花4桁（"6501"）の両形式があり得るため、
  // 5桁末尾0を落とした正規形でも比較する。候補に無いcode（保有銘柄等のアクション）は
  // 何もせず consume だけする（クラッシュ・誤展開の防止）。
  useEffect(() => {
    if (!focusCode) return;
    if (loading) return; // プラン読み込み完了まで待つ（consumeせず次のdata到着で再評価）
    const cands = data?.plan?.candidates ?? [];
    const strip = (s: string) => (s.length === 5 && s.endsWith("0") ? s.slice(0, 4) : s);
    const want = strip(focusCode);
    const idx = cands.findIndex(
      (c) => strip(c.jq_code || "") === want || strip(c.code) === want,
    );
    if (idx >= 0) {
      const c = cands[idx];
      const key = c.jq_code || c.code; // renderCandidateRow の rowKeyOf と同一規則
      setOpenCode(key);
      // TOP_N圏外の行は折りたたみグループ内にある。ただし承認/発注済み（pinned）は
      // primary に常時表示されるため展開不要（グループ判定は render 側の分類規則と同一）。
      if (idx >= TOP_N) {
        const dead = new Set(["error", "cancelled", "expired"]);
        const pinned =
          (data?.status?.intents ?? []).some(
            (it) => it.side === "buy" && it.code === c.code && !dead.has(it.state),
          ) ||
          (c.hash != null && doneHashes.has(c.hash));
        if (!pinned) {
          if (c.excluded) setShowExcluded(true);
          else setShowRest(true);
        }
      }
      setScrollKey(key); // 展開の再描画後にスクロール（上のeffect）
    }
    onFocusConsumed?.();
  }, [focusCode, loading, data, doneHashes, onFocusConsumed]);

  // 引数なし系オペレーション（ゲート実行/引け後処理/SLラチェット）＋承認直後の結果バナー。
  // TradeReportForm の <pre> 結果表示と同じ流儀（成功=emerald/失敗=rose）。
  const [opNote, setOpNote] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/execution");
      const d = (await r.json()) as ExecutionResponse;
      setData(d);
    } catch {
      setData({ plan: null, status: null });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = useCallback(
    async (body: { kind: string; code?: string; hash?: string; reason?: string }) => {
      const r = await fetch("/api/execution", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string; result?: unknown };
      return { httpOk: r.ok, ok: d.ok === true, error: d.error, result: d.result };
    },
    [],
  );

  // プラン再生成・同期（引数なし系）
  const handlePlanOrSync = useCallback(
    async (kind: "plan" | "sync") => {
      setBusy(true);
      setTopError(null);
      try {
        const res = await runAction({ kind });
        if (!res.httpOk || !res.ok) {
          setTopError(res.error ?? "失敗しました");
        }
      } catch {
        setTopError("通信エラー");
      } finally {
        await load();
        setBusy(false);
      }
    },
    [runAction, load],
  );

  // 引け後処理・SLラチェット（確認モーダル不要な引数なし系。ゲート実行は取り消し不能な発注を
  // 起こし得るため confirm 経由＝doConfirm 側で実行する）
  const handleOpsAction = useCallback(
    async (kind: "post-open" | "ratchet") => {
      setBusy(true);
      setTopError(null);
      setOpNote(null);
      try {
        const res = await runAction({ kind });
        if (!res.httpOk || !res.ok) {
          setOpNote({ ok: false, text: `${OPS_LABELS[kind]}: ${res.error ?? "失敗しました"}` });
        } else {
          setOpNote({
            ok: true,
            text: `${OPS_LABELS[kind]}: 完了しました ${JSON.stringify(res.result ?? {})}`,
          });
        }
      } catch {
        setOpNote({ ok: false, text: `${OPS_LABELS[kind]}: 通信エラー` });
      } finally {
        await load();
        setBusy(false);
      }
    },
    [runAction, load],
  );

  const closeConfirm = useCallback(() => {
    setConfirm(null);
    setConfirmError(null);
  }, []);

  const doConfirm = useCallback(async () => {
    if (!confirm) return;
    setBusy(true);
    setConfirmError(null);
    try {
      if (confirm.kind === "approve") {
        // excluded行はhashがnull（承認対象外）。ボタン自体を出していないが、型と実行時の二重防御。
        const hash = confirm.candidate.hash;
        if (!hash) {
          setConfirmError("この候補は承認できません（hashなし＝見送り扱い）");
          return;
        }
        const res = await runAction({
          kind: "approve",
          code: confirm.candidate.code,
          hash,
        });
        if (!res.httpOk || !res.ok) {
          setConfirmError(res.error ?? "失敗しました");
          return;
        }
        setDoneHashes((prev) => new Set(prev).add(hash));
        setOpNote({
          ok: true,
          text: `承認しました: ${confirm.candidate.name}（明朝8:55の寄り前ゲートで気配判定のうえ自動発注されます。約定した場合、SL逆指値 ${fmtYen(confirm.candidate.stop_loss)} まで自動設置されます）`,
        });
        setConfirm(null);
      } else if (confirm.kind === "place-stop") {
        const res = await runAction({
          kind: "place-stop",
          code: confirm.item.code,
          hash: confirm.item.hash,
        });
        if (!res.httpOk || !res.ok) {
          setConfirmError(res.error ?? "失敗しました");
          return;
        }
        setDoneHashes((prev) => new Set(prev).add(confirm.item.hash));
        setConfirm(null);
      } else if (confirm.kind === "kill") {
        const reason = killReason.trim();
        if (!reason) {
          setConfirmError("理由を入力してください");
          return;
        }
        const res = await runAction({ kind: "kill", reason });
        if (!res.httpOk || !res.ok) {
          setConfirmError(res.error ?? "失敗しました");
          return;
        }
        setConfirm(null);
      } else if (confirm.kind === "open-gate") {
        const res = await runAction({ kind: "open-gate" });
        if (!res.httpOk || !res.ok) {
          setConfirmError(res.error ?? "失敗しました");
          return;
        }
        setOpNote({
          ok: true,
          text: `${OPS_LABELS["open-gate"]}: 完了しました ${JSON.stringify(res.result ?? {})}`,
        });
        setConfirm(null);
      }
    } catch {
      setConfirmError("通信エラー");
    } finally {
      await load();
      setBusy(false);
    }
  }, [confirm, killReason, runAction, load]);

  if (loading) {
    return <p className="py-6 text-center text-slate-400 text-sm">読み込み中…</p>;
  }

  const plan = data?.plan ?? null;
  const status = data?.status ?? null;

  // plan/status のどちらか欠損でも表示は落ちないよう、ヘッダ情報は両方から補完する
  const mode = plan?.mode ?? status?.mode ?? "dry_run";
  // live時のみ誤操作防止の視覚強調（常時バナー・確認ダイアログの見出し）を出す派生値。
  const isLive = mode === "live";
  const killSwitch = status?.kill_switch ?? plan?.guards.kill_switch ?? null;
  const sentToday = status?.daily.sent ?? plan?.guards.sent_today ?? 0;
  const dailyLimit = status?.daily.limit ?? plan?.guards.daily_order_limit ?? 0;
  const unknownCount = status?.unknown_count ?? plan?.guards.unknown_count ?? 0;

  // 後場ゲート（pm-gate・観測モード）の結果。破損/移行中の execution_status.json で
  // results が配列でない可能性があるため、寄り前ゲートと同様に配列に畳んでから使う。
  const pmGateResults: PmGateResult[] = Array.isArray(status?.pm_gate?.results)
    ? status!.pm_gate!.results
    : [];

  // 既発注/承認済コード（status.intents 由来）。doneHashes はセッション内stateのため、
  // リロード・別タブ・再マウントで承認ボタンが復活してしまう。サーバ側の永続状態から
  // 「有効なbuy intentが存在する銘柄」を導出し、OR判定で二重発注をUI側でも封鎖する
  // （最終防衛はバックエンドのsqlite一意制約と日次枠。ここは多重防御の1枚）。
  // error/cancelled/expired は死んだintent＝再発注があり得るため除外。
  // Phase C+: approve は「承認のみ」になったため、state="approved"（未発注・ゲート待ち）は
  // 実発注済み(orderedCodes)とは別集合に分け、バッジの文言を出し分ける。
  const DEAD_INTENT_STATES = new Set(["error", "cancelled", "expired"]);
  const buyIntents = (status?.intents ?? []).filter((it) => it.side === "buy");
  const approvedCodes = new Set(
    buyIntents.filter((it) => it.state === "approved").map((it) => it.code),
  );
  const orderedCodes = new Set(
    buyIntents
      .filter((it) => it.state !== "approved" && !DEAD_INTENT_STATES.has(it.state))
      .map((it) => it.code),
  );

  // 候補の絞り込み表示（2026-07-13 ユーザー要望「候補が多すぎて選びにくい」）。
  // 統一規則（codexレビューP2×2反映）:
  // - 順位バッジの母集団 = プラン配列の先頭TOP_N行そのもの（excluded/hashの有無に関わらず）。
  //   execution_plan.json は signals.json と同じ優先順（edge_aligned→売買代金降順）を保持する
  //   ため、これで「今日の候補」タブの緑背景トップ5と常に同一銘柄・同一順位になる。
  // - primary（既定表示）= トップ5 ∪ pinned行（approved/ordered/doneHashes該当 / source:"watchlist"）。
  //   トップ5内のexcluded行もprimaryに出す（グレー+見送り理由のまま。「優先2位が上限額不適合で
  //   見送り」という情報自体が選択の判断材料）。pinnedがプラン再生成後にexcludedへ転じた行も同様
  //   （自分が承認したものが隠れると不安になるため常に見せる）。source:"watchlist"（ウォッチ銘柄の
  //   自動執行オプトイン経由）も同じ理由で常にpinned＝順位バッジの母集団（TOP_N）には影響しない。
  // - 「その他の候補」= 6件目以降の発注可能行（pinned除く）
  // - 「見送り」= 6件目以降のexcluded行（pinned除く）
  const planCandidates = plan?.candidates ?? [];
  const rowKeyOf = (c: ExecutionCandidate) => c.jq_code || c.code;
  const topRank = new Map(
    planCandidates.slice(0, TOP_N).map((c, i) => [rowKeyOf(c), i + 1]),
  );
  const isPinnedRow = (c: ExecutionCandidate) =>
    orderedCodes.has(c.code) ||
    approvedCodes.has(c.code) ||
    (c.hash != null && doneHashes.has(c.hash)) ||
    // ウォッチ銘柄の自動執行オプトイン経由（source:"watchlist"）は常にprimaryへ固定表示する。
    // オプトインした銘柄が6件目以降の折りたたみ「その他の候補」に隠れると、押し目が成立していても
    // 気づけずに承認機会を逃すため（該当件数は少数想定なのでTOP_N表示を圧迫しない）。
    c.source === "watchlist";
  const primary = planCandidates.filter((c) => topRank.has(rowKeyOf(c)) || isPinnedRow(c));
  const others = planCandidates.filter((c) => !topRank.has(rowKeyOf(c)) && !isPinnedRow(c));
  const rest = others.filter((c) => !c.excluded);
  const excludedRows = others.filter((c) => !!c.excluded);
  // 見出しサマリ用: primary = トップ5（topRank.size件）+ pinnedによる追加表示分
  const pinnedExtra = primary.length - topRank.size;
  const shownCount =
    primary.length + (showRest ? rest.length : 0) + (showExcluded ? excludedRows.length : 0);

  // 候補1行（+詳細展開行）の描画。primary/rest/excluded の3グループで共用する
  const renderCandidateRow = (c: ExecutionCandidate) => {
    // excluded行はhash=null。keyはjq_code（プラン内で一意）を使い、hashに依存しない。
    // 発注済み判定 = サーバ永続状態(orderedCodes)。承認済み(ゲート待ち)判定 =
    // セッション内の即時反映(doneHashes) OR サーバ永続状態(approvedCodes)。
    // 発注済みが優先（ゲート実行後に approved→accepted 等へ遷移した場合の表示を正しくするため）。
    const isOrdered = orderedCodes.has(c.code);
    const isApprovedPending =
      !isOrdered && ((c.hash != null && doneHashes.has(c.hash)) || approvedCodes.has(c.code));
    const isExcluded = !!c.excluded;
    // jq_code欠損（旧データ・破損）はc.code=立花4桁へフォールバック（codexレビューP2:
    // undefinedキーだと欠損行同士が連動展開し /stock/undefined へ遷移してしまう）
    const rowKey = rowKeyOf(c);
    const isOpen = openCode === rowKey;
    // 優先上位（CandidatesTable のトップ5と同じ緑系の見せ方・順位バッジ）。
    // excluded行にも順位は付く（母集団=プラン先頭TOP_N行）が、行はグレー・バッジも減灯する。
    const rank = topRank.get(rowKey);
    return (
      <Fragment key={rowKey}>
        <tr
          id={`exec-cand-${rowKey}`}
          onClick={() => setOpenCode(isOpen ? null : rowKey)}
          title="タップで詳細を表示"
          className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50 ${
            isExcluded ? "bg-slate-50 text-slate-400" : rank ? "bg-emerald-50" : ""
          } ${isOpen ? "bg-blue-50" : ""}`}
        >
          <td className="whitespace-nowrap px-2 py-2">
            {rank != null && (
              <span
                className={`mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                  isExcluded ? "bg-slate-400" : "bg-emerald-500"
                }`}
              >
                {rank}
              </span>
            )}
            <span className="font-mono text-slate-500">{c.code}</span>{" "}
            <span className={isExcluded ? "" : "font-medium text-slate-800"}>{c.name}</span>{" "}
            {c.source === "watchlist" && (
              <span className="rounded bg-sky-100 px-1 py-0.5 text-[9px] font-semibold text-sky-700">
                ウォッチ
              </span>
            )}
            <CandidateReviewBadge review={reviewMap.get(c.jq_code)} />{" "}
            <span
              className={`inline-block text-[9px] text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
            >
              ▼
            </span>
          </td>
          <td className="whitespace-nowrap px-2 py-2">{c.setup_type}</td>
          <td className="whitespace-nowrap px-2 py-2 text-right font-mono">
            {fmtInt(c.limit_price)}
          </td>
          <td className="whitespace-nowrap px-2 py-2 text-right font-mono">
            {fmtInt(c.shares)}
            {c.shares_original !== c.shares && (
              <span className="ml-1 text-slate-400">(元{fmtInt(c.shares_original)})</span>
            )}
          </td>
          <td className="whitespace-nowrap px-2 py-2 text-right font-mono">{fmtYen(c.est_cost)}</td>
          <td className="whitespace-nowrap px-2 py-2 text-right font-mono text-rose-600">
            {fmtInt(c.stop_loss)}
          </td>
          <td className="whitespace-nowrap px-2 py-2 text-right font-mono">
            {c.rs120 != null ? `${c.rs120}%` : "-"}
          </td>
          <td
            className="whitespace-nowrap px-2 py-2 font-mono text-slate-400"
            title={c.hash ?? undefined}
          >
            {c.hash ? c.hash.slice(0, 8) : "—"}
          </td>
          <td className="whitespace-nowrap px-2 py-2 text-right">
            {isExcluded ? (
              <span className="text-slate-400">{c.excluded}</span>
            ) : isOrdered ? (
              <span className="text-emerald-600">✔ 発注済</span>
            ) : isApprovedPending ? (
              <span
                className="text-amber-600"
                title="明朝8:55の寄り前ゲートで気配判定のうえ自動発注されます"
              >
                ✔ 承認済（ゲート待ち）
              </span>
            ) : !c.hash ? (
              // 契約上excluded以外はhashを持つはずだが、欠損時は承認不可として安全側に倒す
              <span className="text-slate-400">hashなし（承認不可）</span>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirm({ kind: "approve", candidate: c });
                }}
                disabled={busy || !!killSwitch}
                className="rounded border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              >
                承認（明朝ゲートで自動発注）
              </button>
            )}
          </td>
        </tr>
        {isOpen && (
          <tr>
            <td colSpan={9} className="p-0">
              <ExecCandidateDetail
                ec={c}
                candidate={candidateMap.get(c.jq_code)}
                review={reviewMap.get(c.jq_code)}
                onScreen={onScreen}
                watched={watchedCodes.has(c.jq_code)}
                onWatchAdd={addToWatch}
                addingWatch={addingWatchCode === c.jq_code}
                watchErrorMsg={watchError?.code === c.jq_code ? watchError.message : null}
              />
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  return (
    <div className="space-y-5">
      {/* LIVEモード常時バナー（実弾との誤認防止・2026-07-19実弾運用UI安全セット）。
          demo/dry_runでは何も出さない＝既存表示を変えない。 */}
      {isLive && (
        <div className="rounded-lg bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm">
          🔴 実弾運用中（live）— 承認は翌朝の実発注になります
        </div>
      )}

      {/* ヘッダ帯: モード・キルスイッチ・日次枠・応答不明警告・緊急停止 */}
      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span
              className={`rounded px-2 py-0.5 text-xs font-semibold ${modeTone(mode)}`}
              title="dry_run=計算のみ / demo=証券会社デモ環境へ発注 / live=実弾発注"
            >
              {modeLabel(mode)}
            </span>
            <span className="text-slate-500">
              日次枠 <span className="font-mono font-medium text-slate-700">{sentToday}</span> /{" "}
              <span className="font-mono">{dailyLimit}</span>
            </span>
            <span className="text-slate-500">
              買付余力{" "}
              <span className="font-mono font-medium text-slate-700">
                {status?.buying_power != null ? fmtYen(status.buying_power) : "—（dry_run/未取得）"}
              </span>
            </span>
            {status?.updated && <span className="text-xs text-slate-400">更新: {status.updated}</span>}
          </div>
          <button
            onClick={() => {
              setKillReason("");
              setConfirm({ kind: "kill" });
            }}
            disabled={busy || !!killSwitch}
            className="rounded bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
            title="以後の新規発注を全て停止する（取り消しはCLI/運用側の対応が必要）"
          >
            🛑 緊急停止
          </button>
        </div>

        {killSwitch && (
          <p className="mt-2 rounded bg-rose-100 px-2 py-1.5 text-xs font-medium text-rose-800">
            🛑 キルスイッチ作動中: {killSwitch}（新規発注は停止しています）
          </p>
        )}
        {unknownCount > 0 && (
          <p className="mt-2 rounded bg-rose-100 px-2 py-1.5 text-xs font-medium text-rose-800">
            ⚠️ 応答不明の注文が{unknownCount}件あります・発注停止中（状況セクションのintentsを確認）
          </p>
        )}
      </div>

      {/* 執行待ち（承認済・未発注）: 「承認して執行待ちになっている銘柄がわかるようにして」対応。
          候補テーブルより上・ヘッダ直下に置き見落とし防止。approved intent 0件なら非表示。 */}
      {buyIntents.filter((it) => it.state === "approved").length > 0 && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 shadow-sm">
          <p className="mb-2 text-sm font-semibold text-amber-800">
            ⏳ 執行待ち — 明朝8:55の寄り前ゲートで判定して自動発注
          </p>
          <ul className="space-y-1.5 text-xs text-amber-900">
            {buyIntents
              .filter((it) => it.state === "approved")
              .map((it) => (
                <li
                  key={it.intent_id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded bg-white/60 px-2 py-1.5"
                >
                  <span className="font-medium">
                    {it.name}
                    <span className="ml-1 font-mono text-amber-600">({it.code})</span>
                  </span>
                  <span>数量 {fmtInt(it.qty)}株</span>
                  <span>
                    寄指上限 {it.limit_price != null ? fmtYen(it.limit_price) : "—"}
                  </span>
                  <span>
                    SLトリガー {it.stop_trigger != null ? fmtYen(it.stop_trigger) : "—"}
                  </span>
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* 操作ボタン */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => void handlePlanOrSync("plan")}
          disabled={busy}
          className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy && <Spinner />}
          プラン再生成
        </button>
        <button
          onClick={() => void handlePlanOrSync("sync")}
          disabled={busy}
          className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {busy && <Spinner />}
          同期
        </button>
        <button
          onClick={() => setConfirm({ kind: "open-gate" })}
          disabled={busy}
          className="flex items-center gap-1.5 rounded border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
          title="寄り前ゲートを手動実行する（気配・悪材料判定のうえ発注が起き得ます）"
        >
          {busy && <Spinner />}
          ゲート実行
        </button>
        <button
          onClick={() => void handleOpsAction("post-open")}
          disabled={busy}
          className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          title="約定状況を同期し、約定済み分のSLを自動設置する"
        >
          {busy && <Spinner />}
          引け後処理
        </button>
        <button
          onClick={() => void handleOpsAction("ratchet")}
          disabled={busy}
          className="flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          title="含み益銘柄のSL逆指値を切り上げる"
        >
          {busy && <Spinner />}
          SLラチェット
        </button>
      </div>
      {topError && (
        <p className="rounded bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{topError}</p>
      )}
      {opNote && (
        <pre
          className={`whitespace-pre-wrap break-all rounded border px-3 py-2 text-xs ${
            opNote.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-rose-200 bg-rose-50 text-rose-700"
          }`}
        >
          {opNote.text}
        </pre>
      )}

      {/* 候補テーブル（既定=優先上位TOP_N件＋承認/発注済み。残り・見送りは折りたたみ） */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">
          候補（本日のプラン）
          {plan && planCandidates.length > 0 && (
            <span className="ml-1.5 text-xs font-normal text-slate-500">
              全{planCandidates.length}件（
              {!showRest && !showExcluded
                ? `優先上位${topRank.size}件${pinnedExtra > 0 ? `+承認/発注済み${pinnedExtra}件` : ""}を表示中`
                : `${shownCount}件を表示中`}
              ）
            </span>
          )}
        </h3>
        {!plan ? (
          <p className="rounded-lg border border-slate-200 bg-white py-6 text-center text-sm text-slate-400 shadow-sm">
            プランがまだありません。「プラン再生成」を押してください。
          </p>
        ) : plan.candidates.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white py-6 text-center text-sm text-slate-400 shadow-sm">
            本日の候補はありません。
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100 text-left text-slate-600">
                  {["銘柄", "セットアップ", "寄指上限", "株数", "概算額", "SL", "RS120", "hash", ""].map(
                    (h, i) => (
                      <th key={i} className="whitespace-nowrap px-2 py-2 font-medium">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {/* 優先上位（緑背景・順位バッジ=CandidatesTableのトップ5と同一銘柄）＋承認/発注済み */}
                {primary.map(renderCandidateRow)}

                {/* 6件目以降の発注可能候補（既定閉） */}
                {rest.length > 0 && (
                  <tr className="border-t border-slate-100">
                    <td colSpan={9} className="p-0">
                      <button
                        onClick={() => setShowRest((v) => !v)}
                        className="w-full px-2 py-2 text-left text-xs font-medium text-blue-700 hover:bg-blue-50"
                      >
                        {showRest ? "▲ その他の候補を折りたたむ" : `▼ その他の候補 ${rest.length}件を表示`}
                      </button>
                    </td>
                  </tr>
                )}
                {showRest && rest.map(renderCandidateRow)}

                {/* 見送り行（ガード除外等・既定閉） */}
                {excludedRows.length > 0 && (
                  <tr className="border-t border-slate-100">
                    <td colSpan={9} className="p-0">
                      <button
                        onClick={() => setShowExcluded((v) => !v)}
                        className="w-full px-2 py-2 text-left text-xs font-medium text-slate-500 hover:bg-slate-50"
                      >
                        {showExcluded
                          ? "▲ 見送り候補を折りたたむ"
                          : `▼ 上限額不適合・見送り ${excludedRows.length}件を表示`}
                      </button>
                    </td>
                  </tr>
                )}
                {showExcluded && excludedRows.map(renderCandidateRow)}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 状況セクション */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-700">状況</h3>

        {!status ? (
          <p className="rounded-lg border border-slate-200 bg-white py-6 text-center text-sm text-slate-400 shadow-sm">
            状況データがまだありません。「同期」を押してください。
          </p>
        ) : (
          <>
            {/* SL未設置の警告 */}
            {status.need_stop.length > 0 && (
              <div className="space-y-2">
                {status.need_stop.map((n) => {
                  const isDone = n.hash != null && doneHashes.has(n.hash);
                  return (
                    <div
                      // hashに依存しない複合キー（万一のhash欠損でもkey重複させない）
                      key={`${n.code}:${n.hash ?? ""}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800"
                    >
                      <span>
                        ⚠️ SL未設置: <span className="font-mono">{n.code}</span> {n.name} ・{" "}
                        {fmtInt(n.qty)}株 ・トリガー {fmtInt(n.stop_trigger)}
                      </span>
                      {isDone ? (
                        <span className="text-emerald-600">✔ 設置済</span>
                      ) : (
                        <button
                          onClick={() => setConfirm({ kind: "place-stop", item: n })}
                          disabled={busy}
                          className="rounded border border-amber-400 bg-white px-2 py-1 font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                        >
                          SL設置
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* 寄り前ゲート結果（実行した日のみ status.gate が存在）。results は破損/移行中の
                execution_status.json で欠損し得るため配列に畳んでから描画（codexレビューP2） */}
            {status.gate && (
              <div>
                <div className="mb-1 text-xs font-medium text-slate-500">
                  本日の寄り前ゲート（{status.gate.ran_at}）
                </div>
                {!Array.isArray(status.gate.results) || status.gate.results.length === 0 ? (
                  <p className="rounded-lg border border-slate-200 bg-white py-4 text-center text-xs text-slate-400 shadow-sm">
                    対象銘柄はありませんでした。
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-100 text-left text-slate-600">
                          {["銘柄", "判定", "気配", "寄指上限", "注文番号", "note"].map((h, i) => (
                            <th key={i} className="whitespace-nowrap px-2 py-2 font-medium">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {status.gate.results.map((g, i) => (
                          <tr key={`${g.code}:${i}`} className="border-t border-slate-100">
                            <td className="whitespace-nowrap px-2 py-2">
                              <span className="font-mono text-slate-500">{g.code}</span> {g.name}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2">
                              <span
                                className={`rounded px-1.5 py-0.5 font-medium ${
                                  GATE_DECISION_TONE[g.decision] ?? "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {GATE_DECISION_LABELS[g.decision] ?? g.decision}
                              </span>
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-right font-mono">
                              {g.gate_price != null ? fmtInt(g.gate_price) : "-"}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 text-right font-mono">
                              {fmtInt(g.limit_price)}
                            </td>
                            <td className="whitespace-nowrap px-2 py-2 font-mono text-slate-500">
                              {g.order_number || "-"}
                            </td>
                            <td className="px-2 py-2 text-slate-500">{g.note}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* 後場ゲート（pm-gate・Phase C+観測モード）。実行した日のみ status.pm_gate が存在。
                朝の寄り前ゲートで気配見送りになった注文を、後場寄りの気配で記録のみ再判定する
                （実発注はしない）。results は寄り前ゲートと同様に配列に畳んでから描画。 */}
            {status.pm_gate && (
              <div>
                <div className="mb-1 text-xs font-medium text-slate-400">
                  後場ゲート（観測）（{status.pm_gate.ran_at}）・記録のみ・発注なし
                </div>
                {pmGateResults.length === 0 ? (
                  <p className="rounded-lg border border-slate-100 bg-white py-3 text-center text-xs text-slate-400 shadow-sm">
                    対象なし（朝の気配見送りなし）
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-slate-100 bg-white shadow-sm">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 text-left text-slate-400">
                          {["銘柄", "気配", "上限", "判定"].map((h, i) => (
                            <th key={i} className="whitespace-nowrap px-2 py-1.5 font-medium">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {pmGateResults.map((r, i) => (
                          <tr key={`${r.code}:${i}`} className="border-t border-slate-100">
                            <td className="whitespace-nowrap px-2 py-1.5">
                              <span className="font-mono text-slate-400">{r.code}</span> {r.name ?? "-"}
                            </td>
                            <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-slate-500">
                              {r.gate_price != null ? fmtInt(r.gate_price) : "-"}
                            </td>
                            <td className="whitespace-nowrap px-2 py-1.5 text-right font-mono text-slate-500">
                              {r.limit_price != null ? fmtInt(r.limit_price) : "-"}
                            </td>
                            <td className="whitespace-nowrap px-2 py-1.5">
                              <span
                                className={`rounded px-1.5 py-0.5 font-medium ${pmGateWouldPlaceTone(r.would_place)}`}
                              >
                                {pmGateWouldPlaceLabel(r.would_place)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {pmGateResults.some((r) => r?.note) && (
                  <ul className="mt-1 space-y-0.5 text-[11px] text-slate-400">
                    {pmGateResults
                      .filter((r) => r?.note)
                      .map((r, i) => (
                        <li key={`${r.code}:${i}`}>
                          <span className="font-mono">{r.code}</span> {r.note}
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            )}

            {/* intents */}
            <div>
              <div className="mb-1 text-xs font-medium text-slate-500">注文（intents）</div>
              {status.intents.length === 0 ? (
                <p className="rounded-lg border border-slate-200 bg-white py-4 text-center text-xs text-slate-400 shadow-sm">
                  注文はまだありません。
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-left text-slate-600">
                        {["銘柄", "side", "数量", "状態", "注文番号", "指値", "逆指値", "更新", "note"].map(
                          (h, i) => (
                            <th key={i} className="whitespace-nowrap px-2 py-2 font-medium">
                              {h}
                            </th>
                          ),
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {status.intents.map((it: ExecutionIntent) => (
                        <tr key={it.intent_id} className="border-t border-slate-100">
                          <td className="whitespace-nowrap px-2 py-2">
                            <span className="font-mono text-slate-500">{it.code}</span> {it.name}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2">{it.side}</td>
                          <td className="whitespace-nowrap px-2 py-2 text-right font-mono">{fmtInt(it.qty)}</td>
                          <td className="whitespace-nowrap px-2 py-2">
                            <span className={`rounded px-1.5 py-0.5 font-medium ${intentTone(it.state)}`}>
                              {INTENT_STATE_LABELS[it.state] ?? it.state}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 font-mono text-slate-500">
                            {it.order_number ?? "-"}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-right font-mono">
                            {it.limit_price != null ? fmtInt(it.limit_price) : "-"}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-right font-mono">
                            {it.stop_trigger != null ? fmtInt(it.stop_trigger) : "-"}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-slate-400">{it.updated_at}</td>
                          <td className="px-2 py-2 text-slate-500">{it.note ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* positions */}
            <div>
              <div className="mb-1 text-xs font-medium text-slate-500">建玉（positions）</div>
              {/* デモ口座には初期ダミー預りが入っており「保有」に見えてしまうため注記
                  （2026-07-15 実運用指摘対応）。live/dry_run では出さない */}
              {status.mode === "demo" && (
                <p className="mb-1 text-[11px] text-slate-400">
                  デモ口座の預り（6501/6502/9984はデモ環境の初期ダミーで、実際の保有ではありません）
                </p>
              )}
              {status.positions.length === 0 ? (
                <p className="rounded-lg border border-slate-200 bg-white py-4 text-center text-xs text-slate-400 shadow-sm">
                  建玉はありません。
                </p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-100 text-left text-slate-600">
                        {["銘柄", "数量", "売却可能数量"].map((h, i) => (
                          <th key={i} className="whitespace-nowrap px-2 py-2 font-medium">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {status.positions.map((p) => (
                        <tr key={p.code} className="border-t border-slate-100">
                          <td className="whitespace-nowrap px-2 py-2">
                            <span className="font-mono text-slate-500">{p.code}</span>
                            {p.name && <span className="ml-1">{p.name}</span>}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-right font-mono">{fmtInt(p.qty)}</td>
                          <td className="whitespace-nowrap px-2 py-2 text-right font-mono">
                            {fmtInt(p.sellable_qty)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 承認（明朝ゲートで自動発注）: 確認モーダル。
          想定損失（SLまで）＋R換算: R = meta.capital.real_risk_per_trade_yen。
          meta未取得時のフォールバック=30,000円（config.yaml capital.total 300万×risk_per_trade_pct 1%の現行値と一致）。 */}
      {confirm?.kind === "approve" && (() => {
        const riskPerTradeYen = meta?.capital?.real_risk_per_trade_yen ?? 30_000;
        const loss = estimatedLoss(confirm.candidate, riskPerTradeYen);
        return (
          <ConfirmSheet
            title={
              isLive
                ? `承認の確認（🔴実弾）: ${confirm.candidate.name}`
                : `承認: ${confirm.candidate.name}`
            }
            tone="bg-emerald-600 hover:bg-emerald-700"
            confirmLabel="この内容で承認する"
            busy={busy}
            error={confirmError}
            onConfirm={() => void doConfirm()}
            onClose={closeConfirm}
            rows={[
              { label: "コード", value: confirm.candidate.code },
              { label: "セットアップ", value: confirm.candidate.setup_type },
              { label: "寄指上限", value: fmtYen(confirm.candidate.limit_price) },
              {
                label: "株数",
                value:
                  confirm.candidate.shares !== confirm.candidate.shares_original
                    ? `${fmtInt(confirm.candidate.shares)}株（元${fmtInt(confirm.candidate.shares_original)}株）`
                    : `${fmtInt(confirm.candidate.shares)}株`,
              },
              { label: "概算額", value: fmtYen(confirm.candidate.est_cost) },
              { label: "SLトリガー（約定後に自動設置）", value: fmtYen(confirm.candidate.stop_loss) },
              {
                label: "想定損失（SLまで）",
                value:
                  loss.yen != null
                    ? `${fmtYen(loss.yen)}${loss.r != null ? `（${loss.r.toFixed(2)}R）` : ""}`
                    : "—",
              },
              { label: "利確目標", value: fmtYen(confirm.candidate.tp_first) },
              { label: "RS120", value: confirm.candidate.rs120 != null ? `${confirm.candidate.rs120}%` : "-" },
              { label: "hash", value: confirm.candidate.hash ?? "—" },
            ]}
            note="承認後は取り消せません。実際の発注は明朝8:55の寄り前ゲートで気配・悪材料を判定のうえ実行されます。約定した場合、このSL逆指値まで自動設置されます。"
          />
        );
      })()}

      {/* ゲート実行: 確認モーダル（発注が起き得る操作） */}
      {confirm?.kind === "open-gate" && (
        <ConfirmSheet
          title={isLive ? "寄り前ゲートを実行（🔴実弾）" : "寄り前ゲートを実行"}
          tone="bg-emerald-600 hover:bg-emerald-700"
          confirmLabel="ゲートを実行する"
          busy={busy}
          error={confirmError}
          onConfirm={() => void doConfirm()}
          onClose={closeConfirm}
          rows={[]}
          note="承認済み（ゲート待ち）の候補について、現在の気配・悪材料を判定したうえで発注が実行される場合があります。この操作は取り消せません。"
        />
      )}

      {/* SL設置: 確認モーダル */}
      {confirm?.kind === "place-stop" && (
        <ConfirmSheet
          title={`SL設置: ${confirm.item.name}`}
          tone="bg-amber-500 hover:bg-amber-600"
          confirmLabel="この内容でSLを設置する"
          busy={busy}
          error={confirmError}
          onConfirm={() => void doConfirm()}
          onClose={closeConfirm}
          rows={[
            { label: "コード", value: confirm.item.code },
            { label: "株数", value: `${fmtInt(confirm.item.qty)}株` },
            { label: "トリガー価格", value: fmtYen(confirm.item.stop_trigger) },
            { label: "hash", value: confirm.item.hash },
          ]}
          note="この操作は取り消せません。"
        />
      )}

      {/* 緊急停止: 確認モーダル（理由入力必須） */}
      {confirm?.kind === "kill" && (
        <ConfirmSheet
          title={isLive ? "緊急停止（🔴実弾）" : "緊急停止"}
          tone="bg-rose-600 hover:bg-rose-700"
          confirmLabel="停止する"
          busy={busy}
          error={confirmError}
          disabled={!killReason.trim()}
          onConfirm={() => void doConfirm()}
          onClose={closeConfirm}
          rows={[]}
          note="以後の新規発注を全て停止します。取り消しはCLI/運用側の対応が必要です。"
        >
          <label className="mt-1 flex flex-col gap-1">
            <span className="text-xs text-slate-500">理由（必須）</span>
            <input
              type="text"
              value={killReason}
              maxLength={200}
              disabled={busy}
              placeholder="例: 相場急変のため一時停止"
              onChange={(e) => setKillReason(e.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1 text-sm focus:border-rose-400 focus:outline-none"
            />
          </label>
        </ConfirmSheet>
      )}
    </div>
  );
}
