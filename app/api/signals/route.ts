import { readSignals } from "@/app/lib/signals";

// GET ハンドラはデフォルトで動的（リクエスト毎にファイルを読み直す）。
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await readSignals();
  return Response.json(data, { status: data.ok ? 200 : 500 });
}
