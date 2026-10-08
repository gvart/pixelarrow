/**
 * Every error response has the same shape:
 *   { "error": { "code": "save_conflict", "message": "...", ...extra } }
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

export function errorBody(code: string, message: string, extra: Record<string, unknown> = {}) {
  return { error: { code, message, ...extra } };
}

export function errorResponse(status: number, code: string, message: string, extra: Record<string, unknown> = {}): Response {
  return Response.json(errorBody(code, message, extra), { status });
}

export const badRequest = (message: string, extra?: Record<string, unknown>) => new ApiError(400, 'bad_request', message, extra);
export const unauthorized = (message = 'Missing or invalid session token') => new ApiError(401, 'unauthorized', message);
export const notConfigured = (what: string) => new ApiError(503, 'not_configured', `${what} not configured`);
