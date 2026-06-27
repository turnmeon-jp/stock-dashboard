import { promises as fs } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

const POSTMORTEM_PATH = path.join(process.cwd(), "..", "output", "paper_postmortem.json");

export async function GET() {
  try {
    const raw = await fs.readFile(POSTMORTEM_PATH, "utf-8");
    return Response.json(JSON.parse(raw), { status: 200 });
  } catch {
    return Response.json(null, { status: 200 });
  }
}
