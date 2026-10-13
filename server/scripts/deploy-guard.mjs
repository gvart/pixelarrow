/**
 * Deploy-time guard (ADR-0008 Implementation Guidelines, N-SE-4): the local
 * dev switches must never reach production. DEV_AUTH=1 accepts a fake
 * Telegram user and lets localhost pass Turnstile; DEV_EMAIL=1 writes mail to
 * D1 instead of sending it. Both live only in the gitignored .dev.vars (which
 * `wrangler deploy` never uploads); this refuses a config that sets either as
 * a var, at the top level or in any named environment.
 *
 * Pure (no Node APIs) so the workerd tests import it: server/test/deploy-guard.test.ts.
 */

/** Names that must never be deployed as vars. */
export const DEV_ONLY_VARS = ['DEV_AUTH', 'DEV_EMAIL'];

/**
 * The dev-only vars a parsed wrangler config sets, as `path.NAME` strings
 * (`vars.DEV_AUTH`, `env.staging.vars.DEV_EMAIL`); empty when the config is safe.
 * @param {{ vars?: Record<string, unknown>, env?: Record<string, { vars?: Record<string, unknown> }> }} config
 * @returns {string[]}
 */
export function devVarsIn(config) {
  const found = [];
  const scan = (vars, path) => {
    if (!vars || typeof vars !== 'object') return;
    for (const name of DEV_ONLY_VARS) if (Object.hasOwn(vars, name)) found.push(`${path}.${name}`);
  };
  scan(config.vars, 'vars');
  for (const [envName, envConfig] of Object.entries(config.env ?? {})) scan(envConfig?.vars, `env.${envName}.vars`);
  return found;
}
