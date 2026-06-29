import { promises as fs } from "node:fs";
import path from "node:path";
import type { ExitMonitorData } from "@/app/lib/types";

export const dynamic = "force-dynamic";

const EXIT_PATH = path.join(process.cwd(), "..", "output", "exit_monitor.json");

const EMPTY: ExitMonitorData = {
  updated: "",
  regime: "",
  holdings: [],
  watchlist: [],
  theme_concentration: {},
};

export async function GET() {
  let raw: string;
  try {
    raw = await fs.readFile(EXIT_PATH, "utf-8");
  } catch {
    return Response.json(EMPTY, { status: 200 });
  }

  try {
    const data = JSON.parse(raw) as ExitMonitorData;
    return Response.json(data, { status: 200 });
  } catch {
    return Response.json(EMPTY, { status: 500 });
  }
}
