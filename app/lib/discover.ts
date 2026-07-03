import { promises as fs } from "node:fs";
import path from "node:path";

// 全ユニバース横断スクリーニング（pipeline/discover.py が生成）。
// process.cwd() は dashboard/ を指すため、その親の output/ を見る。
const DISCOVER_PATH = path.join(process.cwd(), "..", "output", "scored_universe.json");
// 土俵スクリーン（道B品質×成長×土俵。pipeline/domain_screen.py が生成）通過コードの join 用。
// 合流バッジ（P4）: discover.py 側は変更せず、API 層で domain_screen.json（数十銘柄・軽量）を
// 読んで bool を1個添えるだけにする（scored_universe.json は3756行あり pipeline 再実行は重いため）。
const DOMAIN_SCREEN_PATH = path.join(process.cwd(), "..", "output", "domain_screen.json");

// scored_universe.json の1銘柄（生指標のみ。割安/局面/成長の分類は下流で算出）
export interface DiscoverStock {
  code: string;
  name: string;
  sector: string;
  market: string;
  scale: string | null;
  close: number | null;
  ma25: number | null;
  ma75: number | null;
  rsi: number | null;
  volume_ratio: number | null;
  as_of: string | null;
  growth_score: number | null;
  rev_yoy: number | null; // 売上YoY（小数。0.44 = +44%）
  growth_pass: boolean | null;
  next_disclosure_est: string | null;
  // 変化トリガー（P3/L2）: 四半期加速・会社予想改定。エッジ主張はしない
  // （機械ドリフトは不発と検証済み）＝注意喚起+ドシエ対象選定の材料。
  rev_accel: number | null;   // 売上YoYの加速度（小数）
  eps_accel: number | null;   // EPS YoYの加速度（小数）
  revision_pct: number | null; // 会社予想（営業利益優先/無ければ売上）の直近改定率。正=上方修正
  revision_date: string | null; // 直近改定の開示日
  per: number | null;
  forward_per: number | null;
  pbr: number | null;
  roe_pct: number | null;
  opm_pct: number | null;
  fund_as_of: string | null;
  // エントリー設定（signals.json 由来。設定なしは setup_type=null / edge_aligned=false）
  setup_type: string | null;
  trigger_price: number | null;
  stop_loss: number | null;
  tp_first: number | null;
  edge_aligned: boolean;
  // 合流バッジ（P4）: 土俵スクリーン（domain_screen.json）通過コードとの join。API層で付与。
  is_domain: boolean;
}

export interface DiscoverResponse {
  ok: boolean;
  message: string | null;
  generated_at: string | null;
  as_of: string | null;
  n: number;
  n_fund: number;
  n_growth: number;
  n_setup: number;
  stocks: DiscoverStock[];
}

function empty(message: string, ok: boolean): DiscoverResponse {
  return { ok, message, generated_at: null, as_of: null, n: 0, n_fund: 0, n_growth: 0, n_setup: 0, stocks: [] };
}

// domain_screen.json の通過コード集合（数十銘柄）。読めない/未生成でも空集合で継続
// （is_domain は「全て false」に落ちるだけで発掘タブ自体は表示できる）。
async function readDomainCodes(): Promise<Set<string>> {
  try {
    const raw = await fs.readFile(DOMAIN_SCREEN_PATH, "utf-8");
    const data = JSON.parse(raw) as { stocks?: { code?: string }[] };
    return new Set((data.stocks ?? []).map((s) => s.code).filter((c): c is string => !!c));
  } catch {
    return new Set();
  }
}

export async function readDiscover(): Promise<DiscoverResponse> {
  let raw: string;
  try {
    raw = await fs.readFile(DISCOVER_PATH, "utf-8");
  } catch {
    return empty(
      "scored_universe.json がまだ生成されていません。pipeline/discover.py を実行してください。",
      true
    );
  }
  let data: Partial<DiscoverResponse>;
  try {
    data = JSON.parse(raw) as Partial<DiscoverResponse>;
  } catch {
    return empty("scored_universe.json の解析に失敗しました（JSON エラー）。", false);
  }
  const rawStocks = Array.isArray(data.stocks) ? data.stocks : [];
  const domainCodes = await readDomainCodes();
  const stocks = rawStocks.map((s) => ({ ...s, is_domain: domainCodes.has(s.code) }));
  return {
    ok: true,
    message: stocks.length === 0 ? "発掘データが空です。" : null,
    generated_at: data.generated_at ?? null,
    as_of: data.as_of ?? null,
    n: typeof data.n === "number" ? data.n : stocks.length,
    n_fund: typeof data.n_fund === "number" ? data.n_fund : 0,
    n_growth: typeof data.n_growth === "number" ? data.n_growth : 0,
    n_setup: typeof data.n_setup === "number" ? data.n_setup : 0,
    stocks,
  };
}
