"use client";

import { useEffect, useState } from "react";
import type { ActionQueueItem, ActionQueueResponse } from "@/app/lib/actionQueue";

const short = (code: string) => code.replace(/0$/, "");

// priority 1-2 は緊急度が高い扱い（赤系強調）
const URGENT_PRIORITY = 2;

// スマホでは既定でこの件数だけ表示し、残りは「もっと見る」で展開（一覧性と縦スクロール量のバランス）
const INITIAL_VISIBLE = 6;
// これを超えるtextはスマホで2行に折りたたみ、「全文」タップで展開（目安の文字数）
const LONG_TEXT_THRESHOLD = 42;

// kind（pipeline/action_queue.py が付与）→ アイコンの意味（一言・title属性用）。
// kind一覧はバックエンド側の種別と1:1で対応（icon自体はレジーム変化等で複数パターンあるため kind をキーにする）。
const KIND_HINTS: Record<string, string> = {
  stop_breach: "規律逸脱：前回の逆指値を守れていない",
  red_action: "緊急対応が必要な保有銘柄",
  regime_change: "市場全体の地合い（レジーム）が変化",
  thesis_review: "保有理由（テーゼ）の再点検結果",
  time_stop: "時間ストップ：一定期間成果が出ず見切りの目安",
  partial_tp: "部分利確：含み益の一部を確保する目安",
  disclosure: "決算等の開示イベントが近い",
  pullback: "押し目・寄成のタイミング到来",
  dossier_thesis: "AIが作ったテーゼ下書きあり（採用は人間が判断）",
};

/** 全タブ共通のページ最上部パネル。output/action_queue.json はバックエンドで並行実装中のため、
 *  未生成の間（exists:false）はパネル自体を描画しない。折りたたみ可・既定は展開。
 *  onNavigate の第2引数 code はタブ切替後に該当銘柄の行を自動展開するためのヒント
 *  （2026-07-15 追加・後方互換: 受け手が無視しても動作は変わらない）。 */
export default function ActionQueue({
  onNavigate,
}: {
  onNavigate: (tab: string, code?: string) => void;
}) {
  const [data, setData] = useState<ActionQueueResponse | null>(null);
  const [open, setOpen] = useState(true);
  // 個々の行の全文展開（スマホのみ意味を持つ。indexキー管理でシンプルに）
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  // 「もっと見る」展開状態
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetch("/api/action-queue")
      .then((r) => r.json())
      .then((d: ActionQueueResponse) => setData(d))
      .catch(() => setData(null));
  }, []);

  if (!data || !data.exists) return null;

  const items: ActionQueueItem[] = data.items;
  const visibleItems = showAll ? items : items.slice(0, INITIAL_VISIBLE);
  const hiddenCount = items.length - visibleItems.length;

  const toggleExpand = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

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
          <>
            <ul className="space-y-1.5">
              {visibleItems.map((it, i) => {
                const urgent = it.priority <= URGENT_PRIORITY;
                const isExpanded = expanded.has(i);
                const isLong = it.text.length > LONG_TEXT_THRESHOLD;
                return (
                  <li key={`${it.code}-${it.kind}-${i}`}>
                    {/* button-in-buttonを避けるため div+role=button（全文トグルは内側の実ボタン） */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => onNavigate(it.tab, it.code)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") onNavigate(it.tab, it.code);
                      }}
                      className={`flex w-full cursor-pointer flex-col gap-0.5 rounded px-2 py-1.5 text-left text-xs sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-2 sm:text-sm ${
                        urgent
                          ? "bg-rose-50 text-rose-800 hover:bg-rose-100"
                          : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        <span title={KIND_HINTS[it.kind] ?? undefined} className="cursor-help">
                          {it.icon}
                        </span>
                        <span className={urgent ? "font-semibold" : "font-medium"}>{it.name}</span>
                        <span className="font-mono text-[10px] text-slate-400">{short(it.code)}</span>
                      </span>
                      <span
                        className={`min-w-0 flex-1 sm:truncate ${!isExpanded ? "line-clamp-2 sm:line-clamp-none" : ""}`}
                      >
                        {it.text}
                      </span>
                      {it.date && <span className="text-[10px] text-slate-400">{it.date}</span>}
                      {isLong && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(i);
                          }}
                          className="shrink-0 self-start text-[10px] font-medium text-blue-600 underline sm:hidden"
                        >
                          {isExpanded ? "閉じる" : "全文"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {items.length > INITIAL_VISIBLE && (
              <button
                onClick={() => setShowAll((v) => !v)}
                className="mt-2 w-full rounded border border-slate-200 py-1.5 text-center text-xs font-medium text-slate-500 hover:bg-slate-50"
              >
                {showAll ? "折りたたむ" : `もっと見る（+${hiddenCount}件）`}
              </button>
            )}
          </>
        )}
      </div>
    </details>
  );
}
