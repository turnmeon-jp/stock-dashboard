import { readLedgerReport } from "@/app/lib/ledger";

// リクエスト毎にファイルを読み直す（候補台帳レポートの日次更新を即反映）。
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await readLedgerReport();
  return Response.json(data, { status: data.ok ? 200 : 500 });
}
