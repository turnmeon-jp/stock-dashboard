import { promises as fs } from "node:fs";
import path from "node:path";

// 資金メタ情報（バックエンドで並行実装中。output/meta.json が生成される前提）。
// 実弾（capital.total, config.yaml）とペーパー（paper.capital_total, config.yaml）は
// 別勘定のため、表示側もここから取得した値だけを使う（3,000,000等のハードコード根絶）。
const META_PATH = path.join(process.cwd(), "..", "output", "meta.json");

export interface CapitalInfo {
  real_total: number | null;
  paper_total: number | null;
  // 実弾の1トレード当たり許容損失（円）。config.yaml capital.risk_per_trade_pct 由来。
  // 承認確認ダイアログのR換算表示（ExecutionPanel）で使う（2026-07-19 実弾運用UI安全セット）。
  real_risk_per_trade_yen: number | null;
}

export interface MetaResponse {
  ok: boolean;
  generated_at: string | null;
  capital: CapitalInfo;
}

function empty(ok: boolean): MetaResponse {
  return {
    ok,
    generated_at: null,
    capital: { real_total: null, paper_total: null, real_risk_per_trade_yen: null },
  };
}

export async function readMeta(): Promise<MetaResponse> {
  let raw: string;
  try {
    raw = await fs.readFile(META_PATH, "utf-8");
  } catch {
    return empty(false); // 未生成: 表示側は "-" にフォールバック（誤った金額を出さない）
  }
  let data: Partial<MetaResponse>;
  try {
    data = JSON.parse(raw) as Partial<MetaResponse>;
  } catch {
    return empty(false);
  }
  const cap: Partial<CapitalInfo> = data.capital ?? {};
  return {
    ok: true,
    generated_at: data.generated_at ?? null,
    capital: {
      real_total: typeof cap.real_total === "number" ? cap.real_total : null,
      paper_total: typeof cap.paper_total === "number" ? cap.paper_total : null,
      real_risk_per_trade_yen:
        typeof cap.real_risk_per_trade_yen === "number" ? cap.real_risk_per_trade_yen : null,
    },
  };
}
