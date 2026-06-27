import { readChart } from "@/app/lib/charts";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: RouteContext<"/api/price/[code]">) {
  const { code } = await ctx.params;
  const data = await readChart(code);
  if (!data || data.candles.length === 0) {
    return Response.json(null, { status: 404 });
  }
  const last = data.candles[data.candles.length - 1];
  return Response.json({ price: last.close, date: last.time });
}
