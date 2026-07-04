"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchDossier,
  requestDossier,
  type DossierData,
  type DossierSummary,
} from "@/app/lib/dossier";

// ポーリングは60秒間隔。生成は10分程度・20分超もありうるため15分でポーリングは打ち切るが
// ファイルは永続化されているので再訪すれば完成品が見える（route.ts のコメント参照）。
const POLL_INTERVAL_MS = 60_000;
const POLL_MAX_MS = 15 * 60 * 1000;

function verdictTone(call?: string | null): string {
  switch (call) {
    case "落選":
      return "bg-red-100 text-red-700 border-red-300";
    case "重大懸念":
      return "bg-orange-100 text-orange-700 border-orange-300";
    case "懸念あり・監視":
      return "bg-yellow-100 text-yellow-800 border-yellow-300";
    case "落選事由なし":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    default:
      return "bg-slate-100 text-slate-500 border-slate-200";
  }
}

function SeverityBadge({ severity }: { severity: string }) {
  const hard = severity === "hard";
  const tone = hard ? "bg-red-100 text-red-700" : "bg-amber-50 text-amber-700";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${tone}`}>
      {hard ? "重大" : severity === "soft" ? "軽微" : severity}
    </span>
  );
}

function SourceLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-600 underline break-all"
    >
      {children}
    </a>
  );
}

export default function DossierPanel({
  code,
  initial,
  listReady,
}: {
  code: string;
  initial?: DossierSummary;
  // 親がドシエ一覧(GET /api/dossier)を取得済みか。true かつ initial が無ければ
  // 「未生成」と確定できるため、無駄な /api/dossier/[code] 呼び出し（404）を避ける。
  listReady?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [fetched, setFetched] = useState(false);
  const [data, setData] = useState<DossierData | null>(null);
  const [status, setStatus] = useState<string | null>(initial?.status ?? null);
  const [verdictCall, setVerdictCall] = useState<string | null>(initial?.verdict_call ?? null);
  const [notFound, setNotFound] = useState(!initial?.status);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 親の一覧fetch(GET /api/dossier)は非同期のため、初回マウント時は initial が未確定(undefined)な
  // ことがある。取得完了後に initial が更新されたら折りたたみ中のバッジにも反映する
  // （本体を取得済み(fetched)ならそちらの方が新しいので上書きしない）。
  useEffect(() => {
    if (fetched) return;
    setStatus(initial?.status ?? null);
    setVerdictCall(initial?.verdict_call ?? null);
    setNotFound(!initial?.status);
  }, [initial, fetched]);

  const [starting, setStarting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pollTimedOut, setPollTimedOut] = useState(false);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollDeadlineRef = useRef<number>(0);

  const load = useCallback(async () => {
    const res = await fetchDossier(code);
    if (res.notFound) {
      setNotFound(true);
      setData(null);
      setStatus(null);
      setVerdictCall(null);
      setLoadError(null);
      return res;
    }
    if (res.error) {
      setLoadError(res.error);
      return res;
    }
    setNotFound(false);
    setLoadError(null);
    setData(res.data);
    setStatus(res.data?.status ?? null);
    setVerdictCall(res.data?.verdict?.call ?? null);
    return res;
  }, [code]);

  // 初回展開時にのみ本体を取得（一覧は既にバッジ表示用に initial で渡っている）。
  // 一覧取得済みで initial が無い＝未生成と確定できる場合は、無駄な404取得を避ける。
  useEffect(() => {
    if (!open || fetched) return;
    setFetched(true);
    if (listReady && !initial) {
      setNotFound(true);
      return;
    }
    void load();
  }, [open, fetched, initial, listReady, load]);

  // processing の間、60秒間隔でポーリング。unmount / status変化時はクリーンアップ。
  useEffect(() => {
    if (status !== "processing") {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    if (pollRef.current) return; // 既にポーリング中
    pollDeadlineRef.current = Date.now() + POLL_MAX_MS;
    setPollTimedOut(false);
    pollRef.current = setInterval(async () => {
      const res = await load();
      const stillProcessing = res && !res.notFound && !res.error && res.data?.status === "processing";
      if (!stillProcessing) {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        return;
      }
      if (Date.now() > pollDeadlineRef.current) {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        setPollTimedOut(true);
      }
    }, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [status, load]);

  const start = useCallback(
    async (force: boolean) => {
      if (force) {
        const ok = confirm(
          `${code} のドシエを再生成しますか？\nOpus 4.8 による長時間ジョブが再度実行されます（サブスク使用量を消費します）。`,
        );
        if (!ok) return;
      }
      setStarting(true);
      setActionError(null);
      try {
        const r = await requestDossier(code, force);
        if (r.status === 202) {
          setNotFound(false);
          setStatus("processing");
          setPollTimedOut(false);
          setFetched(true);
          await load();
        } else {
          setActionError(r.error ?? "起動に失敗しました");
        }
      } finally {
        setStarting(false);
      }
    },
    [code, load],
  );

  return (
    <details
      className="mt-2 rounded border border-slate-200 bg-slate-50/60"
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600">
        <span>🗂 投資ドシエ</span>
        {verdictCall && (
          <span className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${verdictTone(verdictCall)}`}>
            {verdictCall}
          </span>
        )}
        {status === "processing" && <span className="text-[10px] text-blue-500">生成中…</span>}
        {status === "error" && <span className="text-[10px] text-rose-500">エラー</span>}
      </summary>

      <div className="space-y-2.5 border-t border-slate-200 px-3 py-2.5 text-xs">
        {loadError && (
          <p className="rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-rose-700">
            {loadError}{" "}
            <button onClick={() => void load()} className="ml-1 underline">
              再取得
            </button>
          </p>
        )}

        {!loadError && notFound && (
          <div className="space-y-2">
            <p className="text-slate-500">
              まだ投資ドシエは生成されていません。EDINET有報・Web一次情報を読み込み、落選判定＋根拠付き調査を行います。
            </p>
            <p className="text-[11px] text-slate-400">
              Opus 4.8 による調査で所要 10〜20分程度かかります。閉じても生成は続き、後で再訪すれば結果が見えます。
            </p>
            <button
              onClick={() => void start(false)}
              disabled={starting}
              className="rounded border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
              {starting ? "起動中…" : "🔍 深掘り調査（Opus）"}
            </button>
            {actionError && <p className="text-rose-600">{actionError}</p>}
          </div>
        )}

        {!loadError && !notFound && status === "processing" && (
          <div className="space-y-1.5">
            <p className="text-blue-600">
              生成中です（60秒間隔で自動更新）。時間がかかります。閉じても生成は続きます。
            </p>
            {pollTimedOut && (
              <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 text-amber-800">
                15分経過しましたが未完了です。生成は継続している可能性があります。後で再訪してください。
              </p>
            )}
          </div>
        )}

        {!loadError && !notFound && status === "error" && (
          <div className="space-y-2">
            <p className="rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-rose-700">
              {data?.error ?? "生成中にエラーが発生しました。"}
            </p>
            <button
              onClick={() => void start(false)}
              disabled={starting}
              className="rounded border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
              {starting ? "起動中…" : "再試行"}
            </button>
            {actionError && <p className="text-rose-600">{actionError}</p>}
          </div>
        )}

        {!loadError && !notFound && status === "done" && data && (
          <div className="space-y-3">
            <p className="rounded border border-amber-200 bg-amber-50 px-2 py-1.5 font-medium text-amber-800">
              ⚠️ これは落選判定であり買い推奨ではありません。最終判断は自己責任で行ってください。
            </p>

            {data.verdict?.rationale && (
              <div className={`rounded border px-2 py-1.5 ${verdictTone(verdictCall)}`}>
                <div className="font-semibold">判定根拠</div>
                <div className="mt-0.5 whitespace-pre-wrap">{data.verdict.rationale}</div>
              </div>
            )}

            {data.summary && (
              <div>
                <div className="mb-0.5 font-semibold text-slate-500">総括</div>
                <p className="whitespace-pre-wrap text-slate-700">{data.summary}</p>
              </div>
            )}

            {data.disqualifiers && data.disqualifiers.length > 0 && (
              <div>
                <div className="mb-1 font-semibold text-slate-500">落選事由候補（{data.disqualifiers.length}件）</div>
                <div className="space-y-1.5">
                  {data.disqualifiers.map((dq, i) => (
                    <div key={i} className="rounded border border-slate-200 bg-white px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-slate-700">{dq.type}</span>
                        <SeverityBadge severity={dq.severity} />
                      </div>
                      <div className="mt-0.5 text-slate-600">{dq.detail}</div>
                      {dq.url && (
                        <div className="mt-0.5">
                          <SourceLink href={dq.url}>出典</SourceLink>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.edinet_read && (
              <div className="rounded border border-slate-200 bg-white px-2 py-1.5 space-y-1">
                <div className="font-semibold text-slate-500">EDINET有報の読み</div>
                {data.edinet_read.moat && (
                  <div><span className="text-slate-400">堀: </span>{data.edinet_read.moat}</div>
                )}
                {data.edinet_read.cyclicality && (
                  <div><span className="text-slate-400">循環性: </span>{data.edinet_read.cyclicality}</div>
                )}
                {data.edinet_read.customer_concentration && (
                  <div><span className="text-slate-400">顧客集中: </span>{data.edinet_read.customer_concentration}</div>
                )}
                {data.edinet_read.risks && (
                  <div><span className="text-slate-400">リスク: </span>{data.edinet_read.risks}</div>
                )}
              </div>
            )}

            {data.financial_read && (data.financial_read.text || (data.financial_read.notes?.length ?? 0) > 0) && (
              <div className="rounded border border-slate-200 bg-white px-2 py-1.5 space-y-1">
                <div className="font-semibold text-slate-500">財務の読み</div>
                {data.financial_read.text && <p className="text-slate-700">{data.financial_read.text}</p>}
                {data.financial_read.notes && data.financial_read.notes.length > 0 && (
                  <ul className="ml-4 list-disc space-y-0.5 text-slate-500">
                    {data.financial_read.notes.map((n, i) => (
                      <li key={i}>{n}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {data.supply_demand && (data.supply_demand.text || (data.supply_demand.evidence_urls?.length ?? 0) > 0) && (
              <div className="rounded border border-slate-200 bg-white px-2 py-1.5 space-y-1">
                <div className="font-semibold text-slate-500">需給</div>
                {data.supply_demand.text && <p className="text-slate-700">{data.supply_demand.text}</p>}
                {data.supply_demand.evidence_urls && data.supply_demand.evidence_urls.length > 0 && (
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                    {data.supply_demand.evidence_urls.map((u, i) => (
                      <SourceLink key={i} href={u}>
                        根拠{i + 1}
                      </SourceLink>
                    ))}
                  </div>
                )}
              </div>
            )}

            {data.policy_context && (data.policy_context.text || (data.policy_context.evidence_urls?.length ?? 0) > 0) && (
              <div className="rounded border border-slate-200 bg-white px-2 py-1.5 space-y-1">
                <div className="font-semibold text-slate-500">政策文脈（判断材料・エッジの主張ではない）</div>
                {data.policy_context.text && <p className="text-slate-700">{data.policy_context.text}</p>}
                {data.policy_context.evidence_urls && data.policy_context.evidence_urls.length > 0 && (
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                    {data.policy_context.evidence_urls.map((u, i) => (
                      <SourceLink key={i} href={u}>
                        根拠{i + 1}
                      </SourceLink>
                    ))}
                  </div>
                )}
              </div>
            )}

            {data.web_findings && data.web_findings.length > 0 && (
              <div>
                <div className="mb-1 font-semibold text-slate-500">直近材料</div>
                <div className="space-y-1.5">
                  {data.web_findings.map((w, i) => (
                    <div key={i} className="rounded border border-slate-200 bg-white px-2 py-1.5">
                      <div className="text-slate-700">
                        {w.date && <span className="text-slate-400">{w.date} </span>}
                        {w.url ? <SourceLink href={w.url}>{w.title ?? "(記事)"}</SourceLink> : <span className="font-medium">{w.title}</span>}
                        {w.source && <span className="text-slate-400"> [{w.source}]</span>}
                      </div>
                      {w.takeaway && <div className="mt-0.5 text-slate-500">{w.takeaway}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.watch_points && data.watch_points.length > 0 && (
              <div>
                <div className="mb-1 font-semibold text-slate-500">今後の監視点</div>
                <ul className="ml-4 list-disc space-y-0.5 text-slate-600">
                  {data.watch_points.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {data.sources && data.sources.length > 0 && (
              <div>
                <div className="mb-1 font-semibold text-slate-500">出典</div>
                <ul className="ml-4 list-disc space-y-0.5 text-slate-600">
                  {data.sources.map((s, i) => (
                    <li key={i}>
                      <SourceLink href={s.url}>{s.title ?? s.url}</SourceLink>
                      {s.note && <span className="text-slate-400">（{s.note}）</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.attached_at && (
              <p className="text-[10px] text-slate-400">生成完了: {data.attached_at}</p>
            )}

            <button
              onClick={() => void start(true)}
              disabled={starting}
              className="rounded border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              {starting ? "起動中…" : "🔄 再生成（Opus・サブスク使用量を消費）"}
            </button>
            {actionError && <p className="text-rose-600">{actionError}</p>}
          </div>
        )}
      </div>
    </details>
  );
}
