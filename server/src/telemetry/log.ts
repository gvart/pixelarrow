/**
 * Structured logs for Workers Logs (wrangler.jsonc "observability"). One JSON
 * object per line: Workers Logs indexes its fields, so the dashboard can
 * filter on `$metadata.event = "unhandled"`, `scope`, `path`, `pid` and so on
 * (docs/OPS.md "Monitoring"). Never log tokens, initData or names.
 */
export type Level = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  [k: string]: string | number | boolean | null | undefined;
}

function errFields(err: unknown): LogFields {
  if (err instanceof Error) return { error: err.name, message: err.message.slice(0, 500), stack: err.stack?.split('\n').slice(0, 8).join('\n') };
  return { error: 'non-error', message: String(err).slice(0, 500) };
}

export function log(level: Level, event: string, fields: LogFields = {}, err?: unknown): void {
  const line = JSON.stringify({ level, event, ...fields, ...(err === undefined ? {} : errFields(err)) });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/** An unexpected error in a scope ("http", "do.region", "cron", ...). */
export function logError(scope: string, err: unknown, fields: LogFields = {}): void {
  log('error', 'unhandled', { scope, ...fields }, err);
}
