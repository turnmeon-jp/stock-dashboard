"use client";

import { useEffect, useRef } from "react";
import type { ChartData } from "@/app/lib/types";

// lightweight-charts はブラウザ専用 (window 依存) のため、
// useEffect 内で動的 import して描画する（SSR 回避）。
export default function CandleChart({ data }: { data: ChartData }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let disposed = false;
    // dispose 用のクリーンアップ関数を保持
    let cleanup: (() => void) | undefined;

    (async () => {
      const {
        createChart,
        CandlestickSeries,
        LineSeries,
        HistogramSeries,
        LineStyle,
        CrosshairMode,
      } = await import("lightweight-charts");
      if (disposed || !containerRef.current) return;

      const chart = createChart(containerRef.current, {
        autoSize: true,
        layout: {
          background: { color: "#ffffff" },
          textColor: "#475569",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: "#f1f5f9" },
          horzLines: { color: "#f1f5f9" },
        },
        crosshair: { mode: CrosshairMode.Normal },
        rightPriceScale: { borderColor: "#e2e8f0" },
        timeScale: { borderColor: "#e2e8f0", timeVisible: false },
      });

      // ローソク足
      const candle = chart.addSeries(CandlestickSeries, {
        upColor: "#16a34a",
        downColor: "#dc2626",
        borderUpColor: "#16a34a",
        borderDownColor: "#dc2626",
        wickUpColor: "#16a34a",
        wickDownColor: "#dc2626",
        priceScaleId: "right",
      });
      candle.setData(data.candles);
      // 出来高の余白を確保（下部20%を出来高に）
      candle.priceScale().applyOptions({
        scaleMargins: { top: 0.05, bottom: 0.25 },
      });

      // SMA25 (青) / SMA75 (橙)
      const sma25 = chart.addSeries(LineSeries, {
        color: "#2563eb",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      sma25.setData(data.sma25);
      const sma75 = chart.addSeries(LineSeries, {
        color: "#ea580c",
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      sma75.setData(data.sma75);

      // 出来高（下部ヒストグラム・独立スケール）
      const vol = chart.addSeries(HistogramSeries, {
        color: "#cbd5e1",
        priceFormat: { type: "volume" },
        priceScaleId: "volume",
        priceLineVisible: false,
        lastValueVisible: false,
      });
      vol.setData(data.volume.map((v) => ({ time: v.time, value: v.value })));
      chart.priceScale("volume").applyOptions({
        scaleMargins: { top: 0.8, bottom: 0 },
      });

      // 注文水準を水平ライン表示
      const levels = data.levels;
      if (levels) {
        candle.createPriceLine({
          price: levels.trigger_price,
          color: "#16a34a",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "指値",
        });
        candle.createPriceLine({
          price: levels.stop_loss,
          color: "#dc2626",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "損切",
        });
        candle.createPriceLine({
          price: levels.tp_first,
          color: "#94a3b8",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "利確",
        });
      }

      chart.timeScale().fitContent();
      cleanup = () => chart.remove();
    })();

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [data]);

  return <div ref={containerRef} className="h-[420px] w-full" />;
}
