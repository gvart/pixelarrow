// PBKDF2 probe Worker (V6-ACCT-01). Local measurement only: this run never deploys.
// The owner may deploy it to a throwaway Worker to read real cpu_ms (docs/v6/OWNER_ACTIONS.md),
// then delete it. It has no bindings and no secrets, and it stores nothing.
//
// GET /hash?iter=<n>  runs one ADR-0008 §2 hash (HMAC-SHA256 pepper step, then PBKDF2-SHA256,
//                     16-byte salt, 32-byte output) and answers {ok, iter} or {ok:false, error}.

const enc = new TextEncoder();
const PROBE_PEPPER = enc.encode('probe-pepper-not-a-secret-0123456789');

export async function hashOnce(iterations: number): Promise<ArrayBuffer> {
  const pepperKey = await crypto.subtle.importKey('raw', PROBE_PEPPER, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const peppered = await crypto.subtle.sign('HMAC', pepperKey, enc.encode('correct horse battery staple'));
  const baseKey = await crypto.subtle.importKey('raw', peppered, 'PBKDF2', false, ['deriveBits']);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, baseKey, 256);
}

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== '/hash') return new Response('not found', { status: 404 });
    const iter = Number(url.searchParams.get('iter'));
    if (!Number.isInteger(iter) || iter < 1) return Response.json({ ok: false, error: 'bad iter' }, { status: 400 });
    try {
      const dk = await hashOnce(iter);
      return Response.json({ ok: true, iter, bytes: dk.byteLength });
    } catch (e) {
      return Response.json({ ok: false, iter, error: `${(e as Error).name}: ${(e as Error).message}` }, { status: 422 });
    }
  },
};
