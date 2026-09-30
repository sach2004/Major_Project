import { body, fail, json, route } from "@/lib/api";
import { testProvider, type Provider } from "@/lib/llm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = route(async (req: Request) => {
  const b = await body<{ provider?: Provider }>(req);
  if (b.provider !== "openai" && b.provider !== "gemini") return fail("provider must be openai or gemini");
  return json(await testProvider(b.provider));
});
