// Flight model for Skyline Courier: throttle, pitch, bank, lift, drag, wind,
// fuel burn and damage. The plane flies a valley course; the numbers are
// tuned so a sortie is a decision: push the throttle and you drink fuel,
// stay low and fast and the terrain gets unforgiving.
import { clamp, lerp } from './util.js';
import { isOverRunway, terrainHeightAt, valleyCentreAt } from './terrain.js';

export const KNOTS_PER_MS = 1.94384; // 1 m/s in knots
export const MAX_SPEED_MS = 118; // about 229 knots flat out
export const CRUISE_SPEED_MS = 62;
export const STALL_SPEED_MS = 24;
export const MAX_FUEL = 100;
export const MAX_DAMAGE = 100;

export function createPlane(course) {
  return {
    // Position: z along the course, x lateral from the valley centre,
    // agl = height above the terrain under the plane.
    z: 0,
    x: 0,
    agl: 120,
    heading: 0, // radians, 0 = straight down the valley
    pitch: 0, // radians, positive = nose up
    bank: 0, // radians, positive = banking right
    speed: 0, // m/s
    throttle: 0.55,
    fuel: course.mission.fuel,
    damage: 0,
    score: 0,
    ringsPassed: 0,
    ringsMissed: 0,
    state: 'ready', // ready | flying | landed | crashed | out-of-fuel
    stateReason: '',
    time: 0,
    distanceFlown: 0,
    windGust: 0,
    verticalSpeed: 0,
    groundSpeed: 0,
    landedQuality: 0, // 0..1, how gentle the touchdown was
    nextRingIndex: 0,
    message: '',
    messageUntil: 0,
  };
}

function showMessage(plane, text, seconds) {
  plane.message = text;
  plane.messageUntil = plane.time + seconds;
}

