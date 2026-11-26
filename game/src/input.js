// Input for Skyline Courier: keyboard (arrows / WASD) plus mouse.
// The mouse drives the throttle slider, the title-screen buttons and a
// click-drag stick: drag on the canvas and the plane banks and pitches
// toward the pointer. All handlers are plain DOM events; nothing here
// touches the network.
import { clamp } from './util.js';

export function createInput(document, canvas) {
  const keys = new Set();
  const input = {
    keys,
    // Stick state, -1..1 on each axis, from keys or from the mouse drag.
    pitch: 0,
    turn: 0,
    throttleDelta: 0,
    throttleSet: null,
    brake: false,
    pointerSteer: null, // { x: -1..1, y: -1..1 } while dragging, else null
    onStart: null,
    onRestart: null,
    onMissionSelect: null,
    onPause: null,
  };

  const KEYMAP = {
    ArrowUp: 'pitch-up',
    ArrowDown: 'pitch-down',
    ArrowLeft: 'turn-left',
    ArrowRight: 'turn-right',
    KeyW: 'throttle-up',
    KeyS: 'throttle-down',
    KeyA: 'turn-left',
    KeyD: 'turn-right',
    KeyI: 'pitch-up',
    KeyK: 'pitch-down',
    Space: 'brake',
  };

  function refreshStick() {
    let pitch = 0;
    let turn = 0;
    if (keys.has('pitch-up')) pitch += 1;
    if (keys.has('pitch-down')) pitch -= 1;
    if (keys.has('turn-left')) turn -= 1;
    if (keys.has('turn-right')) turn += 1;
    if (input.pointerSteer) {
      pitch = clamp(-input.pointerSteer.y, -1, 1);
      turn = clamp(input.pointerSteer.x, -1, 1);
    }
    input.pitch = pitch;
    input.turn = turn;
    input.throttleDelta = (keys.has('throttle-up') ? 1 : 0) - (keys.has('throttle-down') ? 1 : 0);
    input.brake = keys.has('brake');
  }

  document.addEventListener('keydown', (event) => {
    const action = KEYMAP[event.code];
    if (action) {
      event.preventDefault();
      keys.add(action);
      refreshStick();
    }
    if (event.code === 'Enter' && input.onStart) input.onStart();
    if (event.code === 'KeyR' && input.onRestart) input.onRestart();
    if (event.code === 'KeyP' && input.onPause) input.onPause();
    if (event.code === 'Digit1' && input.onMissionSelect) input.onMissionSelect(0);
    if (event.code === 'Digit2' && input.onMissionSelect) input.onMissionSelect(1);
    if (event.code === 'Digit3' && input.onMissionSelect) input.onMissionSelect(2);
  });
  document.addEventListener('keyup', (event) => {
    const action = KEYMAP[event.code];
    if (action) {
      keys.delete(action);
      refreshStick();
    }
  });

  // Click-drag stick on the canvas.
  let dragging = false;
  function pointerPosition(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width - 0.5) * 2.4, -1, 1),
      y: clamp(((event.clientY - rect.top) / rect.height - 0.5) * 2.4, -1, 1),
    };
  }
  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    canvas.setPointerCapture(event.pointerId);
    input.pointerSteer = pointerPosition(event);
    refreshStick();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;
    input.pointerSteer = pointerPosition(event);
    refreshStick();
  });
  canvas.addEventListener('pointerup', () => {
    dragging = false;
    input.pointerSteer = null;
    refreshStick();
  });
  canvas.addEventListener('pointercancel', () => {
    dragging = false;
    input.pointerSteer = null;
    refreshStick();
  });

  // Throttle slider in the HUD.
  const slider = document.getElementById('throttle-slider');
  if (slider) {
    slider.addEventListener('input', () => {
      input.throttleSet = Number(slider.value) / 100;
    });
    slider.addEventListener('change', () => {
      input.throttleSet = null;
    });
  }

  // Buttons.
  function wireButton(id, handler) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', handler);
  }
  wireButton('btn-start', () => input.onStart && input.onStart());
  wireButton('btn-restart', () => input.onRestart && input.onRestart());
  wireButton('btn-fly-again', () => input.onRestart && input.onRestart());
  wireButton('btn-menu', () => input.onPause && input.onPause());
  document.querySelectorAll('[data-mission]').forEach((el) => {
    el.addEventListener('click', () => {
      if (input.onMissionSelect) input.onMissionSelect(Number(el.dataset.mission));
    });
  });

  input.refreshStick = refreshStick;
  return input;
}
