"use client";

import { useEffect, useState } from "react";
import type { DisclosureAlertsResponse } from "@/app/lib/disclosureAlerts";

// null耐性はActionQueue.tsxと同じ理由（code無し行でページ全体を落とさない）
const short = (code?: string | null) => (code ? code.replace(/0$/, "") : "");

// kind → 表示強度。earnings/revision/dilution は強調、buyback/other は控えめ
function kindTone(kind: string): { label: string; tone: string } {
  if (kind === "earnings") return { label: "決算", tone: "bg-red-100 text-red-700" };
  if (kind === "revision") return { label: "修正", tone: "bg-orange-100 text-orange-700" };
  if (kind === "dilution") return { label: "希薄化", tone: "bg-rose-100 text-rose-700" };
  if (kind === "buyback") return { label: "自己株", tone: "bg-emerald-100 text-emerald-700" };
  return { label: "開示", tone: "bg-slate-100 text-slate-600" };
}

function daysUntil(iso: string): number | null {
  const t = new Date(iso + "T00:00:00");
  if (isNaN(t.getTime())) return null;
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((t.getTime() - base.getTime()) / 86400000);
}

/** 全タブ共通の開示アラートバナー（ウォッチ+厳選+保有銘柄のみ対象）。
 *  ⚠ 直近の適時開示 / 📅 ドシエwatch_points由来の予定日（近似・正本は会社IR）。 */
export default function DisclosureBanner() {
  const [data, setData] = useState<DisclosureAlertsResponse | null>(null);

  useEffect(() => {
    fetch("/api/disclosure-alerts")
      .then((r) => r.json())
      .then((d: DisclosureAlertsResponse) => setData(d))
      .catch(() => setData(null));
  }, []);

  if (!data || (!data.alerts.length && !data.upcoming.length)) return null;

  const shown = data.alerts.slice(0, 3);
  const rest = data.alerts.length - shown.length;

  return (
    <div className="mb-3 space-y-1.5">
      {data.upcoming.length > 0 && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
          {data.upcoming.map((u) => {
            const d = daysUntil(u.date);
            return (
              <div key={`${u.code}-${u.date}`} className="flex flex-wrap items-center gap-x-2">
                <span>📅</span>
                <span className="font-semibold">{u.name}</span>
                <span className="text-xs text-indigo-400">{short(u.code)}</span>
                <span className="tabular-nums">
                  {u.date}
                  {d != null && d >= 0 && <b>（あと{d}日）</b>}
                </span>
                {u.note && (
                  <span className="text-xs text-indigo-600/80 cursor-help" title={u.note}>
                    — {u.note.slice(0, 40)}…
                  </span>
                )}
              </div>
            );
          })}
          <p className="mt-0.5 text-[10px] text-indigo-400">
            ドシエ調査由来の予定日（近似・網羅性なし）。この銘柄に入る/持ち越す前に会社IRで確定日を確認。
          </p>
        </div>
      )}

      {shown.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {shown.map((a, i) => {
            const k = kindTone(a.kind);
            return (
              <div key={`${a.code}-${a.date}-${i}`} className="flex flex-wrap items-center gap-x-2">
                <span>⚠</span>
                <span className="text-xs tabular-nums text-amber-500">{a.date}</span>
                <span className={`rounded px-1 text-[10px] font-semibold ${k.tone}`}>{k.label}</span>
                <span className="font-semibold">{a.name}</span>
                <span className="text-xs text-amber-400">{short(a.code)}</span>
                {a.pdf_url ? (
                  <a href={a.pdf_url} target="_blank" rel="noopener noreferrer"
                     className="truncate text-amber-800 underline decoration-amber-300 hover:decoration-amber-600">
                    {a.title}
                  </a>
                ) : (
                  <span className="truncate">{a.title}</span>
                )}
              </div>
            );
          })}
          {rest > 0 && <p className="mt-0.5 text-[11px] text-amber-500">ほか {rest} 件（ウォッチ/保有銘柄の直近開示）</p>}
        </div>
      )}
    </div>
  );
}
