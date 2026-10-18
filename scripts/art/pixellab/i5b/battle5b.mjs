// I5b: a real battle with the I5b classes in the player's army: the campaign heroes' classes are set to the given
// classes in turn, a fresh battle is started through the real Battle scene, and the deployment and the fight are
// screenshotted. Usage: node scripts/art/pixellab/i5b/battle5b.mjs <out dir> [baseUrl] [--classes a,b,...]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch, until, openGame, settled, startScene, tapId } from '../../../regression/lib.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const [out, base = 'http://localhost:5291/'] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const classes = opt('classes', 'rhomphaia,celt_sword,archer,falx,gallic,slinger,fanatic').split(',');
mkdirSync(out, { recursive: true });
const browser = await launch();
const { page, api, ok, errors } = await openGame(browser, base);
if (!ok) throw new Error('the game did not boot');
await api.ev((cls) => {
  const hs = window.__state.campaign.data.heroes;
  hs.forEach((h, i) => { h.cls = cls[i % cls.length]; h.wound = 0; h.reserve = false; });
  window.__state.pending = null;
}, classes);
await startScene(api, 'Battle', { fresh: true });
await until(async () => (await settled(api, 'Battle', 1000)) && (await api.call('Battle', 'return !!s.sim && !!s.hud;')), 30000, 200);
await page.waitForTimeout(1500);
await page.screenshot({ path: join(out, 'battle_deploy.png') });
await tapId(api, 'Battle', 'battle.fight');
await page.waitForTimeout(800);
await tapId(api, 'Battle', 'battle.play');
for (const t of [3, 6, 10]) {
  await page.waitForTimeout(t === 3 ? 3000 : (t === 6 ? 3000 : 4000));
  await page.screenshot({ path: join(out, `battle_fight_${t}s.png`) });
}
console.log(await api.ev(() => window.__state.campaign.data.heroes.map((h) => h.cls).join(',')));
console.log(errors.length ? errors.join('\n') : 'no console errors');
await browser.close();
