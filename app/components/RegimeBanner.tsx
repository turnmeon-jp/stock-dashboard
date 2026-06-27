import type { Regime, RegimeLabel } from "@/app/lib/types";

const LABEL_JA: Record<RegimeLabel, string> = {
  risk_on: "リスクオン",
  neutral: "中立",
  risk_off: "リスクオフ",
};

const STYLE: Record<RegimeLabel, { wrap: string; badge: string; note: string; message: string }> = {
  risk_on: {
    wrap: "border-emerald-300 bg-emerald-50",
    badge: "bg-emerald-600 text-white",
    note: "text-emerald-800",
    message: "新規エントリー可。",
  },
  neutral: {
    wrap: "border-amber-300 bg-amber-50",
    badge: "bg-amber-500 text-white",
    note: "text-amber-800",
    message: "中立局面。エントリーは適合銘柄に絞り、サイズを抑えめに。",
  },
  risk_off: {
    wrap: "border-rose-300 bg-rose-50",
    badge: "bg-rose-600 text-white",
    note: "text-rose-800",
    message: "⚠️ 弱気相場: 新規エントリーは見送り推奨。",
  },
};

const TIER_COLOR: Record<RegimeLabel, string> = {
  risk_on: "text-emerald-700",
  neutral: "text-amber-600",
  risk_off: "text-rose-600",
};

export default function RegimeBanner({ regime }: { regime: Regime | null }) {
  if (!regime) return null;

  const s = STYLE[regime.label] ?? STYLE.neutral;
  const labelJa = LABEL_JA[regime.label] ?? regime.label;
  const isRiskOff = regime.label === "risk_off";

  const marketR = (regime.market_regime ?? regime.label) as RegimeLabel;
  const growthR  = regime.growth_regime as RegimeLabel | null | undefined;
  const hasTwoTier = !!growthR;

  return (
    <div className={`mb-4 rounded-lg border px-3 py-2.5 ${s.wrap}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={`shrink-0 rounded-md px-2 py-1 text-sm font-bold ${s.badge}`}>
          {labelJa}
        </span>
        {hasTwoTier ? (
          <>
            <span className="text-sm text-slate-600">
              大型株
              <span className={`ml-1 font-semibold ${TIER_COLOR[marketR]}`}>
                {LABEL_JA[marketR]}
              </span>
              <span className="ml-1 text-slate-400 font-mono text-xs">
                ({regime.breadth.toFixed(2)})
              </span>
            </span>
            <span className="text-slate-300 text-sm">×</span>
            <span className="text-sm text-slate-600">
              グロース
              <span className={`ml-1 font-semibold ${TIER_COLOR[growthR!]}`}>
                {LABEL_JA[growthR!]}
              </span>
              <span className="ml-1 text-slate-400 font-mono text-xs">
                ({regime.growth_breadth?.toFixed(2) ?? "-"})
              </span>
            </span>
          </>
        ) : (
          <span className={`text-sm font-semibold ${s.note}`}>
            breadth {regime.breadth.toFixed(2)} / 閾値 {regime.risk_on_threshold.toFixed(2)}
          </span>
        )}
        <span className={`text-sm ${isRiskOff ? `font-semibold ${s.note}` : "text-slate-600"}`}>
          {s.message}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        大型株SMA200上比率 ≧{regime.risk_on_threshold} かつ グロースSMA75上比率 ≧{(regime.growth_riskon_threshold ?? 0.45).toFixed(2)} でrisk_on。
        最終レジームは保守的な方を採用。
      </p>
    </div>
  );
}
