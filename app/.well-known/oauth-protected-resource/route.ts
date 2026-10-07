import { metadata, notConfigured } from "@/lib/oauth/http.ts";
import { protectedResourceMetadata } from "@/lib/oauth/metadata.ts";

export const dynamic = "force-dynamic";

export const GET = () => notConfigured() ?? metadata(protectedResourceMetadata());
