"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { WatchlistResponse, WatchItem } from "@/app/lib/watchlist";
import { WATCH_REASON_OPTIONS, DEFAULT_WATCH_REASON, type WatchMeta } from "@/app/lib/watchReasons";
import { fetchDossierList, type DossierSummary } from "@/app/lib/dossier";
import { fetchDilutionFlags, dilutionBadge, type DilutionFlag } from "@/app/lib/dilution";
import { fetchLvhAlerts, lvhBadge, groupLvhAlertsByCode, type LvhAlert } from "@/app/lib/lvh";
import { marginBadge, shortBadge } from "@/app/lib/margin";
import { fetchHeldCodes, HELD_NOTE } from "@/app/lib/held";
import DossierPanel from "./DossierPanel";
import TradeReportForm from "./TradeReportForm";
import { ConfluenceBadges } from "./ConfluenceBadge";

const short = (code: string) => code.replace(/0$/, "");
const yen = (v: number | null | undefined) =>
  v == null ? "-" : Math.round(v).toLocaleString("ja-JP");
// "YYYY-MM-DD" → "MM/DD"（棚卸し期限の見た目用。想定外形式はそのまま返す）
const fmtMonthDay = (iso: string) => {
  const m = iso.match(/^\d{4}-(\d{2})-(\d{2})$/);
  return m ? `${m[1]}/${m[2]}` : iso;
};

// ステータス→色。買い場=緑、押し目待ち=青、過熱=橙、見送り=灰
function statusTone(s: string): string {
  if (s === "買い場") return "bg-emerald-100 text-emerald-800 border-emerald-300";
  if (s === "押し目待ち") return "bg-blue-50 text-blue-700 border-blue-200";
  if (s === "過熱") return "bg-amber-100 text-amber-800 border-amber-300";
  if (s === "見送り") return "bg-slate-100 text-slate-500 border-slate-200";
  return "bg-slate-50 text-slate-600 border-slate-200";
}

function Metric({ label, value, tone, hint }: { label: string; value: string; tone?: string; hint?: string }) {
  return (
    <div className="flex flex-col">
      <span className={`text-[10px] text-slate-400 ${hint ? "cursor-help" : ""}`} title={hint}>
        {label}
      </span>
      <span className={`text-sm font-medium tabular-nums ${tone ?? "text-slate-700"}`}>{value}</span>
    </div>
  );
}

function DilutionWarning({ flags }: { flags?: DilutionFlag[] | null }) {
  const w = dilutionBadge(flags);
  if (!w) return null;
  return (
    <span
      title={`希薄化（新株が増えて1株あたりの価値が薄まること）の可能性。${w.title}`}
      className={`rounded px-1 text-[10px] font-semibold cursor-help ${w.tone}`}
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
      className={`rounded px-1 text-[10px] font-semibold cursor-help ${w.tone}`}
    >
      {w.label}
    </span>
  );
}

function MarginBadge({ s }: { s: WatchItem }) {
  const b = marginBadge(s);
  if (!b) return null;
  return (
    <span
      title={`需給（買いたい人と売りたい人のバランス）の参考タグ。${b.title}`}
      className={`rounded px-1 text-[10px] font-semibold cursor-help ${b.tone}`}
    >
      {b.label}
    </span>
  );
}

function ShortBadge({ s }: { s: WatchItem }) {
  const b = shortBadge(s);
  if (!b) return null;
  return (
    <span
      title={`空売り残（株を借りて売っている大口の残高）の参考タグ。${b.title}`}
      className={`rounded px-1 text-[10px] font-semibold cursor-help ${b.tone}`}
    >
      {b.label}
    </span>
  );
}

// 寄成上限=指値+0.5%（執行規約 2026-07-07）。旧JSONは ifd_entry から補完
function maxOpen(o: WatchItem["order"]): number | null {
  if (!o) return null;
  return o.max_open ?? Math.round(o.ifd_entry * 1.005 * 10) / 10;
}

// 棚卸し（WP-B）: 登録理由バッジ。未設定（移行中の既存銘柄・watch_meta欠損）は amber で目立たせる
function ReasonBadge({ meta }: { meta?: WatchMeta }) {
  const label = meta?.reason_label;
  if (!label) {
    return (
      <span
        title="棚卸し登録理由が未設定です。次の棚卸しで選択してください"
        className="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800 cursor-help"
      >
        理由未設定
      </span>
    );
  }
  return (
    <span
      title={meta?.reason_note ? `メモ: ${meta.reason_note}` : "ウォッチ登録理由"}
      className="rounded bg-slate-100 px-1 text-[10px] text-slate-600 cursor-help"
    >
      {label}
    </span>
  );
}