// One fixed step of the flight model. `input` carries the pilot's current
// stick and throttle: { pitch: -1..1, turn: -1..1, throttle: -1..1 (delta),
// throttleSet: 0..1 | null, brake: boolean }.
export function stepPhysics(plane, course, input, dt) {
  if (plane.state !== 'flying') return;
  plane.time += dt;
  const mission = course.mission;

  // --- Throttle and speed -------------------------------------------------
  if (input.throttleSet !== null && input.throttleSet !== undefined) {
    plane.throttle = clamp(input.throttleSet, 0, 1);
  } else {
    plane.throttle += (input.throttleDelta || 0) * dt * 0.55;
    plane.throttle = clamp(plane.throttle, 0, 1);
  }
  const targetSpeed = plane.throttle * MAX_SPEED_MS;
  const accel = plane.throttle > 0.02 ? 14 : -9; // engine pull vs drag
  plane.speed += clamp(targetSpeed - plane.speed, -26 * dt, accel * dt);
  if (input.brake) plane.speed = Math.max(0, plane.speed - 30 * dt);

  // --- Pitch, bank and heading -------------------------------------------
  const pitchTarget = clamp(input.pitch, -1, 1) * 0.42;
  plane.pitch = lerp(plane.pitch, pitchTarget, 1 - Math.exp(-dt * 2.6));
  const bankTarget = clamp(input.turn, -1, 1) * 0.85;
  plane.bank = lerp(plane.bank, bankTarget, 1 - Math.exp(-dt * 3.2));
  // A banked turn changes heading; the turn rate grows with speed.
  plane.heading += -plane.bank * (plane.speed / MAX_SPEED_MS) * 1.35 * dt;

  // --- Wind gusts push the nose around, stronger in the storm mission -----
  plane.windGust = lerp(plane.windGust, (Math.sin(plane.time * 0.9) + Math.sin(plane.time * 2.3) * 0.5) * mission.wind, dt * 0.8);
  plane.heading += (plane.windGust * 0.00045) * dt * 60 * 0.016;
  plane.x += plane.windGust * dt * 0.35;

  // --- Lift, climb and sink ----------------------------------------------
  const lift = clamp((plane.speed - STALL_SPEED_MS) / (CRUISE_SPEED_MS - STALL_SPEED_MS), 0, 1.4);
  const climbRate = Math.sin(plane.pitch) * plane.speed * lift;
  const sinkRate = (1 - lift) * 14; // below flying speed she sinks
  plane.verticalSpeed = climbRate - sinkRate;
  const ground = terrainHeightAt(course, plane.z);
  plane.agl += plane.verticalSpeed * dt;
  plane.agl = clamp(plane.agl, 0, mission.ceiling + 120);

  // --- Forward motion -----------------------------------------------------
  const forward = Math.cos(plane.heading) * plane.speed * dt;
  const lateral = -Math.sin(plane.heading) * plane.speed * dt;
  plane.z += forward;
  plane.x += lateral + plane.bank * plane.speed * 0.12 * dt;
  plane.x = clamp(plane.x, -VALLEY_LIMIT, VALLEY_LIMIT);
  plane.distanceFlown += forward;
  plane.groundSpeed = plane.speed;

  // --- Fuel ----------------------------------------------------------------
  const burn = (0.55 + plane.throttle * 1.5) * dt * (mission.id === 'storm-landing' ? 1.25 : 1);
  plane.fuel = Math.max(0, plane.fuel - burn);
  if (plane.fuel <= 0) {
    plane.state = 'out-of-fuel';
    plane.stateReason = 'Fuel exhausted — she glides down where she is.';
    return;
  }

  // --- Rings ---------------------------------------------------------------
  const ring = course.rings[plane.nextRingIndex];
  if (ring && plane.z >= ring.segmentIndex * 25) {
    const ringWorldX = valleyCentreAt(course, ring.segmentIndex * 25) + ring.x;
    const planeWorldX = valleyCentreAt(course, plane.z) + plane.x;
    const ringY = terrainHeightAt(course, ring.segmentIndex * 25) + ring.agl;
    const planeY = ground + plane.agl;
    const dx = planeWorldX - ringWorldX;
    const dy = planeY - ringY;
    const dist = Math.hypot(dx, dy);
    if (dist < ring.radius) {
      ring.passed = true;
      plane.ringsPassed += 1;
      plane.score += 250 + Math.round(plane.speed);
      showMessage(plane, `Ring ${ring.id} — clean! +${250 + Math.round(plane.speed)}`, 2.2);
    } else {
      ring.missed = true;
      plane.ringsMissed += 1;
      showMessage(plane, `Ring ${ring.id} missed — ${Math.round(dist)}m off centre`, 2.2);
    }
    plane.nextRingIndex += 1;
  }

  // --- Terrain and landing --------------------------------------------------
  if (plane.agl <= 0) {
    const overRunway = isOverRunway(course, plane.z);
    const aligned = Math.abs(plane.heading) < 0.22 && Math.abs(plane.bank) < 0.35;
    const gentle = plane.verticalSpeed > -6 && plane.speed < 78;
    if (overRunway && aligned && gentle) {
      plane.state = 'landed';
      plane.landedQuality = clamp(1 - Math.abs(plane.verticalSpeed) / 6, 0.35, 1);
      const bonus = Math.round(1000 * plane.landedQuality) + plane.ringsPassed * 150;
      plane.score += bonus;
      plane.stateReason = `Touchdown! Landing bonus +${bonus}.`;
      plane.agl = 0;
      return;
    }
    // Any other ground contact is a crash. Hard impacts hurt more.
    const impact = Math.abs(plane.verticalSpeed) + Math.max(0, plane.speed - 60) * 0.4;
    plane.damage = Math.min(MAX_DAMAGE, plane.damage + 30 + impact * 2);
    plane.state = 'crashed';
    plane.stateReason = overRunway
      ? 'Too fast, too steep or sideways on the strip — she broke up on the runway.'
      : 'Terrain strike — the valley wins this one.';
    plane.agl = 0;
    return;
  }

  // Scraping the valley walls at the edge costs damage, not a crash.
  if (Math.abs(plane.x) > VALLEY_LIMIT - 12) {
    plane.damage = Math.min(MAX_DAMAGE, plane.damage + 6 * dt);
    if (plane.damage >= MAX_DAMAGE) {
      plane.state = 'crashed';
      plane.stateReason = 'Airframe gave out after too many scrapes on the valley walls.';
    }
  }

  // All rings done and past the runway: the sortie is over unless landed.
  if (plane.nextRingIndex >= course.rings.length && plane.z > course.finishZ) {
    plane.state = 'crashed';
    plane.stateReason = 'Overshot the strip — the valley runs out past the runway.';
  }
}

const VALLEY_LIMIT = 300;

// Reset the plane for a fresh attempt on the same course.
export function resetPlane(course) {
  const fresh = createPlane(course);
  for (const ring of course.rings) {
    ring.passed = false;
    ring.missed = false;
  }
  return fresh;
}

// Score shown on the results screen, with the mission's ring tally.
export function missionProgress(plane, course) {
  return {
    rings: `${plane.ringsPassed}/${course.rings.length}`,
    ringsLeft: course.rings.length - plane.nextRingIndex,
    nextRingAt: course.rings[plane.nextRingIndex]
      ? Math.max(0, Math.round(course.rings[plane.nextRingIndex].segmentIndex * 25 - plane.z))
      : 0,
  };
}
