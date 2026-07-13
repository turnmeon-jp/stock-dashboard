"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { Candidate } from "@/app/lib/types";
import CandidatesTable from "./CandidatesTable";
import ChartGrid from "./ChartGrid";
import PaperTrade from "./PaperTrade";
import SystemGuide from "./SystemGuide";
import ExitMonitor from "./ExitMonitor";
import StockScreener from "./StockScreener";
import Discover from "./Discover";
import WatchList from "./WatchList";
import EntryFunnel from "./EntryFunnel";
import DisclosureBanner from "./DisclosureBanner";
import ActionQueue from "./ActionQueue";
import LedgerReport from "./LedgerReport";
import ExecutionPanel from "./ExecutionPanel";
import SpecialSituations from "./SpecialSituations";

type Tab = "candidates" | "funnel" | "watch" | "discover" | "exit" | "screen" | "charts" | "paper" | "ledger" | "special" | "exec" | "guide";

// 並びは使用頻度順（毎日の中核=出口規律・執行承認・候補確認、随時=発掘系、
// 参照時のみ=解説）。保有フォローは出口監視タブに集約済み（旧ポートフォリオ
// タブは2026-07-12削除）。既定タブは readTabFromURL の "candidates"
// フォールバックで決まり、この配列の順序には依存しない。
const TAB_DEFS: { key: Tab; label: string }[] = [
  { key: "exit",       label: "出口監視" },
  { key: "exec",       label: "自動執行" },
  { key: "candidates", label: "今日の候補" },
  { key: "watch",      label: "ウォッチ" },
  { key: "funnel",     label: "エントリー厳選" },
  { key: "paper",      label: "ペーパートレード" },
  { key: "ledger",     label: "検証" },
  { key: "special",    label: "特殊状況" },
  { key: "discover",   label: "発掘" },
  { key: "screen",     label: "気になる銘柄" },
  { key: "charts",     label: "チャート一覧" },
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
  header,
  regimeBanner,
}: {
  candidates: Candidate[];
  message: string | null;
  // タブバーを画面最上部（タイトルより上）に置くため、ヘッダー/レジームバナーは
  // page.tsx からJSXで受け取りタブバーの直下に描画する（2026-07-09 ユーザー要望）
  header?: React.ReactNode;
  regimeBanner?: React.ReactNode;
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

  // 発掘→気になる銘柄の動線: コードを screen タブへ渡して自動スクリーニング
  const [screenCode, setScreenCode] = useState<string | null>(null);
  const requestScreen = useCallback((code: string) => {
    setScreenCode(code);
    switchTab("screen");
  }, [switchTab]);

  // 今日のアクション→各タブへの動線。action_queue.json の tab 値は文字列のため、
  // 未知のタブ名（旧データ・バックエンド側の想定違い）は無視して事故を防ぐ。
  // 切替後はタブナビへスクロールする: パネルは最上部に残るため、これが無いと
  // 「切り替わったのに何も起きていないように見える」（特にモバイル）。
  const navRef = useRef<HTMLElement | null>(null);
  const navigateFromActionQueue = useCallback((tab: string) => {
    if (TAB_DEFS.some((d) => d.key === tab)) {
      switchTab(tab as Tab);
      navRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [switchTab]);

  const tabClass = (t: Tab) =>
    `tab-btn px-3 py-2 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
      tab === t
        ? "border-blue-600 text-blue-700"
        : "border-transparent text-slate-500 hover:text-slate-700"
    }`;

  return (
    <div>
      {/* タブバーはページ先頭（タイトルより上）かつ画面トップに固定（2026-07-09 ユーザー要望）。
          sticky は overflow を持つ祖先があると効かないため、このnavより外側にoverflowを足さないこと */}
      <nav
        ref={navRef}
        className="sticky top-0 z-40 flex border-b border-slate-200 overflow-x-auto scrollbar-hide bg-white/95 backdrop-blur"
      >
        {TAB_DEFS.map(({ key, label }) => (
          <button key={key} className={tabClass(key)} onClick={() => switchTab(key)}>
            {label}
          </button>
        ))}
      </nav>
      {/* タイトル等のヘッダー（page.tsx から受領）はタブバーの下 */}
      {header}
      {regimeBanner}
      <div className="mt-3 sm:mt-4" />
      {/* 全タブ共通: 今日やるべきことの一覧（未生成時は非表示） */}
      <ActionQueue onNavigate={navigateFromActionQueue} />
      {/* 全タブ共通: ウォッチ+厳選+保有銘柄の開示アラート/決算予定（見逃し防止の安全網） */}
      <DisclosureBanner />

      {/* lazy-mount: 初回アクティブ化まで DOM に追加しない
          一度マウントされたら display:none で保持（autoSize がゼロ幅を読まない） */}
      {mounted.has("candidates") && (
        <div style={{ display: tab === "candidates" ? "block" : "none" }}>
          {message && (
            <p className="mb-3 rounded bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
              {message}
            </p>
          )}
          <CandidatesTable candidates={candidates} onScreen={requestScreen} />
          <p className="mt-3 text-xs text-slate-400">
            緑背景（上位5件）が集中対象。タップで注文プラン表示。詳細ボタンでチャートを確認。
          </p>
        </div>
      )}
      {mounted.has("funnel") && (
        <div style={{ display: tab === "funnel" ? "block" : "none" }}>
          <EntryFunnel />
        </div>
      )}
      {mounted.has("watch") && (
        <div style={{ display: tab === "watch" ? "block" : "none" }}>
          <WatchList />
        </div>
      )}
      {mounted.has("discover") && (
        <div style={{ display: tab === "discover" ? "block" : "none" }}>
          <Discover onScreen={requestScreen} />
        </div>
      )}
      {mounted.has("exit") && (
        <div style={{ display: tab === "exit" ? "block" : "none" }}>
          <ExitMonitor />
        </div>
      )}
      {mounted.has("screen") && (
        <div style={{ display: tab === "screen" ? "block" : "none" }}>
          <StockScreener autoCode={screenCode} onConsumed={() => setScreenCode(null)} />
        </div>
      )}
      {mounted.has("charts") && (
        <div style={{ display: tab === "charts" ? "block" : "none" }}>
          <ChartGrid />
        </div>
      )}
      {mounted.has("paper") && (
        <div style={{ display: tab === "paper" ? "block" : "none" }}>
          <PaperTrade candidates={candidates} />
        </div>
      )}
      {mounted.has("ledger") && (
        <div style={{ display: tab === "ledger" ? "block" : "none" }}>
          <LedgerReport />
        </div>
      )}
      {mounted.has("special") && (
        <div style={{ display: tab === "special" ? "block" : "none" }}>
          <SpecialSituations />
        </div>
      )}
      {mounted.has("exec") && (
        <div style={{ display: tab === "exec" ? "block" : "none" }}>
          <ExecutionPanel />
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
