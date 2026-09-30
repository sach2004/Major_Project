import { NextResponse } from "next/server";
import { ensurePragmas } from "./db";

export type Ctx = { params: Promise<{ id: string }> };

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Wrap a route handler with error handling + SQLite pragmas. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      await ensurePragmas();
      return await fn(...args);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[api]", msg);
      const status = /not found|No .* found|RecordNotFound/i.test(msg) ? 404 : 500;
      return fail(msg, status);
    }
  };
}

export async function body<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    return {} as T;
  }
}
