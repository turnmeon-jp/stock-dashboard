import { readChart } from "@/app/lib/charts";

// 個別銘柄のチャートデータ。リクエスト毎に読み直す。
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/charts/[code]">) {
  const { code } = await ctx.params;
  const data = await readChart(code);
  if (!data) {
    return Response.json({ message: "チャートデータが見つかりません。" }, { status: 404 });
  }
  return Response.json(data);
}
