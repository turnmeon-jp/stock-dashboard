import { readActionQueue } from "@/app/lib/actionQueue";

// リクエスト毎にファイルを読み直す（日次更新を即反映）。
export const dynamic = "force-dynamic";

export async function GET() {
  const data = await readActionQueue();
  return Response.json(data, { status: data.ok ? 200 : 500 });
}