// 棚卸し要否バッジ（期限到来・理由未設定・見送り連続・イベント日通過のいずれか）
function TriageBadge({ meta }: { meta?: WatchMeta }) {
  if (!meta?.triage_due) return null;
  return (
    <span
      title={meta.triage_why ?? "棚卸し（継続/除外の判断）が必要です"}
      className="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800 cursor-help"
    >
      要棚卸し
    </span>
  );
}

// 棚卸しアクション（継続/除外）。理由が既に設定済みなら1タップ確認、未設定ならミニフォームで
// 理由（＋event_wait時は日付・任意メモ）を選んでから継続する。休眠セクションからの「復帰」も同じ操作。
function TriageActions({
  s,
  dormant,
  onRenew,
  onRetire,
  busy,
}: {
  s: WatchItem;
  dormant?: boolean;
  onRenew: (s: WatchItem, reason?: string, note?: string, eventDate?: string) => void;
  onRetire: (s: WatchItem) => void;
  busy: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState(DEFAULT_WATCH_REASON);
  const [eventDate, setEventDate] = useState("");
  const [note, setNote] = useState("");
  // domain_screen は発掘スクリーン通過への自動付与理由で、バックエンドの --renew は
  // このまま継続を拒否する（人間の理由選択を要求する設計）。未設定と同様にフォームを
  // 出して5択から選ばせる（codexレビューP2対応）
  const reasonSet = !!s.watch_meta?.reason && s.watch_meta.reason !== "domain_screen";
  const renewLabel = dormant ? "復帰（継続扱い）" : "継続";

  const handleRenewClick = () => {
    if (reasonSet) {
      if (confirm(`${s.name}（${short(s.code)}）を棚卸し継続しますか？`)) onRenew(s);
      return;
    }
    setShowForm((v) => !v);
  };

  const handleConfirmForm = () => {
    onRenew(s, reason, note.trim() || undefined, reason === "event_wait" ? eventDate || undefined : undefined);
    setShowForm(false);
  };

  return (
    <div className="mt-1.5" onClick={(e) => e.stopPropagation()}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleRenewClick}
          disabled={busy}
          className="rounded border border-emerald-300 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
        >
          {busy ? "処理中…" : renewLabel}
        </button>
        <button
          onClick={() => {
            if (confirm(`${s.name}（${short(s.code)}）をアーカイブに記録して外しますか？`)) onRetire(s);
          }}
          disabled={busy}
          className="rounded border border-rose-300 px-2 py-0.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
        >
          除外
        </button>
      </div>
      {showForm && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 rounded bg-amber-50 p-1.5">
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="rounded border border-slate-300 bg-white px-1 py-0.5 text-xs"
          >
            {WATCH_REASON_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
          {reason === "event_wait" && (
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="rounded border border-slate-300 px-1 py-0.5 text-xs"
            />
          )}
          <input
            type="text"
            placeholder="メモ（任意）"
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 100))}
            className="min-w-0 flex-1 rounded border border-slate-300 px-1 py-0.5 text-xs"
          />
          <button
            onClick={handleConfirmForm}
            disabled={busy}
            className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            確定
          </button>
        </div>
      )}
    </div>
  );
}

