// Skyline Courier — main loop and game state.
// Title screen, mission select, in-flight play, landing and crash outcomes,
// restart. The loop renders every animation frame; physics steps in fixed
// slices so the flight model behaves the same at any refresh rate.
import { buildCourse, missionById } from './terrain.js';
import { createPlane, missionProgress, resetPlane, stepPhysics } from './physics.js';
import { renderFrame } from './render.js';
import { createHud, updateHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { buildShotScene, parseShotParams } from './shots.js';
import { clamp } from './util.js';

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const hud = createHud(document);
const audio = createAudio();

const titleOverlay = document.getElementById('title-screen');
const endOverlay = document.getElementById('end-screen');
const endTitle = document.getElementById('end-title');
const endDetail = document.getElementById('end-detail');
const endScore = document.getElementById('end-score');
const pauseOverlay = document.getElementById('pause-screen');

// One session's seed: fixed in screenshot mode, random per visit otherwise.
function missionList() {
  return ['ring-run', 'canyon-dash', 'storm-landing'].map((id) => missionById(id));
}

const shot = parseShotParams(window.location.search);
let seed = shot ? shot.seed : (Date.now() % 2147483647);
let missionId = 'ring-run';
let course = buildCourse(seed, missionId);
course.missionList = missionList();
let plane = createPlane(course);
let paused = false;
let frozenShot = false;

if (shot) {
  const scene = buildShotScene(shot.shot, shot.seed);
  course = scene.course;
  course.missionList = missionList();
  plane = scene.plane;
  frozenShot = true;
  if (scene.mode === 'title') {
    showTitle();
  } else {
    hideOverlays();
    document.getElementById('hud').classList.remove('hidden');
  }
  // Expose the frozen state for automated play-testing.
  window.__skyline = { course, plane, get state() { return plane.state; } };
} else {
  showTitle();
  window.__skyline = { course, plane, get state() { return plane.state; } };
}

function showTitle() {
  titleOverlay.classList.remove('hidden');
  endOverlay.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  document.getElementById('hud').classList.add('hidden');
  renderMissionCards();
}

function hideOverlays() {
  titleOverlay.classList.add('hidden');
  endOverlay.classList.add('hidden');
  pauseOverlay.classList.add('hidden');
  document.getElementById('hud').classList.remove('hidden');
}

function renderMissionCards() {
  const container = document.getElementById('mission-cards');
  if (!container || container.children.length > 0) return;
  for (const [index, mission] of course.missionList.entries()) {
    const card = document.createElement('button');
    card.className = 'mission-card';
    card.dataset.mission = String(index);
    card.innerHTML = `<strong>${mission.name}</strong><span>${mission.blurb}</span>` +
      `<em>${mission.rings} rings · fuel ${mission.fuel}% · wind ${mission.wind}</em>`;
    container.appendChild(card);
  }
}

function startFlight() {
  audio.ensure();
  audio.click();
  seed = shot ? shot.seed : (Date.now() % 2147483647);
  course = buildCourse(seed, missionId);
  course.missionList = missionList();
  plane = createPlane(course);
  plane.state = 'flying';
  plane.speed = 28;
  paused = false;
  hideOverlays();
  window.__skyline = { course, plane, get state() { return plane.state; } };
}

function restartFlight() {
  audio.ensure();
  plane = resetPlane(course);
  plane.state = 'flying';
  plane.speed = 28;
  paused = false;
  hideOverlays();
  window.__skyline = { course, plane, get state() { return plane.state; } };
}

function showEnd() {
  const landed = plane.state === 'landed';
  endTitle.textContent = landed ? 'Landed — nice flying!' : plane.state === 'out-of-fuel' ? 'Out of fuel' : 'Crashed';
  endTitle.style.color = landed ? '#39d353' : '#ff5a4e';
  endDetail.textContent = plane.stateReason;
  endScore.textContent = `Score ${plane.score} · Rings ${plane.ringsPassed}/${course.rings.length} · ` +
    `Distance ${Math.round(plane.distanceFlown)}m · Fuel ${Math.round(plane.fuel)}% left`;
  endOverlay.classList.remove('hidden');
  if (landed) audio.touchdown();
  else audio.crash();
}

function togglePause() {
  if (plane.state !== 'flying' || frozenShot) return;
  paused = !paused;
  pauseOverlay.classList.toggle('hidden', !paused);
}

const input = createInput(document, canvas);
input.onStart = () => {
  if (plane.state === 'ready' || titleOverlay.classList.contains('hidden') === false) startFlight();
};
input.onRestart = () => {
  if (plane.state !== 'flying' || paused) restartFlight();
};
input.onPause = () => {
  if (titleOverlay.classList.contains('hidden') === false) return;
  if (plane.state === 'flying') togglePause();
  else showTitle();
};
input.onMissionSelect = (index) => {
  missionId = course.missionList[index].id;
  document.querySelectorAll('.mission-card').forEach((el, i) => {
    el.classList.toggle('selected', i === index);
  });
};

// Mission list is attached to the course object for the cards above.
renderMissionCards();
document.querySelectorAll('.mission-card').forEach((el, i) => {
  el.classList.toggle('selected', i === 0);
});

// Keep the throttle slider in sync with the keyboard throttle.
const slider = document.getElementById('throttle-slider');
let lastState = plane.state;
let lastRingsPassed = plane.ringsPassed;

let lastTime = performance.now();
function frame(now) {
  const dt = clamp((now - lastTime) / 1000, 0, 0.05);
  lastTime = now;

  if (!paused && !frozenShot && plane.state === 'flying') {
    stepPhysics(plane, course, input, dt);
    audio.setEngine(plane.throttle, plane.speed, true);
    if (plane.ringsPassed > lastRingsPassed) audio.ringChime();
    lastRingsPassed = plane.ringsPassed;
  } else {
    audio.setEngine(0, 0, false);
  }

  if (plane.state !== lastState) {
    if (plane.state === 'landed' || plane.state === 'crashed' || plane.state === 'out-of-fuel') {
      showEnd();
    }
    lastState = plane.state;
  }

  renderFrame(ctx, course, plane, canvas.width, canvas.height, now / 1000);
  if (!document.getElementById('hud').classList.contains('hidden')) {
    updateHud(hud, plane, course, missionProgress(plane, course));
  }
  if (slider && document.activeElement !== slider) {
    slider.value = String(Math.round(plane.throttle * 100));
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
