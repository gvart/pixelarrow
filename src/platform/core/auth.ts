/** Platform facts for signing in; Online (src/platform/online.ts) does the network. */
export type AuthMethod = 'telegram' | 'password';
export type AuthProof = { kind: 'telegram'; initData: string };

export interface Auth {
  /** How the API carries the session (ADR-0007): a bearer token or a same-origin cookie. */
  readonly transport: 'bearer' | 'cookie';
  methods(): AuthMethod[];
  /** Proof the platform signs for us (Telegram initData), or null. */
  silentProof(): AuthProof | null;
}
