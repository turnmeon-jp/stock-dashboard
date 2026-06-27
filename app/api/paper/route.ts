import { promises as fs } from "node:fs";
import path from "node:path";
import type { PaperPositionsData } from "@/app/lib/types";

export const dynamic = "force-dynamic";

const PAPER_PATH = path.join(process.cwd(), "..", "output", "paper_positions.json");

const EMPTY: PaperPositionsData = {
  positions: [],
  closed: [],
  equity: 0,
  started_at: "",
};

export async function GET() {
  let raw: string;
  try {
    raw = await fs.readFile(PAPER_PATH, "utf-8");
  } catch {
    return Response.json(EMPTY, { status: 200 });
  }

  try {
    const data = JSON.parse(raw) as PaperPositionsData;
    return Response.json(data, { status: 200 });
  } catch {
    return Response.json(EMPTY, { status: 500 });
  }
}
