import type { Context } from 'hono';
import type { z } from 'zod';
import { ApiError, badRequest } from './errors';

/** Reads a JSON body with a byte cap and validates it with a zod schema. */
export async function readJson<S extends z.ZodType>(c: Context, schema: S, maxBytes: number): Promise<z.infer<S>> {
  const declared = Number(c.req.header('content-length') ?? '0');
  if (declared > maxBytes) throw new ApiError(413, 'too_large', `Body larger than ${maxBytes} bytes`);
  const text = await c.req.text();
  if (new TextEncoder().encode(text).length > maxBytes) throw new ApiError(413, 'too_large', `Body larger than ${maxBytes} bytes`);
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw badRequest('Body is not valid JSON');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw badRequest('Invalid request body', {
      issues: parsed.error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
  }
  return parsed.data;
}
