"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Candidate } from "@/app/lib/types";
import { fmtInt, fmtNum, fmtPct, fmtYen } from "@/app/lib/format";
import { setupLabel, TOP_N } from "@/app/lib/constants";
import { fetchDossierList, dossierWarningBadge, type DossierSummary } from "@/app/lib/dossier";
import { fetchDilutionFlags, dilutionBadge, type DilutionFlag } from "@/app/lib/dilution";
import { fetchLvhAlerts, lvhBadge, groupLvhAlertsByCode, type LvhAlert } from "@/app/lib/lvh";
import { marginBadge } from "@/app/lib/margin";

// 精査/ウォッチ追加ボタン共通 props（Discover.tsx / StockScreener.tsx と同じフローを移植）
type ActionProps = {
  onScreen?: (code: string) => void;
  watched?: boolean;
  onWatchAdd?: (code: string) => void;
  addingWatch?: boolean;
  watchErrorMsg?: string | null;
};

function DossierWarning({ call }: { call?: string | null }) {
  const w = dossierWarningBadge(call);
  if (!w) return null;
  return (
    <span
      title={`落選判定（買ってはいけない理由がないかの審査）の結果。${w.title}`}
      className={`ml-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold cursor-help ${w.tone}`}
    >
      {w.label}
    </span>
  );
}

function DilutionWarning({ flags }: { flags?: DilutionFlag[] | null }) {
  const w = dilutionBadge(flags);
  if (!w) return null;
  return (
    <span
      title={`希薄化（新株が増えて1株あたりの価値が薄まること）の可能性。${w.title}`}
      className={`ml-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold cursor-help ${w.tone}`}
    >
      {w.label}
    </span>
  );
}

function LvhWarning({ alerts }: { alerts?: LvhAlert[] | null }) {
  const w = lvhBadge(alerts);
  if (!w) return null;
  return (
    <span
      title={`大量保有報告（5%以上株を買った人の届け出）。${w.title}`}
      className={`ml-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold cursor-help ${w.tone}`}
    >
      {w.label}
    </span>
  );
}

function MarginBadge({ c }: { c: Candidate }) {
  const b = marginBadge(c);
  if (!b) return null;
  return (
    <span
      title={`需給（買いたい人と売りたい人のバランス）の参考タグ。${b.title}`}
      className={`ml-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold cursor-help ${b.tone}`}
    >
      {b.label}
    </span>
  );
}

// 寄成上限=指値+0.5%（執行規約 2026-07-07: 寄りがこれ以下なら寄成・超えたら見送り）。
// signals.json には無い派生値のため表示側で計算する（watchlist側は order.max_open で持つ）
function maxOpen(trigger: number | null | undefined): number | null {
  return trigger != null ? Math.round(trigger * 1.005 * 10) / 10 : null;
}

function OrderPlan({ c }: { c: Candidate }) {
  return (
    <div className="bg-amber-50 border-l-4 border-amber-400 p-3 sm:p-4 text-sm leading-relaxed text-slate-800">
      <p className="font-semibold mb-2">
        IFDOCO注文プラン — {c.code} {c.name}
        <span className="ml-2 text-xs font-normal text-slate-500">
          {c.available_at ?? "-"} 以降に発注
        </span>
      </p>

      {/* 第1注文 (IF) */}
      <div className="mb-2 rounded border border-amber-300 bg-white px-3 py-2">
        <p className="mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">
          ① IFD 第1注文（エントリー）
        </p>
        <p className="text-slate-800">
          {/* 寄成上限=指値+0.5%（執行規約 2026-07-07: 寄りがこれ以下なら寄成・超えたら見送り） */}
          <span
            className="cursor-help"
            title="寄付（9時最初の値段）での成行買いの上限。これ以下なら買い、超えたら見送り"
          >
            寄成上限
          </span>{" "}
          <span className="font-mono font-bold text-blue-700">{fmtNum(maxOpen(c.trigger_price))}</span>
          <span className="ml-1 text-xs text-slate-500">（指値目安 {fmtNum(c.trigger_price)}）</span>
          {" "}×{" "}
          <span className="font-semibold">{fmtInt(c.shares)}株</span>
          <span className="ml-2 text-xs text-slate-500">投資額 {fmtYen(c.invested)}</span>
        </p>
      </div>

      {/* 第2注文 (OCO) — 第1注文約定後に有効化 */}
      <div className="rounded border border-amber-300 bg-white px-3 py-2">
        <p className="mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">
          ② OCO 第2注文（第1注文約定後に自動発注）
        </p>
        <div className="flex flex-col gap-1 sm:flex-row sm:gap-6">
          <p>
            <span className="text-xs text-slate-500">損切（逆指値）</span>{" "}
            <span className="font-mono font-bold text-rose-600">{fmtNum(c.stop_loss)}</span>
          </p>
          <p>
            <span className="text-xs text-slate-500">OR　利確（指値）</span>{" "}
            <span className="font-mono font-bold text-emerald-700">{fmtNum(c.tp_first)}</span>
          </p>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          許容損失 {fmtYen(c.risk_yen)}（
          <span title="R＝1回の取引で許す損失額を1とする単位（例: R=3万円ならR=1.0%は損失3万円）" className="cursor-help">
            {fmtPct(c.effective_r_pct, 2)}
          </span>
          ）
          {c.trail_note ? `　${c.trail_note}` : ""}
        </p>
      </div>
    </div>
  );
}

