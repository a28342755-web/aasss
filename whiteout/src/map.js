// Alley map data. Units are meters, Y is up, north is -Z. All collision is axis-aligned boxes.
export const MAT = { NONE: 0, SNOW: 1, BRICK: 2, METAL: 3, WOOD: 4, CONCRETE: 5, GLASS: 6, FLESH: 7 };

// [x0, z0, x1, z1, height, style]  style: 0 cream brick, 1 pale tan, 2 red-brown, 3 weathered tan
// Rooftop-height blocks (all above the 3.9 m reachable from the crate stacks) so the skyline shows above them.
export const BUILDINGS = [
  [-16, -64, -3.5, -12, 9, 0],   // W1 (runs past the north fence for depth)
  [-16, -12, -3.5, 6, 6, 3],     // W2
  [-16, 12, -3.5, 42, 11, 1],    // W3
  [-32, -12, -16, 0, 5.5, 2],    // W4  yard north
  [-34, 0, -28, 20, 7, 0],       // W5  yard west
  [-32, 20, -16, 32, 6.5, 2],    // W6  yard south
  [3.5, -64, 16, -14, 8, 1],     // E1
  [3.5, -8, 16, 18, 12, 0],      // E2
  [3.5, 18, 16, 42, 6, 3],       // E3
  [16, -42, 34, -24, 9, 3],      // E4  court north
  [30, -24, 36, -2, 6, 1],       // E5  warehouse with loading dock
  [16, -2, 34, 18, 7, 2],        // E6  court south
  [-3.5, -66, 3.5, -64, 10, 2],  // N1  closes the view past the fence
];

// Props. rz: long axis along Z. Sizes live in propBoxes().
export const PROPS = [
  { t: 'dumpster', x: -2.78, z: -30, rz: 1 },
  { t: 'dumpster', x: 2.78, z: -3, rz: 1 },
  { t: 'dumpster', x: -2.78, z: 21, rz: 1 },
  { t: 'crate', x: 2.9, z: -23.9, s: 1 },
  { t: 'crate', x: 2.85, z: -25.05, s: 1, stack: 2 },
  { t: 'barrier', x: 1, z: 14 },
  { t: 'barrier', x: -1.5, z: -16 },
  { t: 'pallets', x: -2.9, z: -8 },
  { t: 'barrel', x: -3.0, z: 30.5 },
  { t: 'barrel', x: -2.3, z: 31.0 },
  { t: 'cabinet', x: 2.6, z: 8.4, rz: 1 },
  { t: 'cabinet', x: -17.4, z: 7.5, rz: 1 },
  { t: 'cabinet', x: 25.2, z: -18.5, rz: 1 },
  { t: 'crate', x: -10, z: 6.6, s: 1.1, stack: 2 },
  { t: 'car', x: -22.5, z: 4.5 },
  { t: 'wall', x0: -25, z0: 11.7, x1: -19, z1: 12.3, h: 1.05 },
  { t: 'dumpster', x: -27.4, z: 16, rz: 1 },
  { t: 'pallets', x: -18, z: 18.6 },
  { t: 'barrel', x: -17, z: 1 },
  { t: 'barrel', x: -17.7, z: 1.4 },
  { t: 'barrel', x: 8, z: -13.4 },
  { t: 'crate', x: 12, z: -8.6, s: 1 },
  { t: 'dock' },
  { t: 'van', x: 21, z: -19 },
  { t: 'crate', x: 18.5, z: -5, s: 1.1, stack: 2 },
  { t: 'crate', x: 22.5, z: -9, s: 1 },
  { t: 'pallets', x: 19.5, z: -14.5 },
  { t: 'barrier', x: 23.5, z: -3.5 },
  { t: 'fence', z: -38 },
  { t: 'gate', z: 38 },
];

const box = (x0, y0, z0, x1, y1, z1, mat) => ({ min: [x0, y0, z0], max: [x1, y1, z1], mat });

