import { promises as fs } from "node:fs";
import path from "node:path";
import type { PaperLogEntry } from "@/app/lib/types";

export const dynamic = "force-dynamic";

const LOG_PATH = path.join(process.cwd(), "..", "output", "paper_log.json");

export async function GET() {
  let raw: string;
  try {
    raw = await fs.readFile(LOG_PATH, "utf-8");
  } catch {
    return Response.json([] as PaperLogEntry[], { status: 200 });
  }

  try {
    const data = JSON.parse(raw) as PaperLogEntry[];
    return Response.json(data, { status: 200 });
  } catch {
    return Response.json([] as PaperLogEntry[], { status: 500 });
  }
}
