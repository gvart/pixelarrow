/** Registers procedurally generated textures with Phaser on demand. */
import Phaser from 'phaser';
import { FH, FW, NFRAMES, dollKey, renderSheet, type DollSpec } from '../art/paperdoll';
import { itemIconKey, renderItemIcon } from '../art/itemIcons';
import { renderBlood, renderRing, renderShadow } from '../art/ground';
import { Pix } from '../art/pixels';
import { P } from '../art/palette';
import type { Item } from '../data/items';

export function ensureDoll(scene: Phaser.Scene, spec: DollSpec): string {
  const key = dollKey(spec);
  if (scene.textures.exists(key)) return key;
  const tex = scene.textures.addCanvas(key, renderSheet(spec).toCanvas())!;
  for (let dir = 0; dir < 2; dir++) {
    for (let f = 0; f < NFRAMES; f++) tex.add(dir * NFRAMES + f, 0, f * FW, dir * FH, FW, FH);
  }
  return key;
}

export function dollFrame(dir: number, f: number): number {
  return dir * NFRAMES + f;
}

export function ensureItemIcon(scene: Phaser.Scene, item: Item): string {
  const key = itemIconKey(item);
  if (!scene.textures.exists(key)) scene.textures.addCanvas(key, renderItemIcon(item).toCanvas());
  return key;
}

export function registerMisc(scene: Phaser.Scene): void {
  if (scene.textures.exists('shadow')) return;
  scene.textures.addCanvas('shadow', renderShadow().toCanvas());
  for (let i = 0; i < 4; i++) scene.textures.addCanvas(`blood${i}`, renderBlood(i).toCanvas());
  scene.textures.addCanvas('ring_sel', renderRing(0xf6ecd8).toCanvas());
  scene.textures.addCanvas('ring_one', renderRing(P.gold).toCanvas());
  scene.textures.addCanvas('ring_enemy', renderRing(0xc04a3a).toCanvas());
  // routing flag
  const flag = new Pix(5, 7);
  flag.vline(0, 0, 6, P.wood[2]);
  flag.rect(1, 0, 4, 3, 0xf6ecd8);
  flag.set(4, 2, 0xd8ccb4);
  scene.textures.addCanvas('flag_white', flag.toCanvas());
  // block spark
  const sp = new Pix(5, 5);
  sp.set(2, 0, 0xfff4c0);
  sp.set(2, 4, 0xfff4c0);
  sp.set(0, 2, 0xfff4c0);
  sp.set(4, 2, 0xfff4c0);
  sp.set(2, 2, 0xffffff);
  scene.textures.addCanvas('spark', sp.toCanvas());
  // 1x1 white pixel
  const w = new Pix(1, 1);
  w.set(0, 0, 0xffffff);
  scene.textures.addCanvas('px', w.toCanvas());
}
