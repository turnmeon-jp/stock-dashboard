import { readChartIndex } from "@/app/lib/charts";

// チャート一覧（_index.json）。リクエスト毎に読み直す。
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await readChartIndex();
  return Response.json(data);
}
