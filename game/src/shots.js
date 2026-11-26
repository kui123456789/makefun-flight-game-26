// Deterministic screenshot scenes for Skyline Courier.
// ?shot=start|play|rings|landing&seed=N sets up a fixed scene so a
// screenshot taken in a headless browser reproduces exactly: the title
// screen, a mid-flight chase through the valley, a ring filling the frame,
// and the final approach to the runway. The game loop keeps rendering but
// the flight state is frozen, so the frame is stable.
import { buildCourse } from './terrain.js';
import { createPlane } from './physics.js';

export const SHOT_SCENES = ['start', 'play', 'rings', 'landing'];

export function parseShotParams(search) {
  const params = new URLSearchParams(search || '');
  const shot = params.get('shot');
  if (!SHOT_SCENES.includes(shot)) return null;
  const seed = Number(params.get('seed') || '20261126');
  return { shot, seed: Number.isFinite(seed) ? seed : 20261126 };
}

// Build the frozen state for one screenshot scene. Returns
// { course, plane, mode } where mode is 'title' for the start scene and
// 'flying' otherwise.
export function buildShotScene(shot, seed) {
  const course = buildCourse(seed, 'ring-run');
  const plane = createPlane(course);
  plane.state = 'flying';
  plane.throttle = 0.72;
  plane.speed = 78;

  if (shot === 'start') {
    plane.state = 'ready';
    plane.z = 0;
    plane.x = 0;
    plane.agl = 130;
    plane.speed = 0;
    plane.throttle = 0;
    return { course, plane, mode: 'title' };
  }

  if (shot === 'play') {
    // Mid-flight: three rings already passed, the next one ahead, fields
    // and river below, mountains on the horizon.
    plane.z = 3 * 34 * 25 + 12 * 25;
    plane.x = -28;
    plane.agl = 150;
    plane.pitch = 0.05;
    plane.bank = -0.18;
    plane.heading = 0.06;
    plane.score = 1150;
    plane.ringsPassed = 3;
    plane.nextRingIndex = 3;
    for (let i = 0; i < 3; i++) course.rings[i].passed = true;
    plane.fuel = 71;
    plane.damage = 4;
    return { course, plane, mode: 'flying' };
  }

  if (shot === 'rings') {
    // Right on a ring: the next gate fills the frame, runway beacon far off.
    const ring = course.rings[3];
    plane.z = ring.segmentIndex * 25 - 190;
    plane.x = ring.x * 0.6;
    plane.agl = ring.agl - 18;
    plane.pitch = -0.02;
    plane.bank = 0.22;
    plane.heading = -0.05;
    plane.score = 980;
    plane.ringsPassed = 3;
    plane.nextRingIndex = 3;
    for (let i = 0; i < 3; i++) course.rings[i].passed = true;
    plane.fuel = 74;
    plane.damage = 0;
    return { course, plane, mode: 'flying' };
  }

  // landing: on final approach, gear down in spirit — low, slow, lined up
  // with the strip, approach lights ahead.
  plane.z = course.runwayZ - 350;
  plane.x = 6;
  plane.agl = 48;
  plane.pitch = -0.08;
  plane.bank = 0.02;
  plane.heading = 0.01;
  plane.speed = 58;
  plane.throttle = 0.42;
  plane.score = 3420;
  plane.ringsPassed = 8;
  plane.nextRingIndex = 8;
  for (const ring of course.rings) ring.passed = true;
  plane.fuel = 18;
  plane.damage = 6;
  return { course, plane, mode: 'flying' };
}
