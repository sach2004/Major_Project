import { json, route, type Ctx } from "@/lib/api";
import { getInsights } from "@/lib/insights";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return json(await getInsights(id));
});
