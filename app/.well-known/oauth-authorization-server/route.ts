import { metadata, notConfigured } from "@/lib/oauth/http.ts";
import { authorizationServerMetadata } from "@/lib/oauth/metadata.ts";

export const dynamic = "force-dynamic";

export const GET = () => notConfigured() ?? metadata(authorizationServerMetadata());
