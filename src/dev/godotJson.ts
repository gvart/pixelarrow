/**
 * JSON for the Godot port with exact floats: Godot 4.7's JSON parser is not correctly rounded (measured: exact up to 13
 * significant digits, then wrong more and more often; 2 of the table constants came back an ulp off). So a number whose
 * shortest form has more than PLAIN_DIGITS significant digits is written as {"f64": "<16 hex digits, big-endian IEEE
 * 754>"} (so are Infinity and NaN, which plain JSON turns into null, and -0, which it writes as 0), and godot/src/data/game_data.gd `exact` turns it back. Integers and short decimals stay plain. Sets become
 * arrays and Maps objects.
 */
const PLAIN_DIGITS = 12;
const digits = (n: number) => String(Math.abs(n)).replace(/e.*$/, '').replace('.', '').replace(/^0+/, '').length;
const view = new DataView(new ArrayBuffer(8));
const hex = (n: number) => {
  view.setFloat64(0, n);
  return view.getUint32(0).toString(16).padStart(8, '0') + view.getUint32(4).toString(16).padStart(8, '0');
};

export function exactJson(value: unknown, onFunction?: (key: string) => void): string {
  return JSON.stringify(value, function (key, v) {
    if (typeof v === 'number') return !Object.is(v, -0) && (Number.isInteger(v) || (Number.isFinite(v) && digits(v) <= PLAIN_DIGITS)) ? v : { f64: hex(v) };
    if (v instanceof Set) return [...v];
    if (v instanceof Map) return Object.fromEntries(v);
    if (typeof v === 'function') { onFunction?.(key); return undefined; }
    return v;
  });
}
