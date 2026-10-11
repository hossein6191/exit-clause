// POST /api/demo/reply {request}: the demo provider sends its plan's scripted reply to a cancellation
// on one of its plans, while the request is open, inside its window and not yet replied to.
// Rate-limited per request and in total, one signature at a time; answers the transaction hash, or
// why not. Nothing here ever logs or returns the key.

import { sendDemoReply } from "@/lib/demo-server";
import { parseRequestId } from "@/lib/rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Two reads (retried while Studio is slow) and one signature: allow up to a minute.
export const maxDuration = 60;

const noStore = { "cache-control": "no-store" };

export async function POST(request: Request) {
  let id = "";
  try {
    const text = await request.text();
    if (text.length > 200) throw new Error("too long");
    const body = JSON.parse(text) as { request?: unknown };
    id = typeof body.request === "string" ? parseRequestId(body.request) : "";
  } catch {
    id = "";
  }
  if (!id) return Response.json({ ok: false, reason: 'send {"request": "R4"}' }, { status: 400, headers: noStore });
  const answer = await sendDemoReply(id);
  return Response.json(answer.body, { status: answer.status, headers: noStore });
}