/* ---- スマホ用カード ---- */
function CandidateCard({
  c,
  isTop,
  rank,
  isOpen,
  onToggle,
  dossierCall,
  dilutionFlags,
  lvhAlerts,
  onScreen,
  watched,
  onWatchAdd,
  addingWatch,
  watchErrorMsg,
}: {
  c: Candidate;
  isTop: boolean;
  rank: number;
  isOpen: boolean;
  onToggle: () => void;
  dossierCall?: string | null;
  dilutionFlags?: DilutionFlag[] | null;
  lvhAlerts?: LvhAlert[] | null;
} & ActionProps) {
  const dimmed = !c.edge_aligned;
  return (
    <div
      className={`rounded-lg border shadow-sm overflow-hidden ${
        isTop ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"
      } ${dimmed ? "opacity-60" : ""}`}
    >
      {/* カードヘッダ */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 cursor-pointer"
        onClick={onToggle}
      >
        {isTop && (
          <span className="inline-flex shrink-0 items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-bold">
            {rank}
          </span>
        )}
        {c.edge_aligned && !isTop && (
          <span className="shrink-0 inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
            ✓適合
          </span>
        )}
        <div className="min-w-0 flex-1">
          <span className="font-mono text-xs text-slate-500">{c.code}</span>{" "}
          <span className="font-medium text-sm text-slate-800">{c.name}</span>
          <DossierWarning call={dossierCall} />
          <DilutionWarning flags={dilutionFlags} />
          <LvhWarning alerts={lvhAlerts} />
          <MarginBadge c={c} />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="inline-block rounded bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
            {setupLabel(c.setup_type)}
          </span>
          <span className={`text-[10px] transition-transform ${isOpen ? "rotate-180" : ""}`}>▼</span>
        </div>
      </div>

      {/* 主要数値グリッド */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 pb-2.5 text-xs">
        <div>
          <span
            className="text-slate-400 cursor-help"
            title="寄付（9時最初の値段）での成行買いの上限。これ以下なら買い、超えたら見送り"
          >
            寄成上限
          </span>{" "}
          <span className="font-mono font-semibold text-blue-700">{fmtNum(maxOpen(c.trigger_price))}</span>
        </div>
        <div>
          <span className="text-slate-400">指値目安</span>{" "}
          <span className="font-mono font-semibold text-slate-800">{fmtNum(c.trigger_price)}</span>
        </div>
        <div>
          <span className="text-slate-400">損切</span>{" "}
          <span className="font-mono font-semibold text-rose-600">{fmtNum(c.stop_loss)}</span>
        </div>
        <div>
          <span className="text-slate-400">利確目安</span>{" "}
          <span className="font-mono font-semibold text-emerald-700">{fmtNum(c.tp_first)}</span>
        </div>
        <div>
          <span className="text-slate-400">株数</span>{" "}
          <span className="font-mono">{fmtInt(c.shares)}株</span>
        </div>
        <div>
          <span className="text-slate-400">投資額</span>{" "}
          <span className="font-mono">{fmtInt(c.invested)}円</span>
        </div>
        <div>
          <span className="text-slate-400">許容損失</span>{" "}
          <span className="font-mono">{fmtInt(c.risk_yen)}円</span>{" "}
          <span
            className="text-slate-400 cursor-help"
            title="R＝1回の取引で許す損失額を1とする単位（例: R=3万円ならR=1.0%は損失3万円）"
          >
            ({fmtPct(c.effective_r_pct, 2)})
          </span>
        </div>
        {/* 補助指標: 小さく */}
        <div className="text-slate-500">
          RSI <span className="font-mono">{fmtNum(c.rsi14)}</span>
          <span className="mx-1 text-slate-300">|</span>
          RS120 <span className="font-mono">{fmtPct(c.rs120)}</span>
        </div>
        <div className="text-slate-500">
          SMA25乖離 <span className="font-mono">{fmtPct(c.dist_sma25_pct)}</span>
        </div>
      </div>

      {/* 市場/セクター + 執行可能日 */}
      <div className="flex items-center justify-between px-3 pb-2 text-[10px] text-slate-400">
        <span>{c.market} / {c.sector}</span>
        <span>{c.available_at ?? "-"} 以降</span>
      </div>

      {/* 注文プランアコーディオン */}
      {isOpen && <OrderPlan c={c} />}

      {/* 精査・ウォッチ・詳細ボタン */}
      <div className="px-3 pb-3 pt-1 space-y-1.5">
        <div className="flex gap-1.5">
          {onScreen && (
            <button
              onClick={() => onScreen(c.code)}
              className="flex-1 rounded border border-blue-200 py-1.5 text-center text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              精査
            </button>
          )}
          {onWatchAdd && (
            watched ? (
              <span className="flex-1 flex items-center justify-center rounded border border-emerald-200 py-1.5 text-xs font-medium text-emerald-600">
                ✓ 追加済み
              </span>
            ) : (
              <button
                onClick={() => onWatchAdd(c.code)}
                disabled={addingWatch}
                className="flex-1 rounded border border-emerald-300 py-1.5 text-center text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
              >
                {addingWatch ? "追加中…" : "☆ ウォッチに追加"}
              </button>
            )
          )}
        </div>
        {watchErrorMsg && <p className="text-[10px] text-rose-600">{watchErrorMsg}</p>}
        <Link
          href={`/stock/${c.code}`}
          className="block w-full rounded border border-blue-300 py-1.5 text-center text-xs font-medium text-blue-700 hover:bg-blue-50"
        >
          詳細チャートを開く
        </Link>
      </div>
    </div>
  );
}

export default function CandidatesTable({
  candidates,
  onScreen,
}: {
  candidates: Candidate[];
  onScreen?: (code: string) => void;
}) {
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [edgeOnly, setEdgeOnly] = useState(true);

  // ドシエ落選反映（P5）: 一覧を一度だけ取得しMap化。
  const [dossierMap, setDossierMap] = useState<Map<string, DossierSummary>>(new Map());
  useEffect(() => {
    fetchDossierList().then((list) => setDossierMap(new Map(list.map((d) => [d.code, d]))));
  }, []);

  // 増資/希薄化の機械検知（EDINET・過検出側の一次候補バッジ）: 一覧を一度だけ取得。
  const [dilutionMap, setDilutionMap] = useState<Record<string, DilutionFlag[]>>({});
  useEffect(() => {
    fetchDilutionFlags().then(setDilutionMap);
  }, []);

  // アクティビスト大量保有報告（注意喚起タグ・売買シグナルではない）: 一覧を一度だけ取得。
  const [lvhMap, setLvhMap] = useState<Map<string, LvhAlert[]>>(new Map());
  useEffect(() => {
    fetchLvhAlerts().then((d) => setLvhMap(groupLvhAlertsByCode(d.alerts)));
  }, []);

  // 既存ウォッチ銘柄（Discover.tsx / StockScreener.tsx と同じ「追加済み」判定フロー）
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

  const visible = edgeOnly ? candidates.filter((c) => c.edge_aligned) : candidates;

  const topCodes = new Set(
    candidates.filter((c) => c.edge_aligned).slice(0, TOP_N).map((c) => c.code)
  );

  const cols: { label: string; hint?: string }[] = [
    { label: "銘柄" },
    { label: "市場" },
    { label: "セクター" },
    { label: "型" },
    { label: "指値" },
    { label: "損切", hint: "逆指値：ここまで下がったら自動で売る予約注文" },
    { label: "利確目安" },
    { label: "株数" },
    { label: "投資額" },
    { label: "許容損失", hint: "R＝1回の取引で許す損失額を1とする単位" },
    { label: "RSI", hint: "買われすぎ・売られすぎの目安（14日）" },
    { label: "SMA25乖離", hint: "25日移動平均線からの離れ具合。マイナス（下）＝押し目候補" },
    { label: "RS120(%)", hint: "他の銘柄と比べた強さ（120日）" },
    { label: "売買代金(億)" },
    { label: "適合", hint: "優位性の条件（edge_aligned）を全て満たした候補" },
    { label: "執行可能日" },
  ];

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
          検証エッジ適合のみ表示
        </label>
        <span className="text-xs text-slate-500 hidden sm:inline">
          適合=中型流動性×中期トレンド健全×押し目（バックテストで期待値プラスの条件）
        </span>
      </div>

      {visible.length === 0 ? (
        <p className="text-slate-500 py-8 text-center">
          {edgeOnly
            ? "適合（edge_aligned）候補はありません。"
            : "本日のエントリー候補はありません。"}
        </p>
      ) : (
        <>
          {/* スマホ: カード形式 */}
          <div className="md:hidden space-y-3">
            {visible.map((c) => {
              const isTop = topCodes.has(c.code);
              const rank = isTop ? [...topCodes].indexOf(c.code) + 1 : 0;
              const isOpen = openCode === c.code;
              return (
                <CandidateCard
                  key={c.code}
                  c={c}
                  isTop={isTop}
                  rank={rank}
                  isOpen={isOpen}
                  onToggle={() => setOpenCode(isOpen ? null : c.code)}
                  dossierCall={dossierMap.get(c.code)?.verdict_call}
                  dilutionFlags={dilutionMap[c.code]}
                  lvhAlerts={lvhMap.get(c.code)}
                  onScreen={onScreen}
                  watched={watchedCodes.has(c.code)}
                  onWatchAdd={addToWatch}
                  addingWatch={addingWatchCode === c.code}
                  watchErrorMsg={watchError?.code === c.code ? watchError.message : null}
                />
              );
            })}
          </div>

          {/* デスクトップ: テーブル形式 */}
          <div className="hidden md:block overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-100 text-slate-600 text-left">
                  {cols.map((h) => (
                    <th
                      key={h.label}
                      title={h.hint}
                      className={`px-3 py-2 font-medium whitespace-nowrap ${h.hint ? "cursor-help" : ""}`}
                    >
                      {h.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((c) => {
                  const isTop = topCodes.has(c.code);
                  const isOpen = openCode === c.code;
                  const rank = isTop ? [...topCodes].indexOf(c.code) + 1 : 0;
                  return (
                    <FragmentRow
                      key={c.code}
                      c={c}
                      isTop={isTop}
                      isOpen={isOpen}
                      colSpan={cols.length}
                      rank={rank}
                      onToggle={() => setOpenCode(isOpen ? null : c.code)}
                      dossierCall={dossierMap.get(c.code)?.verdict_call}
                      dilutionFlags={dilutionMap[c.code]}
                      lvhAlerts={lvhMap.get(c.code)}
                      onScreen={onScreen}
                      watched={watchedCodes.has(c.code)}
                      onWatchAdd={addToWatch}
                      addingWatch={addingWatchCode === c.code}
                      watchErrorMsg={watchError?.code === c.code ? watchError.message : null}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

function FragmentRow({
  c,
  isTop,
  isOpen,
  colSpan,
  rank,
  onToggle,
  dossierCall,
  dilutionFlags,
  lvhAlerts,
  onScreen,
  watched,
  onWatchAdd,
  addingWatch,
  watchErrorMsg,
}: {
  c: Candidate;
  isTop: boolean;
  isOpen: boolean;
  colSpan: number;
  rank: number;
  onToggle: () => void;
  dossierCall?: string | null;
  dilutionFlags?: DilutionFlag[] | null;
  lvhAlerts?: LvhAlert[] | null;
} & ActionProps) {
  const dimmed = !c.edge_aligned;
  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50 ${
          isTop ? "bg-emerald-50" : ""
        } ${dimmed ? "text-slate-400" : ""} ${isOpen ? "bg-blue-50" : ""}`}
      >
        <td className="px-3 py-2 whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            {isTop && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-bold">
                {rank}
              </span>
            )}
            <span className="font-mono text-slate-500">{c.code}</span>
            <span className={dimmed ? "" : "font-medium"}>{c.name}</span>
            <DossierWarning call={dossierCall} />
            <DilutionWarning flags={dilutionFlags} />
            <LvhWarning alerts={lvhAlerts} />
            <MarginBadge c={c} />
            {onScreen && (
              <button
                onClick={(e) => { e.stopPropagation(); onScreen(c.code); }}
                className="rounded border border-blue-200 px-1.5 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
              >
                精査
              </button>
            )}
            {onWatchAdd && (
              watched ? (
                <span title="ウォッチ追加済み" className="px-1 text-xs font-medium text-emerald-600">✓</span>
              ) : (
                <button
                  onClick={(e) => { e.stopPropagation(); onWatchAdd(c.code); }}
                  disabled={addingWatch}
                  title="ウォッチに追加"
                  className="rounded border border-emerald-300 px-1.5 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                >
                  {addingWatch ? "…" : "☆"}
                </button>
              )
            )}
            <Link
              href={`/stock/${c.code}`}
              onClick={(e) => e.stopPropagation()}
              className="rounded border border-blue-200 px-1.5 py-0.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              詳細
            </Link>
          </div>
          {watchErrorMsg && <p className="mt-1 text-[10px] text-rose-600">{watchErrorMsg}</p>}
        </td>
        <td className="px-3 py-2 whitespace-nowrap">{c.market}</td>
        <td className="px-3 py-2 whitespace-nowrap">{c.sector}</td>
        <td className="px-3 py-2 whitespace-nowrap">
          <span className="inline-block rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-700">
            {setupLabel(c.setup_type)}
          </span>
        </td>
        <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{fmtNum(c.trigger_price)}</td>
        <td className={`px-3 py-2 text-right font-mono whitespace-nowrap ${dimmed ? "" : "text-rose-600"}`}>{fmtNum(c.stop_loss)}</td>
        <td className={`px-3 py-2 text-right font-mono whitespace-nowrap ${dimmed ? "" : "text-emerald-700"}`}>{fmtNum(c.tp_first)}</td>
        <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{fmtInt(c.shares)}</td>
        <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{fmtInt(c.invested)}</td>
        <td className="px-3 py-2 text-right font-mono whitespace-nowrap">
          {fmtInt(c.risk_yen)}
          <span
            className="text-slate-400 text-xs cursor-help"
            title="R＝1回の取引で許す損失額を1とする単位（例: R=3万円ならR=1.0%は損失3万円）"
          >
            {" "}
            ({fmtPct(c.effective_r_pct, 2)})
          </span>
        </td>
        <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{fmtNum(c.rsi14)}</td>
        <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{fmtPct(c.dist_sma25_pct)}</td>
        <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{fmtPct(c.rs120)}</td>
        <td className="px-3 py-2 text-right font-mono whitespace-nowrap">{fmtNum(c.turnover_oku)}</td>
        <td className="px-3 py-2 whitespace-nowrap text-center">
          {c.edge_aligned ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
              ✓ 適合
            </span>
          ) : (
            <span className="text-xs text-slate-300">—</span>
          )}
        </td>
        <td className="px-3 py-2 whitespace-nowrap">{c.available_at ?? "-"}</td>
      </tr>
      {isOpen && (
        <tr>
          <td colSpan={colSpan} className="p-0">
            <OrderPlan c={c} />
          </td>
        </tr>
      )}
    </>
  );
}
