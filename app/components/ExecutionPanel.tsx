"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ExecutionCandidate,
  ExecutionIntent,
  ExecutionNeedStop,
  ExecutionResponse,
} from "@/app/lib/types";
import { fmtInt, fmtYen } from "@/app/lib/format";

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

type ConfirmState =
  | { kind: "approve"; candidate: ExecutionCandidate }
  | { kind: "place-stop"; item: ExecutionNeedStop }
  | { kind: "kill" }
  | null;

export default function ExecutionPanel() {
  const [data, setData] = useState<ExecutionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);

  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [killReason, setKillReason] = useState("");

  // 承認/SL設置に成功したhash（同一プラン内での再送信防止。TradeReportForm/ExitMonitor流儀）
  const [doneHashes, setDoneHashes] = useState<Set<string>>(new Set());

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
      return { httpOk: r.ok, ok: d.ok === true, error: d.error };
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
  const killSwitch = status?.kill_switch ?? plan?.guards.kill_switch ?? null;
  const sentToday = status?.daily.sent ?? plan?.guards.sent_today ?? 0;
  const dailyLimit = status?.daily.limit ?? plan?.guards.daily_order_limit ?? 0;
  const unknownCount = status?.unknown_count ?? plan?.guards.unknown_count ?? 0;

  // 既発注コード（status.intents 由来）。doneHashes はセッション内stateのため、
  // リロード・別タブ・再マウントで承認ボタンが復活してしまう。サーバ側の永続状態から
  // 「有効なbuy intentが存在する銘柄」を導出し、OR判定で二重発注をUI側でも封鎖する
  // （最終防衛はバックエンドのsqlite一意制約と日次枠。ここは多重防御の1枚）。
  // error/cancelled/expired は死んだintent＝再発注があり得るため除外。
  const DEAD_INTENT_STATES = new Set(["error", "cancelled", "expired"]);
  const orderedCodes = new Set(
    (status?.intents ?? [])
      .filter((it) => it.side === "buy" && !DEAD_INTENT_STATES.has(it.state))
      .map((it) => it.code),
  );

  return (
    <div className="space-y-5">
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
      </div>
      {topError && (
        <p className="rounded bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">{topError}</p>
      )}

      {/* 候補テーブル */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">候補（本日のプラン）</h3>
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
                {plan.candidates.map((c) => {
                  // excluded行はhash=null。keyはjq_code（プラン内で一意）を使い、hashに依存しない。
                  // 発注済み判定 = セッション内の即時反映(doneHashes) OR サーバ永続状態(orderedCodes)
                  const isDone =
                    (c.hash != null && doneHashes.has(c.hash)) || orderedCodes.has(c.code);
                  const isExcluded = !!c.excluded;
                  return (
                    <tr
                      key={c.jq_code}
                      className={`border-t border-slate-100 ${isExcluded ? "bg-slate-50 text-slate-400" : ""}`}
                    >
                      <td className="whitespace-nowrap px-2 py-2">
                        <span className="font-mono text-slate-500">{c.code}</span>{" "}
                        <span className={isExcluded ? "" : "font-medium text-slate-800"}>{c.name}</span>
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
                      <td className="whitespace-nowrap px-2 py-2 text-right font-mono">
                        {fmtYen(c.est_cost)}
                      </td>
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
                        ) : isDone ? (
                          <span className="text-emerald-600">✔ 発注済</span>
                        ) : !c.hash ? (
                          // 契約上excluded以外はhashを持つはずだが、欠損時は承認不可として安全側に倒す
                          <span className="text-slate-400">hashなし（承認不可）</span>
                        ) : (
                          <button
                            onClick={() => setConfirm({ kind: "approve", candidate: c })}
                            disabled={busy || !!killSwitch}
                            className="rounded border border-emerald-300 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                          >
                            承認して発注
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
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
                          <td className="whitespace-nowrap px-2 py-2 font-mono text-slate-500">{p.code}</td>
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

      {/* 承認して発注: 確認モーダル */}
      {confirm?.kind === "approve" && (
        <ConfirmSheet
          title={`承認して発注: ${confirm.candidate.name}`}
          tone="bg-emerald-600 hover:bg-emerald-700"
          confirmLabel="この内容で発注する"
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
            { label: "損切(SL)", value: fmtYen(confirm.candidate.stop_loss) },
            { label: "利確目標", value: fmtYen(confirm.candidate.tp_first) },
            { label: "RS120", value: confirm.candidate.rs120 != null ? `${confirm.candidate.rs120}%` : "-" },
            { label: "hash", value: confirm.candidate.hash ?? "—" },
          ]}
          note="この操作は取り消せません。実際の発注はここでの承認をもって実行されます。"
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
          title="緊急停止"
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
