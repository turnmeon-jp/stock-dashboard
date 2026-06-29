"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { DiscoverResponse, DiscoverStock } from "@/app/lib/discover";
import { fmtNum, fmtPct } from "@/app/lib/format";

// 末尾0を除いた東証4桁表示
const short = (code: string) => code.replace(/0$/, "");
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ---- 下流の分類ラベル（labels.py 移植。しきい値は UI 可変） ----
function techPhase(s: DiscoverStock): string | null {
  const { ma25, ma75, rsi } = s;
  if (ma25 == null || ma75 == null || rsi == null) return null;
  const up = ma25 >= ma75;
  if (rsi >= 70) return "過熱";
  if (up && rsi <= 45) return "上昇×押し目";
  if (up) return "上昇トレンド";
  if (rsi <= 30) return "売られすぎ";
  return "下降/レンジ";
}
function phaseTone(p: string | null): string {
  if (p === "上昇×押し目") return "bg-emerald-100 text-emerald-700";
  if (p === "上昇トレンド") return "bg-blue-50 text-blue-700";
  if (p === "過熱") return "bg-amber-100 text-amber-700";
  if (p === "売られすぎ") return "bg-violet-100 text-violet-700";
  if (p === "下降/レンジ") return "bg-slate-100 text-slate-500";
  return "text-slate-300";
}
// 割安: 実績PER優先、無ければ予想PER
const effPer = (s: DiscoverStock): number | null =>
  s.per != null && s.per > 0 ? s.per : s.forward_per != null && s.forward_per > 0 ? s.forward_per : null;

type SortKey = "growth_score" | "rev_yoy" | "per" | "roe_pct" | "volume_ratio";
const SORTS: { key: SortKey; label: string; asc?: boolean }[] = [
  { key: "growth_score", label: "成長スコア" },
  { key: "rev_yoy", label: "増収率" },
  { key: "per", label: "割安(PER昇順)", asc: true },
  { key: "roe_pct", label: "ROE" },
  { key: "volume_ratio", label: "出来高急増" },
];

