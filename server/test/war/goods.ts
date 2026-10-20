/** M6e test helpers: a player's home strongroom goods (war_goods `sr:<pid>`). */
import { env } from 'cloudflare:test';

const DB = () => env.DB!;

/** The amount of `res` in the player's home strongroom. */
export async function good(pid: number, res: string): Promise<number> {
  const r = await DB().prepare('SELECT SUM(amount) AS n FROM war_goods WHERE place = ?1 AND res = ?2').bind(`sr:${pid}`, res).first<{ n: number | null }>();
  return Math.round((r?.n ?? 0) * 1000) / 1000;
}

/** Set the amount of `res` in the player's home strongroom (one home lot). */
export async function setGood(pid: number, res: string, n: number): Promise<void> {
  await DB().batch([
    DB().prepare('DELETE FROM war_goods WHERE place = ?1 AND res = ?2').bind(`sr:${pid}`, res),
    DB().prepare("INSERT INTO war_goods (place, res, origin, seal, amount) VALUES (?1, ?2, 'home', 0, ?3)").bind(`sr:${pid}`, res, n),
  ]);
}
