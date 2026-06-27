"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ChartData, ChartIndexItem } from "@/app/lib/types";
import MiniChart from "./MiniChart";

// 1セル分。IntersectionObserver でビューポートに入ったときだけフェッチ（N+1防止）
function GridCell({ item }: { item: ChartIndexItem }) {
  const [data, setData] = useState<ChartData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/charts/${item.code}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: ChartData) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [item.code]);

  return (
    <Link
      href={`/stock/${item.code}`}
      className="block rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:border-blue-300 hover:bg-blue-50/40"
    >
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="font-mono text-xs text-slate-400">{item.code}</span>{" "}
          <span className="truncate text-sm font-medium text-slate-800">{item.name}</span>
        </div>
        {item.edge_aligned && (
          <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
            適合
          </span>
        )}
      </div>
      {error ? (
        <div className="flex h-28 sm:h-32 items-center justify-center text-xs text-slate-300">
          データなし
        </div>
      ) : data ? (
        <MiniChart data={data} />
      ) : (
        <div className="flex h-28 sm:h-32 items-center justify-center text-xs text-slate-300">
          読み込み中…
        </div>
      )}
    </Link>
  );
}

export default function ChartGrid() {
  const [items, setItems] = useState<ChartIndexItem[] | null>(null);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [edgeOnly, setEdgeOnly] = useState(true);

  useEffect(() => {
    fetch("/api/charts")
      .then((r) => r.json())
      .then((d: { as_of: string | null; charts: ChartIndexItem[] }) => {
        setItems(d.charts);
        setAsOf(d.as_of);
      })
      .catch(() => setItems([]));
  }, []);

  if (items === null) {
    return <p className="py-8 text-center text-slate-500">チャート一覧を読み込み中…</p>;
  }

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-slate-500">
        チャートデータがまだ生成されていません。
      </p>
    );
  }

  const visible = edgeOnly ? items.filter((i) => i.edge_aligned) : items;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <label className="inline-flex cursor-pointer select-none items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={edgeOnly}
            onChange={(e) => setEdgeOnly(e.target.checked)}
            className="h-4 w-4 accent-emerald-600"
          />
          <span>
            検証エッジ適合のみ
            <span className="hidden sm:inline">表示</span>
          </span>
        </label>
        <span className="text-xs text-slate-500">
          {visible.length}銘柄 / {asOf ?? "-"}
          <span className="hidden sm:inline">（クリックで詳細）</span>
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="py-8 text-center text-slate-500">適合（edge_aligned）銘柄はありません。</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {visible.map((item) => (
            <GridCell key={item.code} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
