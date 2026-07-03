// 合流バッジ（P4）: 独立した複数スクリーンの同時通過を示す小バッジ群。
// edge_aligned（検証済みエッジ=中型流動性×中期トレンド健全×押し目）/
// growth_pass（成長フィルタ通過）/ is_domain（土俵=domain_screen 道B品質×成長 通過）。
// Discover.tsx・WatchList.tsx で共用（新しい合成スコアは作らず、生指標の bool 3個をそのまま表示）。
export function confluenceCount(
  edgeAligned?: boolean | null,
  growthPass?: boolean | null,
  isDomain?: boolean | null
): number {
  return (edgeAligned ? 1 : 0) + (growthPass ? 1 : 0) + (isDomain ? 1 : 0);
}

export function ConfluenceBadges({
  edgeAligned,
  growthPass,
  isDomain,
  className = "",
}: {
  edgeAligned?: boolean | null;
  growthPass?: boolean | null;
  isDomain?: boolean | null;
  className?: string;
}) {
  const items: { label: string; tone: string; title: string }[] = [];
  if (edgeAligned) {
    items.push({
      label: "edge✓",
      tone: "bg-emerald-100 text-emerald-700",
      title: "検証エッジ適合（中型流動性×中期トレンド健全×押し目）",
    });
  }
  if (growthPass) {
    items.push({ label: "成長✓", tone: "bg-blue-50 text-blue-700", title: "成長フィルタ通過" });
  }
  if (isDomain) {
    items.push({
      label: "土俵✓",
      tone: "bg-violet-50 text-violet-700",
      title: "土俵スクリーン（domain_screen・道B品質×成長）通過",
    });
  }
  if (items.length === 0) return null;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`}>
      {items.map((b) => (
        <span
          key={b.label}
          title={b.title}
          className={`inline-block rounded px-1 py-0.5 text-[9px] font-medium cursor-help ${b.tone}`}
        >
          {b.label}
        </span>
      ))}
    </span>
  );
}
