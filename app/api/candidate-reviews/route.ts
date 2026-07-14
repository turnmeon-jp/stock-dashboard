import { promises as fs } from "node:fs";
import path from "node:path";
import type { CandidateReviewsData, CandidateReviewsResponse } from "@/app/lib/types";

// リクエスト毎にファイルを読み直す（日次更新を即反映。exit-monitor/route.ts と同じ方針）。
export const dynamic = "force-dynamic";

const DATA_PATH = path.join(process.cwd(), "..", "output", "candidate_reviews.json");

const NOT_FOUND: CandidateReviewsResponse = { exists: false, data: null };

export async function GET() {
  let raw: string;
  try {
    raw = await fs.readFile(DATA_PATH, "utf-8");
  } catch {
    // 夜バッチ未実行でファイル自体が無い状態。「0件」とは区別してフロント側でバッジ非表示にする。
    return Response.json(NOT_FOUND, { status: 200 });
  }

  try {
    const data = JSON.parse(raw) as CandidateReviewsData;
    return Response.json({ exists: true, data } as CandidateReviewsResponse, { status: 200 });
  } catch {
    return Response.json(NOT_FOUND, { status: 500 });
  }
}