export function propBoxes(p) {
  const { x, z } = p;
  switch (p.t) {
    case 'dumpster': return p.rz ? [box(x - 0.55, 0, z - 0.95, x + 0.55, 1.25, z + 0.95, MAT.METAL)] : [box(x - 0.95, 0, z - 0.55, x + 0.95, 1.25, z + 0.55, MAT.METAL)];
    case 'crate': { const h = p.s * (p.stack || 1); return [box(x - p.s / 2, 0, z - p.s / 2, x + p.s / 2, h, z + p.s / 2, MAT.WOOD)]; }
    case 'barrier': return [box(x - 1.5, 0, z - 0.3, x + 1.5, 0.85, z + 0.3, MAT.CONCRETE)];
    case 'pallets': return [box(x - 0.5, 0, z - 0.6, x + 0.5, 0.55, z + 0.6, MAT.WOOD)];
    case 'barrel': return [box(x - 0.3, 0, z - 0.3, x + 0.3, 0.9, z + 0.3, MAT.METAL)];
    case 'cabinet': return p.rz ? [box(x - 0.5, 0, z - 0.8, x + 0.5, 1.25, z + 0.8, MAT.METAL)] : [box(x - 0.8, 0, z - 0.5, x + 0.8, 1.25, z + 0.5, MAT.METAL)];
    case 'car': return [box(x - 2.25, 0, z - 0.925, x + 2.25, 0.95, z + 0.925, MAT.METAL), box(x - 1.2, 0.95, z - 0.75, x + 1.3, 1.45, z + 0.75, MAT.GLASS)];
    case 'wall': return [box(p.x0, 0, p.z0, p.x1, p.h, p.z1, MAT.BRICK)];
    case 'dock': return [box(26.5, 0, -21, 30, 1.15, -5, MAT.CONCRETE), box(25.3, 0, -6.4, 26.5, 0.38, -5, MAT.CONCRETE), box(25.7, 0, -6.4, 26.5, 0.77, -5, MAT.CONCRETE)];
    case 'van': return [box(x - 1, 0, z - 2.6, x + 1, 2.3, z + 2.6, MAT.METAL)];
    case 'fence': return [box(-3.5, 0, z - 0.1, 3.5, 4.5, z + 0.1, MAT.METAL)];
    case 'gate': return [box(-3.5, 0, z, 3.5, 4.5, z + 0.3, MAT.METAL)];
  }
  return [];
}

export function collisionBoxes() {
  const out = BUILDINGS.map(([x0, z0, x1, z1, h]) => box(x0, 0, z0, x1, h, z1, MAT.BRICK));
  for (const p of PROPS) out.push(...propBoxes(p));
  return out;
}

// Wall lamps: position, facing normal (x,z). Neon signs carry a color.
export const LAMPS = [
  { p: [-3.42, 4.6, -26], n: [1, 0] },
  { p: [3.42, 4.6, -1], n: [-1, 0] },
  { p: [-3.42, 4.6, 24], n: [1, 0] },
  { p: [29.92, 4.8, -13], n: [-1, 0] },
  { p: [-27.92, 4.5, 9], n: [1, 0] },
];
export const NEON = [
  { p: [3.05, 6.6, 10], color: 0xff2f6d, text: 'HOTEL', vertical: true },
  { p: [-3.46, 3.05, -4], color: 0xff3b2f, text: 'BAR', n: [1, 0] },
];

// [x, y, z, yaw]  yaw 0 faces north (-Z), PI faces south, -PI/2 faces east, PI/2 faces west
export const SPAWNS = [
  [0, 0, -35, Math.PI], [0, 0, 35, 0], [-22, 0, 17.5, 0], [-26, 0, 2, -Math.PI / 2],
  [24, 0, -22.5, Math.PI], [28.2, 1.15, -13, Math.PI / 2], [19, 0, -3.2, 0], [12, 0, -11, Math.PI / 2],
  [-12, 0, 9, -Math.PI / 2], [1.5, 0, -20, Math.PI], [-1.2, 0, 27, 0], [1.6, 0, 6, 0],
];

// Bot navigation graph. Nodes are [x, z]; dock nodes stand on the 1.15 m platform.
export const NAV_NODES = [
  [0, -35], [0, -28], [0.5, -20], [1.8, -16], [0, -11], [0, -4], [0, 3], [-1, 9], [-2, 14], [0, 20], [0, 27], [0, 35],
  [7, -11], [13, -11], [18, -11], [18, -22.8], [24, -22.8], [24, -13], [21, -6], [24.8, -5.7], [27.6, -5.7], [28.2, -13], [28.2, -19.5],
  [-7, 9], [-13, 9.6], [-19, 9], [-19, 15.5], [-25, 17.5], [-26.6, 9], [-26.3, 2], [-19, 2],
];
export const NAV_EDGES = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11],
  [4, 12], [12, 13], [13, 14], [14, 15], [15, 16], [16, 17], [17, 14], [14, 18], [17, 19], [18, 19], [19, 20], [20, 21], [21, 22],
  [7, 23], [23, 24], [24, 25], [25, 26], [26, 27], [27, 28], [28, 29], [29, 30], [30, 25], [25, 28],
];

// Domination capture points.
export const ZONES = [{ id: 'A', x: -21.5, z: 8.5, r: 4.5 }, { id: 'B', x: 0, z: 4.5, r: 4.5 }, { id: 'C', x: 22, z: -12, r: 4.5 }];

export const BOT_NAMES = ['Volkov', 'Kestrel', 'Sable', 'Moose', 'Ghost', 'Rook', 'Hatch', 'Juno', 'Brick', 'Wren'];
export const botName = (id) => BOT_NAMES[(id - 1) % BOT_NAMES.length];
