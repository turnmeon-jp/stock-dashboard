// 投資ドシエ（pipeline/dossier.py が生成する output/dossiers/{code}.json）のスキーマ定義。
// api/dossier/route.ts・api/dossier/[code]/route.ts のコントラクトに準拠（T3で確定済み）。
// verdict.call は「落選判定＋根拠付き調査」のみを担う（買い推奨語彙は含まれない）。

export type DossierStatus = "processing" | "done" | "error";

// pipeline/dossier.py の VERDICT_CALLS と同一（買い系語彙は含まれない）
export type VerdictCall = "落選" | "重大懸念" | "懸念あり・監視" | "落選事由なし";

export interface DossierFinancialRead {
  text?: string;
  notes?: string[];
}

export interface DossierEdinetRead {
  moat?: string;
  cyclicality?: string;
  customer_concentration?: string;
  risks?: string;
}

export interface DossierSupplyDemand {
  text?: string;
  evidence_urls?: string[];
}

// 政策文脈（補助金採択・官公需・制度支援・規制の追い風/逆風）。判断材料でありエッジの主張ではない。
// 2026-07-04 追加のため旧ドシエには無い（optional で後方互換）。
export interface DossierPolicyContext {
  text?: string;
  evidence_urls?: string[];
}

export interface DossierWebFinding {
  date?: string | null;
  title?: string;
  takeaway?: string;
  url?: string;
  source?: string;
}

// pipeline/dossier.py の DISQ_TYPES / DISQ_SEVERITY（hard=構造的・致命的 / soft=要監視・軽微）
export interface DossierDisqualifier {
  type: string;
  severity: "hard" | "soft" | string;
  detail: string;
  url?: string;
}

export interface DossierVerdict {
  call?: VerdictCall | string;
  rationale?: string;
}

export interface DossierSourceRef {
  url: string;
  title?: string;
  note?: string;
}

// GET /api/dossier/[code] のレスポンス（生成中でもそのまま返る＝ポーリング用）
export interface DossierData {
  code: string;
  status: DossierStatus;
  started_at?: string;
  attached_at?: string;
  error?: string;
  summary?: string;
  financial_read?: DossierFinancialRead;
  edinet_read?: DossierEdinetRead;
  supply_demand?: DossierSupplyDemand;
  policy_context?: DossierPolicyContext;
  web_findings?: DossierWebFinding[];
  disqualifiers?: DossierDisqualifier[];
  verdict?: DossierVerdict;
  watch_points?: string[];
  sources?: DossierSourceRef[];
}

// GET /api/dossier のレスポンス1件（一覧・存在確認/バッジ表示用の軽量版。name は現状常に null）
export interface DossierSummary {
  code: string;
  name: string | null;
  status: DossierStatus | null;
  generated_at: string | null;
  verdict_call: string | null;
  error: string | null;
}

export interface DossierListResponse {
  dossiers: DossierSummary[];
}

/** ドシエ一覧（存在確認・verdictバッジ用）。カード毎の個別fetchを避けるため一度だけ呼ぶ想定。 */
export async function fetchDossierList(): Promise<DossierSummary[]> {
  try {
    const r = await fetch("/api/dossier", { cache: "no-store" });
    if (!r.ok) return [];
    const d = (await r.json()) as DossierListResponse;
    return Array.isArray(d.dossiers) ? d.dossiers : [];
  } catch {
    return [];
  }
}

export interface FetchDossierResult {
  data: DossierData | null;
  notFound: boolean;
  error: string | null;
}

/** 1銘柄分のドシエ本体を取得（404=未生成、そのほかのエラーは error に格納）。 */
export async function fetchDossier(code: string): Promise<FetchDossierResult> {
  try {
    const r = await fetch(`/api/dossier/${code}`, { cache: "no-store" });
    if (r.status === 404) return { data: null, notFound: true, error: null };
    const d = (await r.json()) as DossierData | { error?: string };
    if (!r.ok) {
      return { data: null, notFound: false, error: (d as { error?: string }).error ?? "取得に失敗しました" };
    }
    return { data: d as DossierData, notFound: false, error: null };
  } catch {
    return { data: null, notFound: false, error: "通信エラー" };
  }
}

export interface DossierWarningBadge {
  label: string;
  tone: string;
  title: string;
}

// P5: ドシエの落選判定を候補リストへ還流。verdict_call が「落選」「重大懸念」の銘柄だけ警告バッジを
// 出す（グレーアウト・除外はしない=判断は人間）。CandidatesTable/Discover で共用し表示ロジックを
// 二重管理しない。「懸念あり・監視」「落選事由なし」は対象外（WatchList の DossierPanel で別途表示済み）。
export function dossierWarningBadge(call: string | null | undefined): DossierWarningBadge | null {
  const title = `ドシエで${call}判定。詳細はウォッチ/気になる銘柄のドシエ参照`;
  if (call === "落選") return { label: "⚠落選", tone: "bg-red-100 text-red-700", title };
  if (call === "重大懸念") return { label: "⚠重大懸念", tone: "bg-orange-100 text-orange-700", title };
  return null;
}

export interface RequestDossierResult {
  status: number;
  error?: string;
}

/** ドシエ生成を起動（202=受理。400/409/429/500 は error にメッセージが入る）。 */
export async function requestDossier(code: string, force: boolean): Promise<RequestDossierResult> {
  try {
    const r = await fetch("/api/dossier", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, force }),
    });
    if (r.status === 202) return { status: 202 };
    const d = await r.json().catch(() => ({}) as { error?: string });
    return { status: r.status, error: (d as { error?: string }).error ?? `起動に失敗しました（${r.status}）` };
  } catch {
    return { status: 0, error: "通信エラー" };
  }
}
