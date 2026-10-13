/**
 * The web session cookie (ADR-0007, ADR-0008 §3): host-only on play. The
 * `__Host-` prefix forbids `Domain=`, so it never reaches the landing site.
 */
import { LIFETIME } from './sessions';

export const SESSION_COOKIE = '__Host-pa_sid';
const MAX_AGE_SEC = LIFETIME.cookie.absolute / 1000;

/** `Set-Cookie` for a new cookie session. */
export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE_SEC}`;
}

/** `Set-Cookie` that removes the session cookie (log-out). */
export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Whether a `Cookie` header carries the session cookie at all (valid or not). */
export function hasSessionCookie(header: string | null | undefined): boolean {
  return readSessionCookie(header) !== null;
}

/** The session cookie's value from a `Cookie` header, else null. */
export function readSessionCookie(header: string | null | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE) return part.slice(eq + 1).trim();
  }
  return null;
}
