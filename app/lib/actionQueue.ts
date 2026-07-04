import { promises as fs } from "node:fs";
import path from "node:path";

// 今日のアクション（バックエンドで並行実装中。output/action_queue.json が
// 生成される前提。未生成の間はパネル自体を出さない = exists:false で判別する）。
const ACTION_QUEUE_PATH = path.join(process.cwd(), "..", "output", "action_queue.json");

export interface ActionQueueItem {
  priority: number;
  icon: string;
  kind: string;
  code: string;
  name: string;
  text: string;
  tab: string;
  date: string | null;
}

export interface ActionQueueResponse {
  ok: boolean;
  // false = action_queue.json が存在しない（バックエンド未生成 or 解析失敗）。
  // フロントは exists:false の間はパネルを一切描画しない。
  exists: boolean;
  generated_at: string | null;
  as_of: string | null;
  items: ActionQueueItem[];
}

function empty(ok: boolean): ActionQueueResponse {
  return { ok, exists: false, generated_at: null, as_of: null, items: [] };
}

export async function readActionQueue(): Promise<ActionQueueResponse> {
  let raw: string;
  try {
    raw = await fs.readFile(ACTION_QUEUE_PATH, "utf-8");
  } catch {
    return empty(true); // 未生成はエラーではない（並行実装中）
  }
  let data: Partial<ActionQueueResponse>;
  try {
    data = JSON.parse(raw) as Partial<ActionQueueResponse>;
  } catch {
    return empty(false);
  }
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    ok: true,
    exists: true,
    generated_at: data.generated_at ?? null,
    as_of: data.as_of ?? null,
    items: [...items].sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999)),
  };
}
