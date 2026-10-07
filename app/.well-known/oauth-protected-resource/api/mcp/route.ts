import { metadata, notConfigured } from "@/lib/oauth/http.ts";
import { protectedResourceMetadata } from "@/lib/oauth/metadata.ts";

export const dynamic = "force-dynamic";

// RFC 9728 path-suffixed form: some clients ask for /.well-known/oauth-protected-resource/<mcp path>.
export const GET = () => notConfigured() ?? metadata(protectedResourceMetadata());
