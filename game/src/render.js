// Renderer for Skyline Courier: a chase view drawn on a 2D canvas.
// The valley is drawn as a pseudo-3D strip of projected segments — sky,
// sun and mountain ridges behind, fields, forest and river below, rings and
// the runway ahead, and the aircraft drawn in the foreground with its bank.
import { clamp, lerp } from './util.js';
import {
  GROUND,
  SEGMENT_LENGTH,
  VALLEY_HALF_WIDTH,
  segmentAt,
  terrainHeightAt,
  valleyCentreAt,
} from './terrain.js';

const CAMERA_DEPTH = 0.9;
const DRAW_DISTANCE = 170; // segments drawn ahead of the camera
const ROAD_HALF = 200; // half-width of the valley floor drawn, in metres

// Project a world point into screen space relative to the camera.
function projectPoint(camX, camY, camZ, wx, wy, wz, width, height) {
  const dz = wz - camZ;
  if (dz < 1) return null;
  const scale = CAMERA_DEPTH / dz;
  return {
    x: width / 2 + scale * (wx - camX) * (width / 2),
    y: height / 2 - scale * (wy - camY) * (height / 2),
    scale,
    w: scale * ROAD_HALF * (width / 2),
  };
}

function groundColour(kind, index) {
  const alt = index % 2 === 0;
  switch (kind) {
    case GROUND.FIELD_LIGHT: return alt ? '#7fb069' : '#74a85f';
    case GROUND.FIELD_DARK: return alt ? '#5d9b4e' : '#548f46';
    case GROUND.FOREST: return alt ? '#3f7d3a' : '#386f34';
    case GROUND.RIVER: return '#4a90c2';
    case GROUND.RUNWAY: return '#5b6068';
    case GROUND.APRON: return '#8a8f7a';
    default: return '#7fb069';
  }
}

function drawSky(ctx, width, height, heading, timeOfDay) {
  const sky = ctx.createLinearGradient(0, 0, 0, height * 0.62);
  sky.addColorStop(0, '#2f6fb8');
  sky.addColorStop(0.55, '#7db4e2');
  sky.addColorStop(1, '#cfe8f5');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height * 0.62);

  // Sun, placed by heading so turning the plane moves it across the sky.
  const sunX = width * 0.5 + Math.sin(heading) * width * 0.55;
  const sunY = height * 0.16;
  const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 120);
  glow.addColorStop(0, 'rgba(255, 246, 200, 0.95)');
  glow.addColorStop(0.25, 'rgba(255, 226, 130, 0.75)');
  glow.addColorStop(1, 'rgba(255, 226, 130, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sunX - 130, sunY - 130, 260, 260);
  ctx.fillStyle = '#fff3b0';
  ctx.beginPath();
  ctx.arc(sunX, sunY, 26, 0, Math.PI * 2);
  ctx.fill();
  void timeOfDay;
}