export default function Discover() {
  const [data, setData] = useState<DiscoverResponse | null>(null);
  const [loading, setLoading] = useState(true);

  // フィルタ / しきい値（下流で即反映）
  const [q, setQ] = useState("");
  const [market, setMarket] = useState<string>("グロース");
  const [sector, setSector] = useState<string>("");
  const [minRev, setMinRev] = useState(10); // 増収率 % 下限
  const [maxPer, setMaxPer] = useState(40); // PER 上限
  const [passOnly, setPassOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("growth_score");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/discover")
      .then((r) => r.json())
      .then((d: DiscoverResponse) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const sectors = useMemo(() => {
    if (!data) return [];
    return [...new Set(data.stocks.map((s) => s.sector).filter(Boolean))].sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const qq = q.trim().toLowerCase();
    return data.stocks.filter((s) => {
      if (market && s.market !== market) return false;
      if (sector && s.sector !== sector) return false;
      if (passOnly && s.growth_pass !== true) return false;
      if (qq && !(s.code.includes(qq) || s.name.toLowerCase().includes(qq))) return false;
      if (minRev > -100 && (s.rev_yoy == null || s.rev_yoy * 100 < minRev)) return false;
      if (maxPer < 200) {
        const p = effPer(s);
        if (p == null || p > maxPer) return false;
      }
      return true;
    });
  }, [data, q, market, sector, passOnly, minRev, maxPer]);

  const ranked = useMemo(() => {
    const asc = SORTS.find((x) => x.key === sort)?.asc ?? false;
    const val = (s: DiscoverStock) => {
      const v = sort === "per" ? effPer(s) : (s[sort] as number | null);
      return v == null ? (asc ? Infinity : -Infinity) : v;
    };
    return [...filtered].sort((a, b) => (asc ? val(a) - val(b) : val(b) - val(a)));
  }, [filtered, sort]);

  const sel = useMemo(
    () => (selected ? (data?.stocks.find((s) => s.code === selected) ?? null) : null),
    [selected, data]
  );

  if (loading) return <p className="py-6 text-center text-slate-400 text-sm">読み込み中…</p>;
  // 取得失敗・未生成・空データ（ok:true でも message 付き）はいずれも理由を表示
  if (!data || !data.ok || data.stocks.length === 0)
    return (
      <p className="py-6 text-center text-slate-400 text-sm">
        {data?.message ?? "発掘データの取得に失敗しました。"}
      </p>
    );

  return (
    <div className="space-y-5">
      {/* 注意書き: 自動シグナルではない */}
      <p className="rounded bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-500">
        全{data.n}銘柄を横断スクリーニング（割安算出 {data.n_fund} / 成長算出 {data.n_growth}・as_of {data.as_of}）。
        <b className="text-slate-600">裁量エントリーのアイデア生成用</b>であり自動売買シグナルではありません。
        割安/局面/成長ラベルは下のしきい値で即変わります。
      </p>

      {/* コントロール */}
      <Controls
        {...{ q, setQ, market, setMarket, sector, setSector, sectors, minRev, setMinRev, maxPer, setMaxPer, passOnly, setPassOnly, sort, setSort }}
        count={filtered.length}
      />

      {/* 割安×成長 散布図 + セクターヒートマップ */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ValueGrowthScatter stocks={filtered} selected={selected} onSelect={setSelected} minRev={minRev} maxPer={maxPer} />
        <SectorHeatmap stocks={data.stocks.filter((s) => !market || s.market === market)} active={sector} onPick={setSector} />
      </div>

      {/* レーダー詳細（選択時） */}
      {sel && <RadarDetail s={sel} onClose={() => setSelected(null)} />}

      {/* ランキング表 */}
      <RankingTable ranked={ranked} selected={selected} onSelect={setSelected} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
function Controls(p: {
  q: string; setQ: (v: string) => void;
  market: string; setMarket: (v: string) => void;
  sector: string; setSector: (v: string) => void; sectors: string[];
  minRev: number; setMinRev: (v: number) => void;
  maxPer: number; setMaxPer: (v: number) => void;
  passOnly: boolean; setPassOnly: (v: boolean) => void;
  sort: SortKey; setSort: (v: SortKey) => void;
  count: number;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input
          value={p.q}
          onChange={(e) => p.setQ(e.target.value)}
          placeholder="コード/銘柄名で検索"
          className="rounded border border-slate-300 px-2 py-1 text-sm w-40"
        />
        <select value={p.market} onChange={(e) => p.setMarket(e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-sm">
          {["", "グロース", "プライム", "スタンダード"].map((m) => (
            <option key={m} value={m}>{m || "全市場"}</option>
          ))}
        </select>
        <select value={p.sector} onChange={(e) => p.setSector(e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-sm max-w-[12rem]">
          <option value="">全セクター</option>
          {p.sectors.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={p.sort} onChange={(e) => p.setSort(e.target.value as SortKey)} className="rounded border border-slate-300 px-2 py-1 text-sm">
          {SORTS.map((s) => <option key={s.key} value={s.key}>並び: {s.label}</option>)}
        </select>
        <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700">
          <input type="checkbox" checked={p.passOnly} onChange={(e) => p.setPassOnly(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
          成長フィルタ通過のみ
        </label>
        <span className="text-xs text-slate-500 ml-auto">{p.count}件</span>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-slate-600">
        <label className="flex items-center gap-2">
          増収率 ≥ <b className="font-mono w-10 text-right">{p.minRev}%</b>
          <input type="range" min={-30} max={60} step={5} value={p.minRev} onChange={(e) => p.setMinRev(Number(e.target.value))} className="accent-emerald-600" />
        </label>
        <label className="flex items-center gap-2">
          PER ≤ <b className="font-mono w-10 text-right">{p.maxPer >= 200 ? "∞" : p.maxPer}</b>
          <input type="range" min={5} max={200} step={5} value={p.maxPer} onChange={(e) => p.setMaxPer(Number(e.target.value))} className="accent-emerald-600" />
        </label>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
// 割安(PER) × 成長(増収率) 象限散布図。右下=割安×高成長＝狙い目を緑で網掛け。
function ValueGrowthScatter(p: {
  stocks: DiscoverStock[]; selected: string | null; onSelect: (c: string) => void;
  minRev: number; maxPer: number;
}) {
  const W = 100, H = 70, PAD = 8;
  const GX0 = -30, GX1 = 80;     // x: 増収率 %
  const PY0 = 0, PY1 = 60;       // y: PER
  const xPos = (g: number) => PAD + ((clamp(g, GX0, GX1) - GX0) / (GX1 - GX0)) * (W - 2 * PAD);
  const yPos = (per: number) => PAD + (1 - (clamp(per, PY0, PY1) - PY0) / (PY1 - PY0)) * (H - 2 * PAD);

  const pts = p.stocks
    .map((s) => ({ s, g: s.rev_yoy != null ? s.rev_yoy * 100 : null, per: effPer(s) }))
    .filter((d): d is { s: DiscoverStock; g: number; per: number } => d.g != null && d.per != null);

  // 狙い目ゾーン（増収 minRev 以上 & PER maxPer 以下）の左上角
  const zx = xPos(p.minRev), zy = yPos(p.maxPer);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs text-slate-500 mb-1">割安 × 成長（{pts.length}銘柄・横=増収率% / 縦=PER下ほど割安）</div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ aspectRatio: `${W}/${H}` }}>
        {/* 狙い目ゾーン: 右下 */}
        <rect x={zx} y={zy} width={W - PAD - zx} height={H - PAD - zy} fill="#10b981" opacity={0.08} />
        {/* 枠 */}
        <rect x={PAD} y={PAD} width={W - 2 * PAD} height={H - 2 * PAD} fill="none" stroke="#e2e8f0" strokeWidth={0.4} />
        {/* しきい値線 */}
        <line x1={zx} y1={PAD} x2={zx} y2={H - PAD} stroke="#10b981" strokeWidth={0.3} strokeDasharray="1 1" />
        <line x1={PAD} y1={zy} x2={W - PAD} y2={zy} stroke="#10b981" strokeWidth={0.3} strokeDasharray="1 1" />
        {pts.map(({ s, g, per }) => {
          const isSel = s.code === p.selected;
          return (
            <circle
              key={s.code}
              cx={xPos(g)} cy={yPos(per)} r={isSel ? 1.6 : 0.9}
              fill={s.growth_pass ? "#059669" : "#94a3b8"}
              stroke={isSel ? "#1d4ed8" : "none"} strokeWidth={isSel ? 0.6 : 0}
              opacity={s.growth_pass ? 0.85 : 0.5}
              onClick={() => p.onSelect(s.code)}
              style={{ cursor: "pointer" }}
            >
              <title>{`${short(s.code)} ${s.name}｜増収${fmtPct(g)} / PER${fmtNum(per)}`}</title>
            </circle>
          );
        })}
        <text x={W - PAD} y={H - 2} fontSize={2.6} textAnchor="end" fill="#94a3b8">増収率→</text>
        <text x={2} y={PAD + 2} fontSize={2.6} fill="#94a3b8">割高</text>
        <text x={2} y={H - PAD} fontSize={2.6} fill="#94a3b8">割安</text>
      </svg>
      <p className="text-[10px] text-slate-400 mt-1">緑＝成長フィルタ通過。点クリックでレーダー詳細。右下の緑帯＝割安×高成長。</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
// セクター別ヒートマップ: 件数 + 成長スコア中央値。クリックでセクター絞り込み。
function SectorHeatmap(p: { stocks: DiscoverStock[]; active: string; onPick: (s: string) => void }) {
  const rows = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const s of p.stocks) {
      if (!s.sector || s.growth_score == null) continue;
      (m.get(s.sector) ?? m.set(s.sector, []).get(s.sector)!).push(s.growth_score);
    }
    return [...m.entries()]
      .map(([sector, arr]) => {
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        // 偶数件は中央2値の平均（表示名どおりの中央値）
        const med = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
        return { sector, n: arr.length, med };
      })
      .sort((a, b) => b.med - a.med);
  }, [p.stocks]);

  const tone = (med: number) => {
    // 0..100 を薄緑→濃緑へ
    const t = clamp(med / 80, 0, 1);
    return `rgba(5,150,105,${0.1 + t * 0.7})`;
  };

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="text-xs text-slate-500 mb-2">セクター別 成長スコア中央値（クリックで絞り込み）</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {rows.map((r) => (
          <button
            key={r.sector}
            onClick={() => p.onPick(p.active === r.sector ? "" : r.sector)}
            className={`rounded px-2 py-1.5 text-left text-[11px] leading-tight border ${
              p.active === r.sector ? "border-blue-500 ring-1 ring-blue-400" : "border-transparent"
            }`}
            style={{ backgroundColor: tone(r.med) }}
            title={`${r.sector}: 中央値${fmtNum(r.med)} / ${r.n}銘柄`}
          >
            <div className="font-medium text-slate-800 truncate">{r.sector}</div>
            <div className="text-slate-600 font-mono">{fmtNum(r.med)}<span className="text-slate-400"> ({r.n})</span></div>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
// 5軸レーダー: 成長 / 増収 / ROE / 利益率 / 割安。
function RadarDetail(p: { s: DiscoverStock; onClose: () => void }) {
  const s = p.s;
  const per = effPer(s);
  const axes = [
    { label: "成長", v: s.growth_score != null ? clamp(s.growth_score / 100, 0, 1) : null, raw: s.growth_score != null ? fmtNum(s.growth_score) : "-" },
    { label: "増収", v: s.rev_yoy != null ? clamp(s.rev_yoy / 0.5, 0, 1) : null, raw: s.rev_yoy != null ? fmtPct(s.rev_yoy * 100) : "-" },
    { label: "ROE", v: s.roe_pct != null ? clamp(s.roe_pct / 30, 0, 1) : null, raw: s.roe_pct != null ? fmtPct(s.roe_pct) : "-" },
    { label: "利益率", v: s.opm_pct != null ? clamp(s.opm_pct / 30, 0, 1) : null, raw: s.opm_pct != null ? fmtPct(s.opm_pct) : "-" },
    { label: "割安", v: per != null ? clamp(1 - per / 40, 0, 1) : null, raw: per != null ? `PER${fmtNum(per)}` : "-" },
  ];
  const C = 50, R = 38, N = axes.length;
  const ang = (i: number) => (Math.PI * 2 * i) / N - Math.PI / 2;
  const pt = (i: number, r: number) => [C + r * Math.cos(ang(i)), C + r * Math.sin(ang(i))];
  const poly = axes.map((a, i) => pt(i, R * (a.v ?? 0)).join(",")).join(" ");

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 shadow-sm">
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm font-semibold text-slate-800">
          <span className="font-mono text-slate-500">{short(s.code)}</span> {s.name}
          <span className="ml-2 text-xs font-normal text-slate-500">{s.market} / {s.sector}</span>
        </div>
        <button onClick={p.onClose} className="text-xs text-slate-400 hover:text-slate-600">✕ 閉じる</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-[160px_1fr] items-center">
        <svg viewBox="0 0 100 100" className="w-40 mx-auto">
          {[0.25, 0.5, 0.75, 1].map((g) => (
            <polygon key={g} points={axes.map((_, i) => pt(i, R * g).join(",")).join(" ")} fill="none" stroke="#cbd5e1" strokeWidth={0.3} />
          ))}
          {axes.map((a, i) => {
            const [x, y] = pt(i, R);
            const [lx, ly] = pt(i, R + 6);
            return (
              <g key={a.label}>
                <line x1={C} y1={C} x2={x} y2={y} stroke="#e2e8f0" strokeWidth={0.3} />
                <text x={lx} y={ly} fontSize={4} textAnchor="middle" dominantBaseline="middle" fill="#64748b">{a.label}</text>
              </g>
            );
          })}
          <polygon points={poly} fill="#3b82f6" fillOpacity={0.25} stroke="#2563eb" strokeWidth={0.6} />
        </svg>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1 text-xs">
          {axes.map((a) => (
            <div key={a.label}>
              <span className="text-slate-400">{a.label}</span>{" "}
              <span className="font-mono text-slate-800">{a.raw}</span>
            </div>
          ))}
          <div><span className="text-slate-400">PBR</span> <span className="font-mono text-slate-800">{s.pbr != null ? fmtNum(s.pbr, 2) : "-"}</span></div>
          <div><span className="text-slate-400">RSI</span> <span className="font-mono text-slate-800">{s.rsi != null ? fmtNum(s.rsi) : "-"}</span></div>
          <div><span className="text-slate-400">局面</span> <span className="font-mono text-slate-800">{techPhase(s) ?? "-"}</span></div>
          <div className="col-span-2 sm:col-span-3 mt-1">
            <Link href={`/stock/${s.code}`} className="inline-block rounded border border-blue-300 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100">
              詳細チャートを開く →
            </Link>
            <span className="ml-2 text-[10px] text-slate-400">財務基準日 {s.fund_as_of ?? "-"} / 次回決算目安 {s.next_disclosure_est ?? "-"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
function RankingTable(p: { ranked: DiscoverStock[]; selected: string | null; onSelect: (c: string) => void }) {
  const cols = ["銘柄", "市場", "セクター", "局面", "成長", "増収率", "PER", "PBR", "ROE", "利益率", "出来高", "決算目安"];
  const TOP = 200; // 表示上限（描画負荷対策）
  const rows = p.ranked.slice(0, TOP);
  return (
    <div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-100 text-slate-600 text-left">
              {cols.map((h) => <th key={h} className="px-2.5 py-2 font-medium whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => {
              const ph = techPhase(s);
              const per = effPer(s);
              const isSel = s.code === p.selected;
              return (
                <tr
                  key={s.code}
                  onClick={() => p.onSelect(s.code)}
                  className={`cursor-pointer border-t border-slate-100 hover:bg-blue-50 ${isSel ? "bg-blue-50" : ""}`}
                >
                  <td className="px-2.5 py-1.5 whitespace-nowrap">
                    <span className="font-mono text-slate-500">{short(s.code)}</span>{" "}
                    <span className="font-medium">{s.name}</span>
                    {s.growth_pass && <span className="ml-1 text-[10px] text-emerald-600">✓</span>}
                  </td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap text-xs text-slate-500">{s.market}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap text-xs text-slate-500 max-w-[8rem] truncate">{s.sector}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap">
                    <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] ${phaseTone(ph)}`}>{ph ?? "-"}</span>
                  </td>
                  <td className="px-2.5 py-1.5 text-right font-mono whitespace-nowrap">{s.growth_score != null ? fmtNum(s.growth_score) : "-"}</td>
                  <td className={`px-2.5 py-1.5 text-right font-mono whitespace-nowrap ${(s.rev_yoy ?? 0) > 0 ? "text-emerald-600" : (s.rev_yoy ?? 0) < 0 ? "text-rose-600" : ""}`}>
                    {s.rev_yoy != null ? fmtPct(s.rev_yoy * 100) : "-"}
                  </td>
                  <td className="px-2.5 py-1.5 text-right font-mono whitespace-nowrap">{per != null ? fmtNum(per) : "-"}</td>
                  <td className="px-2.5 py-1.5 text-right font-mono whitespace-nowrap">{s.pbr != null ? fmtNum(s.pbr, 2) : "-"}</td>
                  <td className="px-2.5 py-1.5 text-right font-mono whitespace-nowrap">{s.roe_pct != null ? fmtPct(s.roe_pct) : "-"}</td>
                  <td className="px-2.5 py-1.5 text-right font-mono whitespace-nowrap">{s.opm_pct != null ? fmtPct(s.opm_pct) : "-"}</td>
                  <td className="px-2.5 py-1.5 text-right font-mono whitespace-nowrap">{s.volume_ratio != null ? `${fmtNum(s.volume_ratio, 1)}x` : "-"}</td>
                  <td className="px-2.5 py-1.5 whitespace-nowrap text-xs text-slate-400">{s.next_disclosure_est ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {p.ranked.length > TOP && (
        <p className="mt-2 text-xs text-slate-400">上位{TOP}件を表示（全{p.ranked.length}件）。フィルタで絞り込んでください。</p>
      )}
    </div>
  );
}
