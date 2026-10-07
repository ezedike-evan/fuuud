import { getOwnerAddress, inScope } from "@/lib/session.ts";
import { namespaceOfKind, writeStatus } from "@/lib/memory-core.ts";
import { describeMemoryFailure } from "@/lib/memory-errors.ts";

export const dynamic = "force-dynamic";


/**
 * Where a write the relayer accepted has got to: pending | running | uploaded | done | failed | not_found.
 * The namespace is derived from the signed-in person and the fact kind, never from the
 * request, so a job id from someone else's account cannot be probed through here.
 */
async function getHandler(req: Request) {
  const address = await getOwnerAddress();
  if (!address) return new Response("Not signed in", { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const kind = url.searchParams.get("kind") ?? "";
  const namespace = namespaceOfKind(kind, address);
  if (!/^[\w-]{1,128}$/.test(id) || !namespace) return new Response("Bad request", { status: 400 });

  try {
    const { state, error } = await writeStatus(namespace, id);
    return Response.json({ state, error: error ?? null }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const failure = describeMemoryFailure(error);
    return Response.json({ state: "unknown", error: failure.message }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}

export const GET = (req: Request) => inScope(() => getHandler(req));
