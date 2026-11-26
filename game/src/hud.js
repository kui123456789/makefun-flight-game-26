// HUD: the DOM instrument panel that sits over the canvas — altitude,
// speed, heading, throttle, fuel, damage, score and the mission objective.
// Numbers are updated every frame; the panel is plain DOM so the text stays
// crisp in screenshots.
import { formatAltitude, formatHeading, formatSpeed } from './util.js';
import { KNOTS_PER_MS } from './physics.js';

export function createHud(document) {
  const root = document.getElementById('hud');
  const els = {};
  for (const id of [
    'hud-alt', 'hud-speed', 'hud-heading', 'hud-throttle', 'hud-fuel',
    'hud-damage', 'hud-score', 'hud-rings', 'hud-mission', 'hud-objective',
    'hud-message', 'hud-fuel-bar', 'hud-damage-bar', 'hud-throttle-bar',
    'hud-vspeed', 'hud-state',
  ]) {
    els[id] = document.getElementById(id);
  }
  return { root, els };
}

function barWidth(percent) {
  return `${Math.max(0, Math.min(100, percent))}%`;
}

export function updateHud(hud, plane, course, missionProgress) {
  const e = hud.els;
  e['hud-alt'].textContent = `${formatAltitude(plane.agl)} m`;
  e['hud-speed'].textContent = `${formatSpeed(plane.speed * KNOTS_PER_MS)} kt`;
  e['hud-heading'].textContent = `${formatHeading(plane.heading)}°`;
  e['hud-throttle'].textContent = `${Math.round(plane.throttle * 100)}%`;
  e['hud-fuel'].textContent = `${Math.round(plane.fuel)}%`;
  e['hud-damage'].textContent = `${Math.round(plane.damage)}%`;
  e['hud-score'].textContent = `${plane.score}`;
  e['hud-rings'].textContent = missionProgress.rings;
  e['hud-vspeed'].textContent = `${plane.verticalSpeed >= 0 ? '+' : ''}${Math.round(plane.verticalSpeed * 3.28)} ft/min`;
  e['hud-fuel-bar'].style.width = barWidth(plane.fuel);
  e['hud-fuel-bar'].style.background = plane.fuel < 25 ? '#ff5a4e' : plane.fuel < 50 ? '#ffb020' : '#39d353';
  e['hud-damage-bar'].style.width = barWidth(plane.damage);
  e['hud-throttle-bar'].style.width = barWidth(plane.throttle * 100);
  e['hud-mission'].textContent = course.mission.name;
  const stateLabel = {
    ready: 'READY',
    flying: 'AIRBORNE',
    landed: 'LANDED',
    crashed: 'CRASHED',
    'out-of-fuel': 'OUT OF FUEL',
  }[plane.state] || plane.state.toUpperCase();
  e['hud-state'].textContent = stateLabel;
  e['hud-state'].style.color = plane.state === 'flying' ? '#39d353'
    : plane.state === 'landed' ? '#ffb020' : plane.state === 'ready' ? '#9fd4ef' : '#ff5a4e';

  if (plane.state === 'flying') {
    if (missionProgress.ringsLeft > 0) {
      e['hud-objective'].textContent = `Next ring ${missionProgress.nextRingAt}m ahead — then land on the runway`;
    } else {
      e['hud-objective'].textContent = 'All rings done — line up with the runway and land';
    }
  } else if (plane.state === 'landed') {
    e['hud-objective'].textContent = 'On the ground. Press R to fly again.';
  } else if (plane.state === 'crashed' || plane.state === 'out-of-fuel') {
    e['hud-objective'].textContent = plane.stateReason;
  } else {
    e['hud-objective'].textContent = course.mission.blurb;
  }

  if (plane.message && plane.time < plane.messageUntil) {
    e['hud-message'].textContent = plane.message;
    e['hud-message'].style.opacity = '1';
  } else {
    e['hud-message'].style.opacity = '0';
  }
}
