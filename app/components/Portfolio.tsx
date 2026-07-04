"use client";

import { useEffect, useState } from "react";
import type { Position } from "@/app/lib/types";
import { fmtInt, fmtPct, fmtYen } from "@/app/lib/format";
import type { MetaResponse } from "@/app/lib/meta";

const STORAGE_KEY = "trade-base.positions.v1";

function loadPositions(): Position[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePositions(positions: Position[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(positions));
  } catch {
    // localStorage 不可（プライベートモード等）は無視
  }
}

interface FormState {
  code: string;
  name: string;
  shares: string;
  buyPrice: string;
  buyDate: string;
  stopLoss: string;
}

const EMPTY_FORM: FormState = {
  code: "",
  name: "",
  shares: "",
  buyPrice: "",
  buyDate: "",
  stopLoss: "",
};

export default function Portfolio() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [priceLoading, setPriceLoading] = useState(false);
  // 総資金（実弾）は output/meta.json 由来。未取得時はハードコードせず "-" を表示する。
  const [realTotal, setRealTotal] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/meta")
      .then((r) => (r.ok ? (r.json() as Promise<MetaResponse>) : null))
      .then((d) => setRealTotal(d?.capital?.real_total ?? null))
      .catch(() => setRealTotal(null));
  }, []);

  async function fetchAllPrices(base: Position[]) {
    if (base.length === 0) return;
    setPriceLoading(true);
    const updated = await Promise.all(
      base.map(async (p) => {
        try {
          const res = await fetch(`/api/price/${encodeURIComponent(p.code)}`);
          if (!res.ok) return p;
          const data = await res.json();
          return { ...p, currentPrice: data.price as number };
        } catch {
          return p;
        }
      })
    );
    setPositions(updated);
    setPriceLoading(false);
  }

  useEffect(() => {
    const loaded = loadPositions();
    setPositions(loaded);
    setHydrated(true);
    fetchAllPrices(loaded);
  }, []);

  useEffect(() => {
    if (hydrated) savePositions(positions);
  }, [positions, hydrated]);

  function addPosition(e: React.FormEvent) {
    e.preventDefault();
    const shares = Number(form.shares);
    const buyPrice = Number(form.buyPrice);
    const stopLoss = Number(form.stopLoss);
    if (!form.code || !form.name || !(shares > 0) || !(buyPrice > 0)) {
      alert("コード・銘柄名・株数(>0)・取得単価(>0) は必須です。");
      return;
    }
    const pos: Position = {
      id: crypto.randomUUID(),
      code: form.code.trim(),
      name: form.name.trim(),
      shares,
      buyPrice,
      buyDate: form.buyDate,
      stopLoss: stopLoss > 0 ? stopLoss : 0,
      currentPrice: null,
    };
    setPositions((prev) => [...prev, pos]);
    setForm(EMPTY_FORM);
  }

  function removePosition(id: string) {
    setPositions((prev) => prev.filter((p) => p.id !== id));
  }

  function setCurrentPrice(id: string, value: string) {
    const v = value === "" ? null : Number(value);
    setPositions((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, currentPrice: v === null || Number.isNaN(v) ? null : v } : p
      )
    );
  }

  const totalInvested = positions.reduce((s, p) => s + p.buyPrice * p.shares, 0);
  const totalPnl = positions.reduce((s, p) => {
    if (p.currentPrice === null) return s;
    return s + (p.currentPrice - p.buyPrice) * p.shares;
  }, 0);
  const cash = realTotal != null ? realTotal - totalInvested : null;

  const field =
    "w-full rounded border border-slate-300 px-2 py-1.5 text-sm focus:border-blue-500 focus:outline-none";

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* サマリー: スマホ2列 / デスクトップ4列 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="合計投資額" value={fmtYen(totalInvested)} />
        <SummaryCard
          label="合計損益"
          value={fmtYen(totalPnl)}
          tone={totalPnl > 0 ? "pos" : totalPnl < 0 ? "neg" : "neutral"}
        />
        <SummaryCard
          label="現金余力"
          value={cash != null ? fmtYen(cash) : "—"}
          tone={cash != null && cash < 0 ? "neg" : "neutral"}
        />
        <SummaryCard label="総資金" value={realTotal != null ? fmtYen(realTotal) : "—"} />
      </div>
      <div className="flex justify-end">
        <button
          onClick={() => fetchAllPrices(positions)}
          disabled={priceLoading || positions.length === 0}
          className="rounded border border-slate-300 px-3 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-40"
        >
          {priceLoading ? "取得中…" : "価格更新"}
        </button>
      </div>

      {/* 登録フォーム: スマホ1列 / デスクトップ6列 */}
      <form
        onSubmit={addPosition}
        className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4 shadow-sm"
      >
        <h3 className="font-semibold mb-3 text-slate-700">建玉を登録</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3">
          <label className="text-xs text-slate-500">
            コード
            <input
              className={field}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="58030"
            />
          </label>
          <label className="text-xs text-slate-500">
            銘柄名
            <input
              className={field}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="フジクラ"
            />
          </label>
          <label className="text-xs text-slate-500">
            株数
            <input
              className={field}
              type="number"
              value={form.shares}
              onChange={(e) => setForm({ ...form, shares: e.target.value })}
              placeholder="200"
            />
          </label>
          <label className="text-xs text-slate-500">
            取得単価
            <input
              className={field}
              type="number"
              step="any"
              value={form.buyPrice}
              onChange={(e) => setForm({ ...form, buyPrice: e.target.value })}
              placeholder="1234.5"
            />
          </label>
          <label className="text-xs text-slate-500">
            取得日
            <input
              className={field}
              type="date"
              value={form.buyDate}
              onChange={(e) => setForm({ ...form, buyDate: e.target.value })}
            />
          </label>
          <label className="text-xs text-slate-500">
            損切価格
            <input
              className={field}
              type="number"
              step="any"
              value={form.stopLoss}
              onChange={(e) => setForm({ ...form, stopLoss: e.target.value })}
              placeholder="1150"
            />
          </label>
        </div>
        <button
          type="submit"
          className="mt-3 w-full sm:w-auto rounded bg-blue-600 px-4 py-2 sm:py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          追加
        </button>
      </form>

      {/* 建玉一覧 */}
      {/* スマホ: カード形式 */}
      <div className="md:hidden space-y-2">
        {positions.length === 0 && (
          <p className="py-6 text-center text-slate-400 text-sm">
            建玉はまだありません。上のフォームから登録してください。
          </p>
        )}
        {positions.map((p) => {
          const cp = p.currentPrice;
          const marketValue = cp !== null ? cp * p.shares : null;
          const pnl = cp !== null ? (cp - p.buyPrice) * p.shares : null;
          const distToStop =
            cp !== null && p.stopLoss > 0 ? ((cp - p.stopLoss) / cp) * 100 : null;
          return (
            <div
              key={p.id}
              className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm"
            >
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="font-mono text-xs text-slate-500">{p.code}</span>{" "}
                  <span className="font-medium text-sm">{p.name}</span>
                </div>
                <button
                  onClick={() => removePosition(p.id)}
                  className="text-xs text-rose-500 hover:text-rose-700"
                >
                  削除
                </button>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs mb-2">
                <div>
                  <span className="text-slate-400">株数</span>{" "}
                  <span className="font-mono">{fmtInt(p.shares)}株</span>
                </div>
                <div>
                  <span className="text-slate-400">取得単価</span>{" "}
                  <span className="font-mono">{fmtInt(p.buyPrice)}</span>
                </div>
                <div>
                  <span className="text-slate-400">取得日</span>{" "}
                  <span className="text-slate-600">{p.buyDate || "-"}</span>
                </div>
                <div>
                  <span className="text-slate-400">損切</span>{" "}
                  <span className="font-mono text-rose-600">
                    {p.stopLoss > 0 ? fmtInt(p.stopLoss) : "-"}
                  </span>
                </div>
                {pnl !== null && (
                  <div>
                    <span className="text-slate-400">損益</span>{" "}
                    <span
                      className={`font-mono ${pnl > 0 ? "text-emerald-600" : pnl < 0 ? "text-rose-600" : ""}`}
                    >
                      {fmtInt(pnl)}円
                    </span>
                  </div>
                )}
                {distToStop !== null && (
                  <div>
                    <span className="text-slate-400">損切まで</span>{" "}
                    <span
                      className={`font-mono ${distToStop < 0 ? "text-rose-600" : "text-slate-600"}`}
                    >
                      {fmtPct(distToStop)}
                    </span>
                  </div>
                )}
              </div>
              {/* 現在値入力 */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400 shrink-0">現在値</span>
                <input
                  type="number"
                  step="any"
                  value={cp === null ? "" : cp}
                  onChange={(e) => setCurrentPrice(p.id, e.target.value)}
                  placeholder="自動取得"
                  className="flex-1 rounded border border-slate-300 px-2 py-1 text-right font-mono text-sm focus:border-blue-500 focus:outline-none"
                />
                {marketValue !== null && (
                  <span className="text-slate-500 shrink-0">評価: {fmtInt(marketValue)}円</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* デスクトップ: テーブル形式 */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-600 text-left">
              {[
                "銘柄",
                "株数",
                "取得単価",
                "取得日",
                "損切",
                "現在値",
                "評価額",
                "損益",
                "損切まで",
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
                <td colSpan={10} className="px-3 py-8 text-center text-slate-400">
                  建玉はまだありません。上のフォームから登録してください。
                </td>
              </tr>
            )}
            {positions.map((p) => {
              const cp = p.currentPrice;
              const marketValue = cp !== null ? cp * p.shares : null;
              const pnl = cp !== null ? (cp - p.buyPrice) * p.shares : null;
              const distToStop =
                cp !== null && p.stopLoss > 0 ? ((cp - p.stopLoss) / cp) * 100 : null;
              return (
                <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="font-mono text-slate-500">{p.code}</span>{" "}
                    <span className="font-medium">{p.name}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{fmtInt(p.shares)}</td>
                  <td className="px-3 py-2 text-right font-mono">{fmtInt(p.buyPrice)}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">{p.buyDate || "-"}</td>
                  <td className="px-3 py-2 text-right font-mono text-rose-600">
                    {p.stopLoss > 0 ? fmtInt(p.stopLoss) : "-"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <input
                      type="number"
                      step="any"
                      value={cp === null ? "" : cp}
                      onChange={(e) => setCurrentPrice(p.id, e.target.value)}
                      placeholder="自動取得"
                      className="w-24 rounded border border-slate-300 px-2 py-1 text-right font-mono text-sm focus:border-blue-500 focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {marketValue !== null ? fmtInt(marketValue) : "-"}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${
                      pnl === null
                        ? "text-slate-400"
                        : pnl > 0
                          ? "text-emerald-600"
                          : pnl < 0
                            ? "text-rose-600"
                            : ""
                    }`}
                  >
                    {pnl !== null ? fmtInt(pnl) : "-"}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${
                      distToStop !== null && distToStop < 0 ? "text-rose-600" : "text-slate-600"
                    }`}
                  >
                    {distToStop !== null ? fmtPct(distToStop) : "-"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => removePosition(p.id)}
                      className="text-xs text-rose-500 hover:text-rose-700 hover:underline"
                    >
                      削除
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg" | "neutral";
}) {
  const toneClass =
    tone === "pos" ? "text-emerald-600" : tone === "neg" ? "text-rose-600" : "text-slate-800";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-base sm:text-lg font-semibold font-mono ${toneClass}`}>{value}</div>
    </div>
  );
}
