"use client";

import { useEffect, useRef } from "react";
import type { ChartData } from "@/app/lib/types";

// グリッド一覧用の軽量ラインチャート。
// 多数描画になるため、直近120日に間引き・ライン(close + SMA25)のみで描画する。
export default function MiniChart({ data }: { data: ChartData }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    (async () => {
      const { createChart, LineSeries } = await import("lightweight-charts");
      if (disposed || !containerRef.current) return;

      const N = 120;
      const closes = data.candles
        .slice(-N)
        .map((c) => ({ time: c.time, value: c.close }));
      const sma25 = data.sma25.slice(-N);

      const chart = createChart(containerRef.current, {
        autoSize: true,
        layout: {
          background: { color: "#ffffff" },
          textColor: "#94a3b8",
          fontSize: 9,
        },
        grid: {
          vertLines: { visible: false },
          horzLines: { color: "#f8fafc" },
        },
        rightPriceScale: { borderVisible: false, visible: false },
        leftPriceScale: { visible: false },
        timeScale: { borderVisible: false, visible: false },
        handleScroll: false,
        handleScale: false,
        crosshair: { horzLine: { visible: false }, vertLine: { visible: false } },
      });

      const close = chart.addSeries(LineSeries, {
        color: "#0f172a",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      close.setData(closes);

      const sma = chart.addSeries(LineSeries, {
        color: "#2563eb",
        lineWidth: 1,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      sma.setData(sma25);

      chart.timeScale().fitContent();

      // display:none→block 切り替え時に ResizeObserver が発火しないブラウザ向けの fallback
      requestAnimationFrame(() => {
        if (!containerRef.current || disposed) return;
        chart.applyOptions({
          width: containerRef.current.offsetWidth || 180,
          height: containerRef.current.offsetHeight || 128,
        });
        chart.timeScale().fitContent();
      });

      cleanup = () => chart.remove();
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [data]);

  return <div ref={containerRef} className="h-32 w-full" />;
}
