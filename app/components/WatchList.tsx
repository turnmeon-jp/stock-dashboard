"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { WatchlistResponse, WatchItem } from "@/app/lib/watchlist";
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

      {isOpen && (
        <div className="px-3 pb-3">
          <div className="text-[11px] text-slate-400">{s.sector}</div>

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
  // 展開中の銘柄コード（同時に開くのは1つ。デスクトップも含め既定は折りたたみ）
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [dossierMap, setDossierMap] = useState<Map<string, DossierSummary>>(new Map());
  const [dossierListReady, setDossierListReady] = useState(false);
  const [dilutionMap, setDilutionMap] = useState<Record<string, DilutionFlag[]>>({});
  const [lvhMap, setLvhMap] = useState<Map<string, LvhAlert[]>>(new Map());
  const [heldCodes, setHeldCodes] = useState<Set<string>>(new Set());

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

  // 保有中コード（📌ガード用。✅は新規目線・買い増しは出口監視の🔼のみ）
  useEffect(() => {
    fetchHeldCodes().then(setHeldCodes);
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

  if (loading) return <p className="text-sm text-slate-400">読み込み中…</p>;
  if (!data) return <p className="text-sm text-red-500">データがありません。</p>;

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {data.items.map((s) => (
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
          />
        ))}
      </div>

      <p className="mt-3 text-xs text-slate-400">
        道B品質×成長で厳選した保有候補。ステータス＝エントリータイミング（買い場/押し目待ち/過熱/見送り）。
        注文は IFD 買い指値＋OCO 損切逆指値/利確。最終判断は各社の事業精査後に。
      </p>
    </div>
  );
}
