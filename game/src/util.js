// Seeded random numbers and small numeric helpers for Skyline Courier.
// Every random choice in the game flows from these functions so a seed
// reproduces the exact same course, clouds and terrain.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function nextRandom() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// A tiny 1D value-noise field: a few octaves of interpolated random points.
// Used for mountain height, field colour patches and cloud placement.
export function makeNoise1D(seed, points, octaves) {
  const rand = mulberry32(seed);
  const layers = [];
  for (let o = 0; o < octaves; o++) {
    const count = points * (o + 1);
    const values = new Float32Array(count + 1);
    for (let i = 0; i <= count; i++) values[i] = rand();
    layers.push({ count, values, amp: 1 / (o + 1) });
  }
  return function noiseAt(x) {
    let sum = 0;
    let ampSum = 0;
    for (const layer of layers) {
      const pos = x * layer.count;
      const i = Math.floor(pos);
      const frac = pos - i;
      const a = layer.values[i % layer.count];
      const b = layer.values[(i + 1) % layer.count];
      const s = frac * frac * (3 - 2 * frac);
      sum += (a + (b - a) * s) * layer.amp;
      ampSum += layer.amp;
    }
    return sum / ampSum;
  };
}

export function formatHeading(radians) {
  const degrees = ((radians * 180) / Math.PI % 360 + 360) % 360;
  return Math.round(degrees);
}

export function formatAltitude(metres) {
  return Math.max(0, Math.round(metres));
}

export function formatSpeed(knots) {
  return Math.max(0, Math.round(knots));
}
