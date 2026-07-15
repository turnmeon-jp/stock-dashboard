import { promises as fs, existsSync } from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ChartData } from "@/app/lib/types";

const execFileP = promisify(execFile);

// プロジェクト直上の output/charts/ を参照する。
// process.cwd() は dashboard/ を指すため、その親の output/charts/ を見る。
const REPO_ROOT = path.join(process.cwd(), "..");
const CHARTS_DIR = path.join(REPO_ROOT, "output", "charts");

// Python インタプリタ解決: env 上書き → ローカル .venv → PATH の python3（クリーン環境/別デプロイ対応）
function resolvePy(): string {
  const abs = [process.env.TRADEBASE_PYTHON, path.join(REPO_ROOT, ".venv", "bin", "python")].filter(
    Boolean,
  ) as string[];
  for (const c of abs) {
    try {
      if (existsSync(c)) return c;
    } catch {
      /* noop */
    }
  }
  return process.env.TRADEBASE_PYTHON || "python3";
}
const PY = resolvePy();

// J-Quants 形式コード（3数字 + 英数字1 + 市場0 = 5桁。例 13010 / 130A0）のみ生成対象にする。
const JQ_CODE = /^\d{3}[0-9A-Za-z]0$/;
// 直近に生成失敗したコードの否定キャッシュ（無効コード連打で Python を都度起動しないため）。
const negCache = new Map<string, number>();
const NEG_TTL_MS = 60_000;

async function readChartFile(code: string): Promise<ChartData | null> {
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

// 銘柄コード単位のチャートデータを読み込む。未生成なら発掘の任意銘柄でも
// オンデマンドで生成してから読む（候補80件に限らず詳細チャートを開けるように）。
export async function readChart(code: string): Promise<ChartData | null> {
  // ディレクトリトラバーサル防止＋生成対象の限定（任意コードでの Python 連打を防ぐ）
  if (!JQ_CODE.test(code)) return null;
  const existing = await readChartFile(code);
  if (existing) return existing;
  // 直近に生成失敗したコードは再起動しない（無効コード連打のDoS面を抑制）
  const failedAt = negCache.get(code);
  if (failedAt && Date.now() - failedAt < NEG_TTL_MS) return null;
  try {
    await execFileP(PY, ["-m", "pipeline.chart_data", "--one", code], {
      cwd: REPO_ROOT,
      timeout: 30_000,
    });
  } catch {
    negCache.set(code, Date.now());
    return null; // 生成失敗（日足不足・存在しないコード等）
  }
  const built = await readChartFile(code);
  if (!built) negCache.set(code, Date.now());
  return built;
}
