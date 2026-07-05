"use client";

import { useState } from "react";

// 売買報告フォーム（売却=holdings_cli close / 取得=holdings_cli add を /api/trade 経由で実行）。
// 実発注は証券会社アプリで人間が行う前提のまま、その「報告」を journal 一次記録へ落とす入口。
// 成功後はフォームを閉じて再送信を防ぐ（journal の二重記録防止）。
export default function TradeReportForm({
  kind,
  code,
  name,
  defaultShares,
  defaultPrice,
  onSuccess,
}: {
  kind: "close" | "add";
  code: string;
  name: string;
  defaultShares?: number | null;
  defaultPrice?: number | null;
  onSuccess?: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [shares, setShares] = useState(defaultShares != null ? String(defaultShares) : "");
  const [price, setPrice] = useState(defaultPrice != null ? String(Math.round(defaultPrice)) : "");
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState("");
  const [income, setIncome] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const isClose = kind === "close";
  const done = result?.ok === true;

  const submit = async () => {
    if (!reason.trim()) {
      setResult({ ok: false, text: "理由は必須です（なぜ売る/買うか。ポストモーテムの原料になります）" });
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const r = await fetch("/api/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          code,
          shares: Number(shares),
          price: Number(price),
          reason: reason.trim(),
          date,
          income: isClose ? undefined : income,
        }),
      });
      const d = (await r.json()) as { ok?: boolean; output?: string; error?: string };
      if (!r.ok || !d.ok) {
        setResult({ ok: false, text: d.error ?? "失敗しました" });
      } else {
        setResult({ ok: true, text: d.output || "記録しました" });
        onSuccess?.();
      }
    } catch {
      setResult({ ok: false, text: "通信エラー" });
    } finally {
      setBusy(false);
    }
  };

  const inputCls =
    "w-full rounded border border-slate-300 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none";

  return (
    <div className={`rounded border p-2 text-xs ${isClose ? "border-rose-200 bg-rose-50/40" : "border-emerald-200 bg-emerald-50/40"}`}>
      <div className="mb-1.5 font-medium text-slate-700">
        {isClose ? "売却報告" : "取得報告"}: {name}
        <span className="ml-1 font-mono text-slate-400">{code.replace(/0$/, "")}</span>
        <span className="ml-2 font-normal text-slate-400">
          （発注は証券会社アプリで実施済みの前提。ここでは記録のみ）
        </span>
      </div>
      {!done && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex w-20 flex-col gap-0.5">
            <span className="text-[10px] text-slate-500">株数</span>
            <input type="number" min={1} step={100} value={shares} disabled={busy}
              onChange={(e) => setShares(e.target.value)} className={inputCls} />
          </label>
          <label className="flex w-24 flex-col gap-0.5">
            <span className="text-[10px] text-slate-500">{isClose ? "約定価格" : "取得単価"}</span>
            <input type="number" min={0.1} step="any" value={price} disabled={busy}
              onChange={(e) => setPrice(e.target.value)} className={inputCls} />
          </label>
          <label className="flex w-32 flex-col gap-0.5">
            <span className="text-[10px] text-slate-500">{isClose ? "約定日" : "取得日"}</span>
            <input type="date" value={date} disabled={busy}
              onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </label>
          <label className="flex min-w-48 flex-1 flex-col gap-0.5">
            <span className="text-[10px] text-slate-500">理由（必須。なぜ{isClose ? "売る" : "買う"}か）</span>
            <input type="text" value={reason} maxLength={200} disabled={busy}
              placeholder={isClose ? "例: SMA75割れ・時間ストップ" : "例: 押し目成立・ドシエ確認済み"}
              onChange={(e) => setReason(e.target.value)} className={inputCls} />
          </label>
          {!isClose && (
            <label className="flex items-center gap-1 pb-1 text-[11px] text-slate-600">
              <input type="checkbox" checked={income} disabled={busy}
                onChange={(e) => setIncome(e.target.checked)} />
              配当・優待目的（income枠=出口監視対象外）
            </label>
          )}
          <button
            onClick={() => void submit()}
            disabled={busy || !shares || !price}
            className={`rounded px-3 py-1 text-xs font-medium text-white disabled:opacity-50 ${
              isClose ? "bg-rose-600 hover:bg-rose-700" : "bg-emerald-600 hover:bg-emerald-700"
            }`}
          >
            {busy ? "記録中…" : "報告する"}
          </button>
        </div>
      )}
      {result && (
        <pre
          className={`mt-1.5 whitespace-pre-wrap break-all rounded px-2 py-1 font-sans text-[11px] ${
            result.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"
          }`}
        >
          {result.text}
          {result.ok && "\n✔ journal に記録しました（画面の数値への反映は翌バッチ）"}
        </pre>
      )}
    </div>
  );
}
