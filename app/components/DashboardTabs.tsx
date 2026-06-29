"use client";

import { useState, useEffect, useCallback } from "react";
import type { Candidate } from "@/app/lib/types";
import CandidatesTable from "./CandidatesTable";
import Portfolio from "./Portfolio";
import ChartGrid from "./ChartGrid";
import PaperTrade from "./PaperTrade";
import SystemGuide from "./SystemGuide";
import ExitMonitor from "./ExitMonitor";
import StockScreener from "./StockScreener";
import Discover from "./Discover";

type Tab = "candidates" | "discover" | "exit" | "screen" | "charts" | "portfolio" | "paper" | "guide";

const TAB_DEFS: { key: Tab; label: string }[] = [
  { key: "candidates", label: "今日の候補" },
  { key: "discover",   label: "発掘" },
  { key: "exit",       label: "出口監視" },
  { key: "screen",     label: "気になる銘柄" },
  { key: "charts",     label: "チャート一覧" },
  { key: "portfolio",  label: "ポートフォリオ" },
  { key: "paper",      label: "ペーパートレード" },
  { key: "guide",      label: "解説" },
];

function readTabFromURL(): Tab {
  if (typeof window === "undefined") return "candidates";
  const raw = new URLSearchParams(window.location.search).get("tab");
  return TAB_DEFS.some((d) => d.key === raw) ? (raw as Tab) : "candidates";
}

export default function DashboardTabs({
  candidates,
  message,
}: {
  candidates: Candidate[];
  message: string | null;
}) {
  // SSR は常に "candidates"。クライアントで URL を読んで同期する（hydration mismatch 回避）
  const [tab, setTab] = useState<Tab>("candidates");
  const [mounted, setMounted] = useState<Set<Tab>>(() => new Set<Tab>(["candidates"]));

  // マウント後に URL のタブ値を読み取る（useSearchParams を使わない = Suspense なし）
  useEffect(() => {
    const t = readTabFromURL();
    setTab(t);
    setMounted((prev) => (prev.has(t) ? prev : new Set([...prev, t])));
  }, []);

  // ブラウザの戻る/進む対応
  useEffect(() => {
    const onPop = () => {
      const t = readTabFromURL();
      setTab(t);
      setMounted((prev) => (prev.has(t) ? prev : new Set([...prev, t])));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const switchTab = useCallback((t: Tab) => {
    setTab(t);
    setMounted((prev) => (prev.has(t) ? prev : new Set([...prev, t])));
    // Next.js ルーターを使わず URL だけ更新（Suspense サイクルを完全に回避）
    const url = t === "candidates" ? location.pathname : `${location.pathname}?tab=${t}`;
    window.history.pushState({}, "", url);
  }, []);

  const tabClass = (t: Tab) =>
    `tab-btn px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
      tab === t
        ? "border-blue-600 text-blue-700"
        : "border-transparent text-slate-500 hover:text-slate-700"
    }`;

  return (
    <div>
      <nav className="flex border-b border-slate-200 mb-4 sm:mb-5 overflow-x-auto scrollbar-hide">
        {TAB_DEFS.map(({ key, label }) => (
          <button key={key} className={tabClass(key)} onClick={() => switchTab(key)}>
            {label}
          </button>
        ))}
      </nav>

      {/* lazy-mount: 初回アクティブ化まで DOM に追加しない
          一度マウントされたら display:none で保持（autoSize がゼロ幅を読まない） */}
      {mounted.has("candidates") && (
        <div style={{ display: tab === "candidates" ? "block" : "none" }}>
          {message && (
            <p className="mb-3 rounded bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
              {message}
            </p>
          )}
          <CandidatesTable candidates={candidates} />
          <p className="mt-3 text-xs text-slate-400">
            緑背景（上位5件）が集中対象。タップで注文プラン表示。詳細ボタンでチャートを確認。
          </p>
        </div>
      )}
      {mounted.has("discover") && (
        <div style={{ display: tab === "discover" ? "block" : "none" }}>
          <Discover />
        </div>
      )}
      {mounted.has("exit") && (
        <div style={{ display: tab === "exit" ? "block" : "none" }}>
          <ExitMonitor />
        </div>
      )}
      {mounted.has("screen") && (
        <div style={{ display: tab === "screen" ? "block" : "none" }}>
          <StockScreener />
        </div>
      )}
      {mounted.has("charts") && (
        <div style={{ display: tab === "charts" ? "block" : "none" }}>
          <ChartGrid />
        </div>
      )}
      {mounted.has("portfolio") && (
        <div style={{ display: tab === "portfolio" ? "block" : "none" }}>
          <Portfolio />
        </div>
      )}
      {mounted.has("paper") && (
        <div style={{ display: tab === "paper" ? "block" : "none" }}>
          <PaperTrade candidates={candidates} />
        </div>
      )}
      {mounted.has("guide") && (
        <div style={{ display: tab === "guide" ? "block" : "none" }}>
          <SystemGuide />
        </div>
      )}
    </div>
  );
}