function Card({
  s,
  onRemove,
  removing,
  dossier,
  dossierListReady,
  dilutionFlags,
  lvhAlerts,
  isOpen,
  onToggle,
  held,
  onToggleExec,
  togglingExec,
  dormant,
  onRenew,
  onRetire,
  triageBusy,
}: {
  s: WatchItem;
  onRemove: (s: WatchItem) => void;
  removing: boolean;
  dossier?: DossierSummary;
  dossierListReady?: boolean;
  dilutionFlags?: DilutionFlag[] | null;
  lvhAlerts?: LvhAlert[] | null;
  isOpen: boolean;
  onToggle: () => void;
  held?: boolean;
  // 立花自動執行オプトイン（WP-A）。ヘッダ操作列のトグルボタン用
  onToggleExec: (s: WatchItem) => void;
  togglingExec?: boolean;
  // 棚卸し（WP-B）: 休眠セクションから描画される時 true（アクションを常時表示・ラベルを「復帰」に変更）
  dormant?: boolean;
  onRenew: (s: WatchItem, reason?: string, note?: string, eventDate?: string) => void;
  onRetire: (s: WatchItem) => void;
  triageBusy?: boolean;
}) {
  const o = s.order;
  const dist = s.dist_to_entry_pct;
  const isManual = s.source === "manual";
  // 取得報告フォームの開閉（報告成功後は開いたまま結果表示。二重送信はフォーム側で防止）
  const [reportOpen, setReportOpen] = useState(false);
  return (
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* ヘッダ（タップで開閉）: 銘柄名・ステータス・寄成上限のみ。他は展開後 */}
      <div className="flex items-start justify-between gap-2 p-3 cursor-pointer" onClick={onToggle}>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-slate-800">{s.name}</span>
            <span className="text-xs text-slate-400">{short(s.code)}</span>
            {isManual && (
              <span className="rounded bg-blue-50 px-1 text-[10px] text-blue-600" title="手動で追加した銘柄">手動</span>
            )}
            {s.is_quiet && (
              <span className="rounded bg-violet-50 px-1 text-[10px] text-violet-600" title="放置タグ（静か）">静</span>
            )}
            <DilutionWarning flags={dilutionFlags} />
            <LvhWarning alerts={lvhAlerts} />
            <MarginBadge s={s} />
            <ShortBadge s={s} />
            <ConfluenceBadges edgeAligned={s.edge_aligned} growthPass={s.growth_pass} isDomain={s.is_domain} />
            <ReasonBadge meta={s.watch_meta} />
            <TriageBadge meta={s.watch_meta} />
            {dormant && s.exec_enabled && (
              <span
                title="休眠中でも立花自動執行はONのままです。誤発注が不安なら立花自動をOFFにしてください"
                className="rounded bg-rose-50 px-1 text-[10px] font-semibold text-rose-700 cursor-help"
              >
                ⚠️自動執行ON
              </span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation(); // ヘッダ全体のカード開閉onClickを止める
                onToggleExec(s);
              }}
              disabled={togglingExec}
              title="ONにすると押し目成立時に立花の自動執行候補に載ります（承認は従来どおり人間）"
              className={`rounded px-1 text-[10px] font-semibold disabled:opacity-50 ${
                s.exec_enabled
                  ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                  : "bg-slate-100 text-slate-400 hover:bg-slate-200"
              }`}
            >
              {s.exec_enabled ? "⚡立花自動" : "立花自動 OFF"}
            </button>
            {held && (
              <span title={HELD_NOTE}
                    className="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800 cursor-help">
                📌保有中
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            <span
              className="cursor-help"
              title="寄付（9時最初の値段）での成行買いの上限。これ以下なら買い、超えたら見送り"
            >
              寄成上限
            </span>{" "}
            <span className="font-mono font-semibold text-blue-700">{yen(maxOpen(o))}</span>
            {s.watch_meta && (
              <span className="ml-2 text-slate-400">
                経過{s.watch_meta.days_watched_bdays}営業日
                {s.watch_meta.review_by && <>・期限〜{fmtMonthDay(s.watch_meta.review_by)}</>}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-1.5">
          <div className="text-right">
            <span className={`inline-block rounded border px-2 py-0.5 text-xs font-semibold ${statusTone(s.status)}`}>
              {s.status}
            </span>
            <div className="mt-0.5 text-[10px] text-slate-400">{s.status_detail}</div>
          </div>
          <span className={`mt-0.5 text-[10px] transition-transform ${isOpen ? "rotate-180" : ""}`}>▼</span>
        </div>
      </div>

      {/* 休眠セクションでは開閉によらず常時「復帰/除外」を出す（棚卸し判断を1手で終えられるように） */}
      {dormant && (
        <div className="px-3 pb-2">
          <TriageActions s={s} dormant onRenew={onRenew} onRetire={onRetire} busy={!!triageBusy} />
        </div>
      )}

      {isOpen && (
        <div className="px-3 pb-3">
          <div className="text-[11px] text-slate-400">{s.sector}</div>

          {/* 棚卸し（要棚卸しの通常行のみ。休眠行は上でアクションを常時表示済み） */}
          {!dormant && s.watch_meta?.triage_due && (
            <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-2 py-1.5">
              <div className="text-[10px] font-semibold text-amber-800">
                🧹 棚卸し{s.watch_meta.triage_why ? `（${s.watch_meta.triage_why}）` : ""}
              </div>
              <TriageActions s={s} onRenew={onRenew} onRetire={onRetire} busy={!!triageBusy} />
            </div>
          )}

          {/* 品質×成長（なぜウォッチか） */}
          <div className="mt-2 grid grid-cols-4 gap-2 border-t border-slate-100 pt-2">
            <Metric label="道B ROIC" value={s.roic_median != null ? `${s.roic_median}%` : "-"} />
            <Metric label="売上CAGR" value={s.sales_cagr != null ? `${s.sales_cagr}%` : "-"} />
            <Metric label="PER" value={s.per != null ? `${s.per}倍` : "-"} />
            <Metric
              label="CFO/OP"
              value={s.cfo_op != null ? `${s.cfo_op}` : "-"}
              tone={s.cfo_op != null && s.cfo_op < 0.7 ? "text-amber-600" : undefined}
            />
          </div>

          {/* エントリータイミング */}
          <div className="mt-2 grid grid-cols-4 gap-2 border-t border-slate-100 pt-2">
            <Metric label="現値" value={yen(s.close)} />
            <Metric label="SMA25(買場)" value={yen(s.sma25)} />
            <Metric
              label="押し目余地"
              hint="SMA25（25日移動平均線）までの距離。上昇トレンド中の一時的な下げ＝買い場候補"
              value={dist != null ? `${dist > 0 ? "+" : ""}${dist}%` : "-"}
              tone={dist != null && dist <= 1 ? "text-emerald-600" : "text-slate-700"}
            />
            <Metric label="RSI" hint="買われすぎ・売られすぎの目安（14日）" value={`${s.rsi14}`} />
          </div>

          {/* IFDOCO 注文設計 */}
          <div className="mt-2 rounded bg-slate-50 p-2">
            <div className="mb-1 text-[10px] font-semibold text-slate-500">注文設計（IFDOCO）</div>
            {held && (
              <div className="mb-1 rounded bg-amber-50 px-1.5 py-1 text-[10px] text-amber-800">
                📌保有中 — この注文設計は<b>新規目線</b>。買い増しの判断は出口監視の🔼
                （フリーロール成立時のみ）を見る。ナンピンはしない
              </div>
            )}
            {o ? (
              <div className="grid grid-cols-4 gap-2">
                <Metric
                  label="寄成上限（寄り≤で買い）"
                  hint="寄付（9時最初の値段）での成行買いの上限。これ以下なら買い、超えたら見送り"
                  value={yen(maxOpen(o))}
                  tone="text-blue-700"
                />
                <Metric label="指値目安" value={yen(o.ifd_entry)} />
                <Metric label="OCO 損切" value={yen(o.oco_stop)} tone="text-red-600" />
                <Metric label="OCO 利確" value={yen(o.oco_tp_first)} tone="text-emerald-700" />
              </div>
            ) : (
              <div className="text-xs text-slate-400">注文なし</div>
            )}
            {o && (
              <div className="mt-1 text-[11px] text-slate-500">
                {o.shares != null ? (
                  <>
                    {o.shares.toLocaleString()}株 / 投資 ¥{yen(o.invested)} / リスク ¥{yen(o.risk_yen)}
                    {o.effective_r_pct != null && (
                      <span title="R＝1回の取引で許す損失額を1とする単位（例: R=3万円ならR=1.0%は損失3万円）" className="cursor-help">
                        （R={o.effective_r_pct}%）
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-amber-600">{o.size_note ?? "サイズ不能"}</span>
                )}
              </div>
            )}
            {o && <div className="mt-0.5 text-[10px] text-slate-400">{o.trail_note}</div>}
          </div>

          <div className="mt-2 flex items-center justify-end gap-3">
            {isManual && (
              <button
                onClick={() => {
                  if (confirm(`${s.name}（${short(s.code)}）を手動ウォッチから削除しますか？`)) onRemove(s);
                }}
                disabled={removing}
                className="text-xs text-rose-500 hover:underline disabled:opacity-50"
              >
                {removing ? "削除中…" : "削除"}
              </button>
            )}
            <button
              onClick={() => setReportOpen((v) => !v)}
              className={`rounded border px-2 py-0.5 text-xs font-medium ${
                reportOpen
                  ? "border-slate-300 bg-slate-100 text-slate-600"
                  : "border-emerald-300 text-emerald-600 hover:bg-emerald-50"
              }`}
              title="実際に買った時の報告（holdings.json 更新＋journal 一次記録）"
            >
              {reportOpen ? "閉じる" : "取得報告"}
            </button>
            <Link href={`/stock/${s.code}`} className="text-xs text-blue-600 hover:underline">
              チャート →
            </Link>
          </div>

          {reportOpen && (
            <div className="mt-2">
              <TradeReportForm
                kind="add"
                code={s.code}
                name={s.name}
                defaultShares={o?.shares}
                defaultPrice={s.close}
              />
            </div>
          )}

          <DossierPanel code={s.code} initial={dossier} listReady={dossierListReady} />
        </div>
      )}
    </div>
  );
}

export default function WatchList() {
  const [data, setData] = useState<WatchlistResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [removingCode, setRemovingCode] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  // 立花自動執行オプトイン（WP-A）: トグル中のコード・直近エラー
  const [togglingExecCode, setTogglingExecCode] = useState<string | null>(null);
  const [execError, setExecError] = useState<string | null>(null);
  // 展開中の銘柄コード（同時に開くのは1つ。デスクトップも含め既定は折りたたみ）
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [dossierMap, setDossierMap] = useState<Map<string, DossierSummary>>(new Map());
  const [dossierListReady, setDossierListReady] = useState(false);
  const [dilutionMap, setDilutionMap] = useState<Record<string, DilutionFlag[]>>({});
  const [lvhMap, setLvhMap] = useState<Map<string, LvhAlert[]>>(new Map());
  const [heldCodes, setHeldCodes] = useState<Set<string>>(new Set());
  // 棚卸し（WP-B）: 継続/除外 実行中のコード・直近エラー
  const [triageBusyCode, setTriageBusyCode] = useState<string | null>(null);
  const [triageError, setTriageError] = useState<string | null>(null);
  // 休眠セクションの開閉（既定は閉じておく。滞留銘柄で一覧が埋まらないように）
  const [dormantOpen, setDormantOpen] = useState(false);
  // 手動追加フォーム（理由選択つき。発掘/執行/気になる銘柄タブの「☆ウォッチに追加」ボタンとは別経路）
  const [addCode, setAddCode] = useState("");
  const [addReason, setAddReason] = useState(DEFAULT_WATCH_REASON);
  const [addEventDate, setAddEventDate] = useState("");
  const [addNote, setAddNote] = useState("");
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/watchlist")
      .then((r) => r.json())
      .then((d: WatchlistResponse) => setData(d))
      .catch(() => setData({ ok: false, message: "取得に失敗しました。", generated_at: null, as_of: null, regime: null, n: 0, items: [] }))
      .finally(() => setLoading(false));
  }, []);

  // ドシエ一覧（存在確認・verdictバッジ用）は一度だけ取得し、カード毎の個別fetchを避ける
  useEffect(() => {
    fetchDossierList()
      .then((list) => setDossierMap(new Map(list.map((d) => [d.code, d]))))
      .finally(() => setDossierListReady(true));
  }, []);

  // 増資/希薄化の機械検知（EDINET・過検出側の一次候補バッジ）: 一覧を一度だけ取得。
  useEffect(() => {
    fetchDilutionFlags().then(setDilutionMap);
  }, []);

  // アクティビスト大量保有報告（注意喚起タグ・売買シグナルではない）: 一覧を一度だけ取得。
  useEffect(() => {
    fetchLvhAlerts().then((d) => setLvhMap(groupLvhAlertsByCode(d.alerts)));
  }, []);

  // 保有中コード（📌ガード用。✅は新規目線・買い増しは出口監視の🔼のみ）。
  // 取得失敗(null)はバッジを出さないだけ＝空集合に畳んでよい（表示のみの用途）。
  useEffect(() => {
    fetchHeldCodes().then((s) => setHeldCodes(s ?? new Set()));
  }, []);

  const handleRemove = useCallback(async (s: WatchItem) => {
    setRemovingCode(s.code);
    setRemoveError(null);
    try {
      const r = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: s.code, action: "remove" }),
      });
      const d = await r.json();
      if (!r.ok) {
        setRemoveError(d.error ?? "削除に失敗しました");
        return;
      }
      setData((prev) =>
        prev ? { ...prev, items: prev.items.filter((it) => it.code !== s.code), n: Math.max(0, prev.n - 1) } : prev
      );
    } catch {
      setRemoveError("通信エラー");
    } finally {
      setRemovingCode(null);
    }
  }, []);

  // 立花自動執行トグル（WP-A）: 削除ボタンとは異なり非破壊的・即時反映な操作のため
  // 楽観更新+失敗時ロールバックとする（クリック直後にUI反映→API失敗時のみ元に戻す）。
  const handleToggleExec = useCallback(async (s: WatchItem) => {
    const next = !s.exec_enabled;
    setTogglingExecCode(s.code);
    setExecError(null);
    setData((prev) =>
      prev
        ? { ...prev, items: prev.items.map((it) => (it.code === s.code ? { ...it, exec_enabled: next } : it)) }
        : prev
    );
    const rollback = () =>
      setData((prev) =>
        prev
          ? { ...prev, items: prev.items.map((it) => (it.code === s.code ? { ...it, exec_enabled: !next } : it)) }
          : prev
      );
    try {
      const r = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: s.code, action: next ? "exec_on" : "exec_off" }),
      });
      const d = await r.json();
      if (!r.ok) {
        rollback();
        setExecError(d.error ?? "切り替えに失敗しました");
      }
    } catch {
      rollback();
      setExecError("通信エラー");
    } finally {
      setTogglingExecCode(null);
    }
  }, []);

  // 棚卸し継続（renew）: レスポンスに最新のwatchlist全体が含まれるためそのまま差し替える
  // （追加/変更されるフィールドがdays_watched_bdays等サーバー計算値のため、楽観更新はしない）。
  const handleRenew = useCallback(async (s: WatchItem, reason?: string, note?: string, eventDate?: string) => {
    setTriageBusyCode(s.code);
    setTriageError(null);
    try {
      const body: Record<string, string> = { code: s.code, action: "renew" };
      if (reason) body.reason = reason;
      if (note) body.note = note;
      if (eventDate) body.event_date = eventDate;
      const r = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) {
        setTriageError(d.error ?? "棚卸し継続に失敗しました");
        return;
      }
      if (d.watchlist) setData(d.watchlist);
    } catch {
      setTriageError("通信エラー");
    } finally {
      setTriageBusyCode(null);
    }
  }, []);

  // 棚卸し除外（retire）: アーカイブに記録した上で一覧から外す
  const handleRetire = useCallback(async (s: WatchItem) => {
    setTriageBusyCode(s.code);
    setTriageError(null);
    try {
      const r = await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: s.code, action: "retire" }),
      });
      const d = await r.json();
      if (!r.ok) {
        setTriageError(d.error ?? "棚卸し除外に失敗しました");
        return;
      }
      if (d.watchlist) setData(d.watchlist);
    } catch {
      setTriageError("通信エラー");
    } finally {
      setTriageBusyCode(null);
    }
  }, []);

  // 手動追加（理由選択つき）。成功したら最新のwatchlist全体で差し替え、フォームをリセットする。
  const handleAdd = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const code = addCode.trim().toUpperCase();
      if (!code) return;
      setAddSubmitting(true);
      setAddError(null);
      try {
        const body: Record<string, string> = { code, action: "add", reason: addReason };
        if (addNote.trim()) body.note = addNote.trim();
        if (addReason === "event_wait" && addEventDate) body.event_date = addEventDate;
        const r = await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const d = await r.json();
        if (!r.ok) {
          setAddError(d.error ?? "追加に失敗しました");
          return;
        }
        if (d.watchlist) setData(d.watchlist);
        setAddCode("");
        setAddNote("");
        setAddEventDate("");
        setAddReason(DEFAULT_WATCH_REASON);
      } catch {
        setAddError("通信エラー");
      } finally {
        setAddSubmitting(false);
      }
    },
    [addCode, addReason, addNote, addEventDate]
  );

  if (loading) return <p className="text-sm text-slate-400">読み込み中…</p>;
  if (!data) return <p className="text-sm text-red-500">データがありません。</p>;

  // 休眠（watch_meta.dormant）は通常一覧から分離し、下部の折りたたみへ。watch_meta欠損は非休眠扱い。
  const mainItems = data.items.filter((it) => !it.watch_meta?.dormant);
  const dormantItems = data.items.filter((it) => it.watch_meta?.dormant);

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <span>ウォッチ {data.n}銘柄</span>
        {data.as_of && <span>· {data.as_of} 時点</span>}
        {data.regime && (
          <span
            className={`rounded px-2 py-0.5 font-medium ${
              data.regime.label === "risk_on"
                ? "bg-emerald-100 text-emerald-700"
                : data.regime.label === "risk_off"
                ? "bg-red-100 text-red-700"
                : "bg-amber-100 text-amber-700"
            }`}
            title="市場レジーム（min(大型breadth, グロースbreadth)）"
          >
            レジーム: {data.regime.label}
          </span>
        )}
      </div>

      {/* 手動追加（棚卸し規律のため理由選択を必須にする。発掘/執行/気になる銘柄タブの
          「☆ウォッチに追加」は理由未選択のまま追加され、次の棚卸し時に理由選択を求める） */}
      <form
        onSubmit={handleAdd}
        className="mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-xs"
      >
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-slate-400">コードを追加</label>
          <input
            type="text"
            value={addCode}
            onChange={(e) => setAddCode(e.target.value)}
            placeholder="例: 7203"
            className="w-24 rounded border border-slate-300 px-1.5 py-1"
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <label className="text-[10px] text-slate-400">登録理由</label>
          <select
            value={addReason}
            onChange={(e) => setAddReason(e.target.value)}
            className="rounded border border-slate-300 bg-white px-1.5 py-1"
          >
            {WATCH_REASON_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {addReason === "event_wait" && (
          <div className="flex flex-col gap-0.5">
            <label className="text-[10px] text-slate-400">イベント日</label>
            <input
              type="date"
              value={addEventDate}
              onChange={(e) => setAddEventDate(e.target.value)}
              className="rounded border border-slate-300 px-1.5 py-1"
            />
          </div>
        )}
        <div className="flex min-w-[8rem] flex-1 flex-col gap-0.5">
          <label className="text-[10px] text-slate-400">メモ（任意）</label>
          <input
            type="text"
            value={addNote}
            onChange={(e) => setAddNote(e.target.value.slice(0, 100))}
            placeholder="任意メモ"
            className="w-full rounded border border-slate-300 px-1.5 py-1"
          />
        </div>
        <button
          type="submit"
          disabled={addSubmitting || !addCode.trim()}
          className="rounded bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {addSubmitting ? "追加中…" : "追加"}
        </button>
      </form>
      {addError && (
        <p className="mb-3 rounded bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
          {addError}
        </p>
      )}

      {/* 抽出条件のわかりやすい説明（折りたたみ） */}
      <details className="mb-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        <summary className="cursor-pointer font-medium text-slate-700">
          📋 これらの銘柄はどう選ばれている？（抽出条件）
        </summary>
        <div className="mt-2 space-y-2 text-slate-600">
          <p className="text-slate-500">
            「<b>得意分野の・小型で・伸びていて・資本効率が高く・財務と会計が健全</b>な会社」を機械で絞った<b>保有候補</b>。
            下の6つの関門を<b>すべて</b>通った銘柄だけを表示しています。
          </p>
          <ol className="ml-4 list-decimal space-y-1">
            <li><b>土俵（得意分野）</b>：機械・電気機器・精密機器・金属製品（FA／センサ／製造業まわり）</li>
            <li><b>小型で発掘</b>：時価総額 30〜500億円。大型は既に知られているので外す</li>
            <li><b>成長</b>：売上が年 +6% 以上で伸び続け、直近も失速していない（あなたの決定軸）</li>
            <li>
              <b>資本効率（道B ROIC ≥ 12%）</b>：借金＋自己資本−現金＝「実際に使っている元手」に対する利益。
              EDINET の有報から有利子負債を取り、買掛金など“借りていない負債”を分母から外して製造業も正しく評価。
              直近と過去中央値の両方が 12% 以上（改善中の会社は拾い、単年だけの跳ねは除外）
            </li>
            <li><b>財務の堅さ</b>：自己資本比率 ≥ 50% ／ 営業利益率 ≥ 15%</li>
            <li>
              <b>会計の正直さ</b>：営業利益がちゃんと現金になっている（営業CF ÷ 営業利益 ≥ 0.6）。
              見せかけ利益・特需ピークの罠を排除
            </li>
          </ol>
          <p>
            <span className="rounded bg-violet-50 px-1 text-[11px] text-violet-600">静</span>{" "}
            タグ＝回転率が低い（＝市場に見られていない）目印。ボーナス表示で、絞り込みには使いません。
          </p>
          <p className="text-slate-500">
            <b>エントリー・注文（各カード）</b>：買い場＝25日移動平均（SMA25）への押し目。トレンド（SMA25＞SMA75）と RSI で
            「買い場／押し目待ち／過熱／見送り」を判定。注文は <b>IFD 買い指値（SMA25）＋ OCO 損切・利確（1.5R）</b>、
            1トレードの損失が資金の約1%になる株数。
          </p>
          <p className="rounded bg-amber-50 px-2 py-1 text-[13px] text-amber-800">
            ⚠️ これは「買い<b>候補</b>」であって「買い<b>推奨</b>」ではありません。数字が良くても事業が罠のことがあります
            （例：数字最良のダイコク電機はパチンコ関連の衰退産業なので除外対象）。<b>最終判断は各社の事業・循環性・割高感を自分で精査してから。</b>
          </p>
        </div>
      </details>

      {data.message && (
        <p className="mb-3 rounded bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          {data.message}
        </p>
      )}
      {removeError && (
        <p className="mb-3 rounded bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
          {removeError}
        </p>
      )}
      {execError && (
        <p className="mb-3 rounded bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
          {execError}
        </p>
      )}
      {triageError && (
        <p className="mb-3 rounded bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-700">
          {triageError}
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {mainItems.map((s) => (
          <Card
            key={s.code}
            s={s}
            onRemove={handleRemove}
            removing={removingCode === s.code}
            dossier={dossierMap.get(s.code)}
            dossierListReady={dossierListReady}
            dilutionFlags={dilutionMap[s.code]}
            lvhAlerts={lvhMap.get(s.code)}
            isOpen={openCode === s.code}
            onToggle={() => setOpenCode(openCode === s.code ? null : s.code)}
            held={heldCodes.has(s.code)}
            onToggleExec={handleToggleExec}
            togglingExec={togglingExecCode === s.code}
            onRenew={handleRenew}
            onRetire={handleRetire}
            triageBusy={triageBusyCode === s.code}
          />
        ))}
      </div>

      {/* 休眠（見送り連続20営業日）: 既定は折りたたみ。開くと同じ行形式で「復帰/除外」を常時表示 */}
      {dormantItems.length > 0 && (
        <details
          className="mt-4 rounded-lg border border-slate-200 bg-slate-50"
          open={dormantOpen}
          onToggle={(e) => setDormantOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer select-none px-3 py-2 text-sm font-medium text-slate-600">
            💤 休眠（{dormantItems.length}件）
          </summary>
          <div className="grid grid-cols-1 gap-3 border-t border-slate-200 p-3 sm:grid-cols-2">
            {dormantItems.map((s) => (
              <Card
                key={s.code}
                s={s}
                onRemove={handleRemove}
                removing={removingCode === s.code}
                dossier={dossierMap.get(s.code)}
                dossierListReady={dossierListReady}
                dilutionFlags={dilutionMap[s.code]}
                lvhAlerts={lvhMap.get(s.code)}
                isOpen={openCode === s.code}
                onToggle={() => setOpenCode(openCode === s.code ? null : s.code)}
                held={heldCodes.has(s.code)}
                onToggleExec={handleToggleExec}
                togglingExec={togglingExecCode === s.code}
                dormant
                onRenew={handleRenew}
                onRetire={handleRetire}
                triageBusy={triageBusyCode === s.code}
              />
            ))}
          </div>
        </details>
      )}

      <p className="mt-3 text-xs text-slate-400">
        道B品質×成長で厳選した保有候補。ステータス＝エントリータイミング（買い場/押し目待ち/過熱/見送り）。
        注文は IFD 買い指値＋OCO 損切逆指値/利確。最終判断は各社の事業精査後に。
      </p>
    </div>
  );
}
