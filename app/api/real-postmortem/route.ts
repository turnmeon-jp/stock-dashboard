import { promises as fs } from "node:fs";
import path from "node:path";
import type { RealPostmortemData } from "@/app/lib/types";

export const dynamic = "force-dynamic";

const POSTMORTEM_PATH = path.join(process.cwd(), "..", "output", "real_postmortem.json");

const EMPTY: RealPostmortemData = {
  generated_at: "",
  trades: [],
  summary: {
    n: 0,
    win_rate: null,
    avg_win_pct: null,
    avg_loss_pct: null,
    payoff_ratio: null,
    median_holding_days: null,
    total_pl_yen: 0,
    breach_trades: 0,
  },
};

export async function GET() {
  let raw: string;
  try {
    raw = await fs.readFile(POSTMORTEM_PATH, "utf-8");
  } catch {
    return Response.json(EMPTY, { status: 200 });
  }

  try {
    const data = JSON.parse(raw) as RealPostmortemData;
    return Response.json(data, { status: 200 });
  } catch {
    return Response.json(EMPTY, { status: 500 });
  }
}
