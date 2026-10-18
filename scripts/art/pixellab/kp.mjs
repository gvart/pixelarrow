// Print a rig.mjs keypoints file as the two compact JSON arrays animate_with_skeleton_v3 takes
// (first_frame_keypoints, then keypoints), one per line, ready to paste into the MCP call.
// Usage: node scripts/art/pixellab/kp.mjs <keypoints.json>
import { readFileSync } from 'node:fs';

const d = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const s = (k) => k.map((p) => ({ label: p.label, x: p.x, y: p.y, z_index: p.z_index }));
console.log(JSON.stringify(s(d.first_frame_keypoints)));
console.log(JSON.stringify(d.keypoints.map(s)));
