// GET /api/demo/status: whether the demo provider can reply now, its public address, and exactly why
// not when it cannot ("no key set", or "the key set is not a 0x private key of 64 hex characters").
// The key itself is never echoed.

import { demoStatusNow } from "@/lib/demo-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(demoStatusNow(), { headers: { "cache-control": "no-store" } });
}
