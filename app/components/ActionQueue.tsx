"use client";

import { useEffect, useState } from "react";
import type { ActionQueueItem, ActionQueueResponse } from "@/app/lib/actionQueue";

const short = (code: string) => code.replace(/0$/, "");

// priority 1-2 は緊急度が高い扱い（赤系強調）
const URGENT_PRIORITY = 2;

/** 全タブ共通のページ最上部パネル。output/action_queue.json はバックエンドで並行実装中のため、
 *  未生成の間（exists:false）はパネル自体を描画しない。折りたたみ可・既定は展開。 */
export default function ActionQueue({ onNavigate }: { onNavigate: (tab: string) => void }) {
  const [data, setData] = useState<ActionQueueResponse | null>(null);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    fetch("/api/action-queue")
      .then((r) => r.json())
      .then((d: ActionQueueResponse) => setData(d))
      .catch(() => setData(null));
  }, []);

  if (!data || !data.exists) return null;

  const items: ActionQueueItem[] = data.items;

  return (
    <details
      className="mb-3 sm:mb-4 rounded-lg border border-slate-200 bg-white shadow-sm"
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2 text-sm font-semibold text-slate-700">
        <span>📋 今日のアクション</span>
        {items.length > 0 && (
          <span className="text-xs font-normal text-slate-400">（{items.length}件）</span>
        )}
      </summary>
      <div className="border-t border-slate-100 px-3 py-2">
        {items.length === 0 ? (
          <p className="text-xs text-slate-400">アクションなし</p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((it, i) => {
              const urgent = it.priority <= URGENT_PRIORITY;
              return (
                <li key={`${it.code}-${it.kind}-${i}`}>
                  <button
                    onClick={() => onNavigate(it.tab)}
                    className={`flex w-full flex-col gap-0.5 rounded px-2 py-1.5 text-left text-xs sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 sm:text-sm ${
                      urgent
                        ? "bg-rose-50 text-rose-800 hover:bg-rose-100"
                        : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span>{it.icon}</span>
                      <span className={urgent ? "font-semibold" : "font-medium"}>{it.name}</span>
                      <span className="font-mono text-[10px] text-slate-400">{short(it.code)}</span>
                    </span>
                    <span className="min-w-0 flex-1 sm:truncate">{it.text}</span>
                    {it.date && <span className="text-[10px] text-slate-400">{it.date}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </details>
  );
}
