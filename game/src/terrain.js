// Course generation for Skyline Courier: the valley the pilot flies through.
// A course is a chain of segments along +z. Each segment carries the terrain
// height, the valley curve, the ground paint (fields, forest, river, runway),
// the trees beside the track and, for ring missions, the target rings.
// Everything is derived from the seed, so the same seed always builds the
// same valley.
import { clamp, lerp, makeNoise1D, mulberry32 } from './util.js';

export const SEGMENT_LENGTH = 25; // metres of course per segment
export const VALLEY_HALF_WIDTH = 340; // metres of ground drawn either side

export const MISSIONS = [
  {
    id: 'ring-run',
    name: 'Ring Run',
    blurb: 'Thread 8 rings over the valley, then put her down on the strip.',
    rings: 8,
    fuel: 100,
    wind: 2,
    ceiling: 520,
    ringSpacing: 34,
    ringSpread: 90,
  },
  {
    id: 'canyon-dash',
    name: 'Canyon Dash',
    blurb: 'Low and fast through the canyon. Ten rings, little room to climb.',
    rings: 10,
    fuel: 100,
    wind: 5,
    ceiling: 300,
    ringSpacing: 26,
    ringSpread: 70,
  },
  {
    id: 'storm-landing',
    name: 'Storm Landing',
    blurb: 'Crosswind, half a tank, one runway. Land it clean.',
    rings: 3,
    fuel: 55,
    wind: 14,
    ceiling: 460,
    ringSpacing: 40,
    ringSpread: 110,
  },
];

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) || MISSIONS[0];
}

// Ground paint kinds, used by the renderer to colour each segment.
export const GROUND = {
  FIELD_LIGHT: 0,
  FIELD_DARK: 1,
  FOREST: 2,
  RIVER: 3,
  RUNWAY: 4,
  APRON: 5,
};

export function buildCourse(seed, missionId) {
  const mission = missionById(missionId);
  const rand = mulberry32(seed * 7919 + 13);
  const heightNoise = makeNoise1D(seed + 101, 24, 3);
  const paintNoise = makeNoise1D(seed + 202, 40, 2);
  const curveNoise = makeNoise1D(seed + 303, 10, 2);

  const ringCount = mission.rings;
  const runwayStart = 240 + ringCount * mission.ringSpacing + 30;
  const segmentCount = runwayStart + 60;
  const segments = [];
  let curve = 0;
  let curveAccum = 0;

  for (let i = 0; i < segmentCount; i++) {
    const z = i * SEGMENT_LENGTH;
    // Valley curve: gentle S-bends, stronger in the canyon mission.
    const target = (curveNoise(i / 90) - 0.5) * (mission.id === 'canyon-dash' ? 5.2 : 3.4);
    curve = lerp(curve, target, 0.02);
    curveAccum += curve * 0.9;

    // Terrain height: rolling hills, rising into mountains far out.
    const hill = (heightNoise(i / 55) - 0.5) * 90;
    const rise = smoothstep(0.55, 1, i / segmentCount) * 160;
    const height = 40 + hill + rise;

    // Ground paint: patchwork fields, forest bands, one river crossing.
    let ground = GROUND.FIELD_LIGHT;
    const paint = paintNoise(i / 14);
    if (paint > 0.62) ground = GROUND.FIELD_DARK;
    else if (paint < 0.22) ground = GROUND.FOREST;
    const riverAt = Math.floor(segmentCount * 0.42);
    if (Math.abs(i - riverAt) <= 2) ground = GROUND.RIVER;
    if (i >= runwayStart) ground = i < runwayStart + 8 ? GROUND.RUNWAY : GROUND.APRON;

    // Trees beside the track, deterministic per segment.
    const trees = [];
    if (ground === GROUND.FOREST || rand() < 0.28) {
      const treeCount = ground === GROUND.FOREST ? 3 + Math.floor(rand() * 3) : 1;
      for (let t = 0; t < treeCount; t++) {
        const side = rand() < 0.5 ? -1 : 1;
        trees.push({
          offset: side * (150 + rand() * 260),
          size: 0.7 + rand() * 1.1,
          kind: rand() < 0.6 ? 'pine' : 'round',
        });
      }
    }

    segments.push({
      index: i,
      z,
      curve,
      curveAccum,
      height,
      ground,
      trees,
      ring: null,
    });
  }

  // Rings: spaced along the course, alternating sides and heights so the
  // pilot has to climb, dive and bank to thread them.
  const rings = [];
  for (let r = 0; r < ringCount; r++) {
    const segIndex = 26 + r * mission.ringSpacing + Math.floor(rand() * 6);
    const seg = segments[segIndex];
    const ring = {
      id: r + 1,
      segmentIndex: segIndex,
      x: (rand() - 0.5) * 2 * mission.ringSpread,
      agl: 55 + rand() * (mission.ceiling - 160),
      radius: 26,
      passed: false,
      missed: false,
    };
    seg.ring = ring;
    rings.push(ring);
  }

  // Clouds: billboard positions in world space, drifting slowly.
  const clouds = [];
  for (let c = 0; c < 26; c++) {
    clouds.push({
      z: rand() * segmentCount * SEGMENT_LENGTH,
      x: (rand() - 0.5) * 2400,
      y: 260 + rand() * 260,
      scale: 130 + rand() * 220,
      speed: 2 + rand() * 4,
    });
  }

  // Distant mountain silhouettes: ridge lines drawn behind the terrain.
  const ridges = [];
  for (let layer = 0; layer < 3; layer++) {
    const ridgeNoise = makeNoise1D(seed + 500 + layer * 77, 12 + layer * 6, 2);
    ridges.push({ noise: ridgeNoise, depth: layer, base: 0.30 + layer * 0.10 });
  }

  return {
    seed,
    mission,
    segments,
    rings,
    clouds,
    ridges,
    runwayStartIndex: runwayStart,
    runwayZ: runwayStart * SEGMENT_LENGTH,
    courseLength: segmentCount * SEGMENT_LENGTH,
    finishZ: (runwayStart + 40) * SEGMENT_LENGTH,
  };
}

function smoothstep(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

// Interpolated terrain height at any z along the course.
export function terrainHeightAt(course, z) {
  const f = clamp(z / SEGMENT_LENGTH, 0, course.segments.length - 1.001);
  const i = Math.floor(f);
  const frac = f - i;
  const a = course.segments[i].height;
  const b = course.segments[Math.min(i + 1, course.segments.length - 1)].height;
  return lerp(a, b, frac);
}

// Lateral valley centre (the curve) at any z.
export function valleyCentreAt(course, z) {
  const f = clamp(z / SEGMENT_LENGTH, 0, course.segments.length - 1.001);
  const i = Math.floor(f);
  const frac = f - i;
  const a = course.segments[i].curveAccum;
  const b = course.segments[Math.min(i + 1, course.segments.length - 1)].curveAccum;
  return lerp(a, b, frac);
}

export function segmentAt(course, z) {
  const i = clamp(Math.floor(z / SEGMENT_LENGTH), 0, course.segments.length - 1);
  return course.segments[i];
}

export function isOverRunway(course, z) {
  return z >= course.runwayZ && z <= course.runwayZ + 8 * SEGMENT_LENGTH;
}
