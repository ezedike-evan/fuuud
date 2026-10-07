import { hasPending } from "@/lib/oauth/pending.ts";
import { json } from "@/lib/oauth/http.ts";

export const dynamic = "force-dynamic";

/** Whether a connection request is waiting. Sign-in and setup use it to decide where to land. */
export async function GET() {
  return json({ pending: await hasPending() });
}
