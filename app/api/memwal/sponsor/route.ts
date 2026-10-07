import { proxySponsor } from "@/lib/sponsor-proxy.ts";
export const POST = (req: Request) => proxySponsor(req, "/sponsor");
