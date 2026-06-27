import { promises as fs } from "node:fs";
import path from "node:path";
import type { ChartData, ChartIndex } from "@/app/lib/types";

// プロジェクト直上の output/charts/ を参照する。
// process.cwd() は dashboard/ を指すため、その親の output/charts/ を見る。
const CHARTS_DIR = path.join(process.cwd(), "..", "output", "charts");

// _index.json を読み込む。未生成時は空の一覧を返す。
export async function readChartIndex(): Promise<ChartIndex> {
  try {
    const raw = await fs.readFile(path.join(CHARTS_DIR, "_index.json"), "utf-8");
    const d = JSON.parse(raw) as Partial<ChartIndex>;
    return {
      as_of: d.as_of ?? null,
      charts: Array.isArray(d.charts) ? d.charts : [],
    };
  } catch {
    return { as_of: null, charts: [] };
  }
}

// 銘柄コード単位のチャートデータを読み込む。未存在/解析失敗時は null。
export async function readChart(code: string): Promise<ChartData | null> {
  // ディレクトリトラバーサル防止: 英数字のみ許可
  if (!/^[0-9A-Za-z]+$/.test(code)) return null;
  try {
    const raw = await fs.readFile(path.join(CHARTS_DIR, `${code}.json`), "utf-8");
    const d = JSON.parse(raw) as Partial<ChartData>;
    // 必須フィールドの存在確認（壊れたJSONでCandleChartがクラッシュするのを防ぐ）
    if (
      !d.code ||
      !Array.isArray(d.candles) ||
      !Array.isArray(d.sma25) ||
      !Array.isArray(d.volume)
    ) {
      return null;
    }
    return d as ChartData;
  } catch {
    return null;
  }
}
