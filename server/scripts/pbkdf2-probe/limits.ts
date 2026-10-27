// The PBKDF2-SHA256 range measured by the V6-ACCT-01 spike (docs/v6/qa/PBKDF2_SPIKE.md).
// server/test/pbkdf2-spike.test.ts holds the accounts code (PBKDF2_ITERATIONS in
// server/src/auth/password.ts, V6-ACCT-03) and ADR-0008 §2 / M-PW-1 to these numbers.

/** V6-014 floor. */
export const PBKDF2_SAFE_MIN = 100_000;
/** Workers' WebCrypto refuses PBKDF2 above 100k iterations (NotSupportedError), below the 310k the 60 ms CPU ceiling would allow. */
export const PBKDF2_SAFE_MAX = 100_000;
/** The value ADR-0008 §2 and M-PW-1 adopt. */
export const PBKDF2_CHOSEN = 100_000;