function drawRidges(ctx, course, width, height, camZ, horizonY) {
  for (const ridge of course.ridges) {
    const baseY = horizonY - ridge.base * height * 0.16;
    const amp = (14 + ridge.depth * 22) * (height / 720);
    ctx.beginPath();
    ctx.moveTo(0, height * 0.62);
    for (let sx = 0; sx <= width; sx += 16) {
      const worldX = sx / width + camZ * 0.00004 * (ridge.depth + 1);
      const n = ridge.noise(worldX * 3);
      ctx.lineTo(sx, baseY - n * amp);
    }
    ctx.lineTo(width, height * 0.62);
    ctx.closePath();
    const shades = ['#5a7ba6', '#47688f', '#33507a'];
    ctx.fillStyle = shades[ridge.depth];
    ctx.globalAlpha = 0.9 - ridge.depth * 0.18;
    ctx.fill();
    ctx.globalAlpha = 1;
    // Snow caps on the far ridge.
    if (ridge.depth === 2) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (let sx = 8; sx < width; sx += 64) {
        const worldX = sx / width + camZ * 0.00004 * 3;
        const n = ridge.noise(worldX * 3);
        if (n > 0.72) {
          ctx.beginPath();
          ctx.arc(sx, baseY - n * amp + 4, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
}

function drawClouds(ctx, course, width, height, camX, camY, camZ, plane) {
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  for (const cloud of course.clouds) {
    const relZ = cloud.z - camZ;
    if (relZ < 20 || relZ > 9000) continue;
    const p = projectPoint(camX, camY, camZ, cloud.x, cloud.y, cloud.z, width, height);
    if (!p) continue;
    const r = Math.max(3, cloud.scale * p.scale * 0.9);
    if (r < 2) continue;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, r * 1.8, r * 0.55, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x - r, p.y + r * 0.18, r, r * 0.45, 0, 0, Math.PI * 2);
    ctx.ellipse(p.x + r, p.y + r * 0.18, r * 0.9, r * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  void plane;
}

function hillRise(course, segmentIndex) {
  // Deterministic rolling hill height beside the valley floor.
  const a = Math.sin(segmentIndex * 0.11 + (course.seed % 17));
  const b = Math.sin(segmentIndex * 0.031 + (course.seed % 29) * 0.7);
  return 55 + 55 * (0.5 + 0.5 * a) + 45 * (0.5 + 0.5 * b);
}

function drawTerrain(ctx, course, width, height, camX, camY, camZ, plane) {
  const baseIndex = Math.floor(camZ / SEGMENT_LENGTH);
  const horizonY = height * 0.52;
  let prev = null;
  let prevCrestL = null;
  let prevCrestR = null;
  for (let n = 0; n < DRAW_DISTANCE; n++) {
    const seg = course.segments[baseIndex + n];
    if (!seg) break;
    const centre = seg.curveAccum;
    const top = projectPoint(camX, camY, camZ, centre, seg.height, seg.z, width, height);
    if (!top) continue;
    const hill = hillRise(course, seg.index);
    const crestL = projectPoint(camX, camY, camZ, centre - VALLEY_HALF_WIDTH, seg.height + hill, seg.z, width, height);
    const crestR = projectPoint(camX, camY, camZ, centre + VALLEY_HALF_WIDTH, seg.height + hill, seg.z, width, height);
    // Draw the ground quad between this segment and the previous one.
    if (prev) {
      const yTop = top.y;
      const yBot = prev.y;
      const xLeftTop = top.x - top.w;
      const xRightTop = top.x + top.w;
      const xLeftBot = prev.x - prev.w;
      const xRightBot = prev.x + prev.w;
      // Valley walls: rising ground on both sides of the floor, so the
      // course reads as a valley rather than a flat plain.
      if (crestL && prevCrestL) {
        ctx.fillStyle = seg.ground === GROUND.FOREST ? '#2f6b2e' : '#5d8a4a';
        ctx.beginPath();
        ctx.moveTo(xLeftTop, yTop);
        ctx.lineTo(crestL.x, crestL.y);
        ctx.lineTo(prevCrestL.x, prevCrestL.y);
        ctx.lineTo(xLeftBot, yBot);
        ctx.closePath();
        ctx.fill();
      }
      if (crestR && prevCrestR) {
        ctx.fillStyle = seg.ground === GROUND.FOREST ? '#2f6b2e' : '#648f4e';
        ctx.beginPath();
        ctx.moveTo(xRightTop, yTop);
        ctx.lineTo(crestR.x, crestR.y);
        ctx.lineTo(prevCrestR.x, prevCrestR.y);
        ctx.lineTo(xRightBot, yBot);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = groundColour(seg.ground, seg.index);
      ctx.beginPath();
      ctx.moveTo(xLeftTop, yTop);
      ctx.lineTo(xRightTop, yTop);
      ctx.lineTo(xRightBot, yBot);
      ctx.lineTo(xLeftBot, yBot);
      ctx.closePath();
      ctx.fill();
      // A darker edge line where the valley floor meets the hills.
      ctx.strokeStyle = 'rgba(0,0,0,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(xLeftTop, yTop);
      ctx.lineTo(xLeftBot, yBot);
      ctx.moveTo(xRightTop, yTop);
      ctx.lineTo(xRightBot, yBot);
      ctx.stroke();

      // Runway centreline and threshold bars.
      if (seg.ground === GROUND.RUNWAY) {
        const midX = (top.x + prev.x) / 2;
        const halfW = (top.w + prev.w) / 2;
        ctx.fillStyle = '#f4f6f0';
        const dashW = Math.max(1.5, halfW * 0.03);
        ctx.fillRect(midX - dashW / 2, Math.min(yTop, yBot), dashW, Math.abs(yBot - yTop) + 1);
        ctx.fillRect(top.x - halfW * 0.55, yTop, halfW * 1.1, Math.max(1.5, Math.abs(yBot - yTop) * 0.18));
      }
      // Field hedgerows: faint lines across the ground.
      if (seg.ground === GROUND.FIELD_DARK && seg.index % 3 === 0) {
        ctx.strokeStyle = 'rgba(30,60,25,0.25)';
        ctx.beginPath();
        ctx.moveTo(xLeftTop, yTop);
        ctx.lineTo(xRightTop, yTop);
        ctx.stroke();
      }
    }
    prev = top;
    prevCrestL = crestL;
    prevCrestR = crestR;
  }

  // Trees: drawn near-to-far so nearer ones overlap farther ones.
  for (let n = DRAW_DISTANCE - 1; n >= 0; n--) {
    const seg = course.segments[baseIndex + n];
    if (!seg || seg.trees.length === 0) continue;
    for (const tree of seg.trees) {
      const wx = seg.curveAccum + tree.offset;
      const p = projectPoint(camX, camY, camZ, wx, seg.height, seg.z, width, height);
      if (!p) continue;
      const h = Math.max(2, 26 * tree.size * p.scale * (height / 720) * 12);
      const w = h * 0.55;
      drawTree(ctx, p.x, p.y, w, h, tree.kind);
    }
  }
  void plane;
}

function drawTree(ctx, x, baseY, w, h, kind) {
  ctx.fillStyle = '#5a3d24';
  ctx.fillRect(x - w * 0.08, baseY - h * 0.25, w * 0.16, h * 0.25);
  if (kind === 'pine') {
    ctx.fillStyle = '#2d5a2e';
    ctx.beginPath();
    ctx.moveTo(x, baseY - h);
    ctx.lineTo(x - w, baseY - h * 0.2);
    ctx.lineTo(x + w, baseY - h * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3a6e38';
    ctx.beginPath();
    ctx.moveTo(x, baseY - h * 0.8);
    ctx.lineTo(x - w * 0.7, baseY - h * 0.1);
    ctx.lineTo(x + w * 0.7, baseY - h * 0.1);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillStyle = '#4a7d33';
    ctx.beginPath();
    ctx.arc(x, baseY - h * 0.62, w * 0.95, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5d9440';
    ctx.beginPath();
    ctx.arc(x - w * 0.35, baseY - h * 0.75, w * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawRings(ctx, course, width, height, camX, camY, camZ, plane) {
  for (let n = DRAW_DISTANCE - 1; n >= 0; n--) {
    const seg = course.segments[Math.floor(camZ / SEGMENT_LENGTH) + n];
    if (!seg || !seg.ring) continue;
    const ring = seg.ring;
    const ringZ = seg.z;
    const ringY = seg.height + ring.agl;
    const ringX = seg.curveAccum + ring.x;
    const centre = projectPoint(camX, camY, camZ, ringX, ringY, ringZ, width, height);
    if (!centre) continue;
    const radius = Math.max(2, ring.radius * centre.scale * (width / 2));
    if (radius < 3) continue;
    const passed = ring.passed;
    const isNext = course.rings[plane.nextRingIndex] === ring;
    const colour = passed ? '#39d353' : isNext ? '#ffb020' : '#ff5a4e';
    ctx.lineWidth = Math.max(2, radius * 0.14);
    ctx.strokeStyle = colour;
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = Math.max(1, radius * 0.05);
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, radius * 0.82, 0, Math.PI * 2);
    ctx.stroke();
    // Distance tag above the next ring (only while actually flying).
    if (isNext && plane.state === 'flying') {
      const dist = Math.max(0, Math.round(ringZ - plane.z));
      ctx.fillStyle = '#ffb020';
      ctx.font = `bold ${Math.max(12, Math.min(22, radius * 0.5))}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`RING ${ring.id} · ${dist}m`, centre.x, centre.y - radius - 8);
    }
  }
}

function drawRunwayBeacon(ctx, course, width, height, camX, camY, camZ, plane) {
  const rz = course.runwayZ;
  if (rz - camZ < 0 || rz - camZ > 9000) return;
  const centre = valleyCentreAt(course, rz);
  const groundY = terrainHeightAt(course, rz);
  const p = projectPoint(camX, camY, camZ, centre, groundY + 30, rz, width, height);
  if (!p) return;
  const dist = Math.max(0, Math.round(rz - plane.z));
  ctx.fillStyle = '#e8f4ff';
  ctx.font = 'bold 15px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`▸ RUNWAY ${dist}m`, p.x, p.y - 14);
  // Approach lights: two rows of dots leading to the threshold.
  ctx.fillStyle = '#ffdf5e';
  for (let i = 0; i < 5; i++) {
    const lz = rz - i * 60;
    const lp = projectPoint(camX, camY, camZ, centre, terrainHeightAt(course, lz) + 4, lz, width, height);
    if (lp) {
      ctx.beginPath();
      ctx.arc(lp.x, lp.y, Math.max(1.5, 3 * lp.scale * 8), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// The aircraft, drawn in the foreground as a vector prop plane seen from
// behind and slightly above: fuselage, wings, tail, spinning prop blur.
export function drawPlane(ctx, width, height, plane, time) {
  const cx = width / 2;
  const cy = height * 0.62;
  const scale = height / 720;
  const bank = plane.bank;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(bank * 0.55);
  ctx.scale(scale, scale);

  const propAngle = time * 28;
  // Prop blur disc.
  ctx.fillStyle = 'rgba(200,210,220,0.35)';
  ctx.beginPath();
  ctx.ellipse(0, -6, 26, 30, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,100,110,0.7)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(Math.cos(propAngle) * 26, -6 + Math.sin(propAngle) * 30);
  ctx.lineTo(-Math.cos(propAngle) * 26, -6 - Math.sin(propAngle) * 30);
  ctx.moveTo(-Math.sin(propAngle) * 26, -6 + Math.cos(propAngle) * 30);
  ctx.lineTo(Math.sin(propAngle) * 26, -6 - Math.cos(propAngle) * 30);
  ctx.stroke();

  // Wings.
  ctx.fillStyle = '#c8442c';
  ctx.beginPath();
  ctx.moveTo(-118, 6);
  ctx.lineTo(118, 6);
  ctx.lineTo(104, 22);
  ctx.lineTo(-104, 22);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#e8e4da';
  ctx.fillRect(-118, 10, 236, 4);
  // Wingtip lights.
  ctx.fillStyle = '#ff3b30';
  ctx.beginPath();
  ctx.arc(-118, 14, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#39d353';
  ctx.beginPath();
  ctx.arc(118, 14, 4, 0, Math.PI * 2);
  ctx.fill();

  // Fuselage.
  ctx.fillStyle = '#e8e4da';
  ctx.beginPath();
  ctx.moveTo(0, -46);
  ctx.quadraticCurveTo(20, -30, 18, 8);
  ctx.lineTo(14, 44);
  ctx.lineTo(-14, 44);
  ctx.lineTo(-18, 8);
  ctx.quadraticCurveTo(-20, -30, 0, -46);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#c8442c';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-17, 12);
  ctx.lineTo(17, 12);
  ctx.stroke();
  // Canopy.
  ctx.fillStyle = '#9fd4ef';
  ctx.beginPath();
  ctx.ellipse(0, -18, 9, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.beginPath();
  ctx.ellipse(-3, -24, 3, 6, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // Tail.
  ctx.fillStyle = '#c8442c';
  ctx.beginPath();
  ctx.moveTo(-34, 40);
  ctx.lineTo(34, 40);
  ctx.lineTo(26, 52);
  ctx.lineTo(-26, 52);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, 34);
  ctx.lineTo(-10, 56);
  ctx.lineTo(10, 56);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawAttitude(ctx, plane, width, height) {
  // Artificial horizon: a small round gauge, bottom left.
  const r = 46;
  const cx = 78;
  const cy = height - 92;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#7db4e2';
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-plane.bank * 0.8);
  ctx.translate(0, plane.pitch * 90);
  ctx.fillStyle = '#8a6b46';
  ctx.fillRect(-r, 0, r * 2, r);
  ctx.fillStyle = '#7db4e2';
  ctx.fillRect(-r, -r, r * 2, r);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1.5;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(-18, i * 14);
    ctx.lineTo(18, i * 14);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = '#ffb020';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 22, cy);
  ctx.lineTo(cx - 6, cy);
  ctx.moveTo(cx + 6, cy);
  ctx.lineTo(cx + 22, cy);
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('ATTITUDE', cx, cy + r + 14);
}

function drawCompass(ctx, plane, width) {
  // Heading tape across the top centre of the screen, below the mission bar.
  const cy = 100;
  const cx = width / 2;
  const headingDeg = ((plane.heading * 180) / Math.PI % 360 + 360) % 360;
  ctx.fillStyle = 'rgba(10,20,35,0.55)';
  ctx.fillRect(cx - 190, cy - 16, 380, 30);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.strokeRect(cx - 190, cy - 16, 380, 30);
  const points = [
    [0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'],
    [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW'],
  ];
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  for (const [deg, label] of points) {
    let rel = deg - headingDeg;
    while (rel > 180) rel -= 360;
    while (rel < -180) rel += 360;
    const x = cx + rel * 3.2;
    if (Math.abs(rel) > 58) continue;
    ctx.fillText(label, x, cy + 5);
    ctx.fillRect(x - 1, cy - 12, 2, 5);
  }
  ctx.fillStyle = '#ffb020';
  ctx.beginPath();
  ctx.moveTo(cx, cy - 18);
  ctx.lineTo(cx - 6, cy - 26);
  ctx.lineTo(cx + 6, cy - 26);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffb020';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText(`${Math.round(headingDeg)}°`, cx, cy + 26);
}

// Full frame: sky, ridges, clouds, terrain, rings, runway, plane, gauges.
export function renderFrame(ctx, course, plane, width, height, time) {
  const camZ = plane.z;
  const camX = valleyCentreAt(course, camZ) + plane.x;
  const ground = terrainHeightAt(course, camZ);
  const camY = ground + plane.agl + 6;
  const horizonY = height * 0.52;

  drawSky(ctx, width, height, plane.heading, 0);
  drawRidges(ctx, course, width, height, camZ, horizonY);
  drawClouds(ctx, course, width, height, camX, camY, camZ, plane);
  drawTerrain(ctx, course, width, height, camX, camY, camZ, plane);
  drawRings(ctx, course, width, height, camX, camY, camZ, plane);
  drawRunwayBeacon(ctx, course, width, height, camX, camY, camZ, plane);
  drawPlane(ctx, width, height, plane, time);
  drawAttitude(ctx, plane, width, height);
  drawCompass(ctx, plane, width);
}
