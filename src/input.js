// Keyboard + on-screen touch controls. Arrow keys / WASD steer, Space jumps.

export function createInput() {
  const held = new Set();
  const pressed = new Set();
  const map = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    Space: 'jump', KeyJ: 'jump', KeyK: 'jump',
  };

  function press(a) { if (!held.has(a)) pressed.add(a); held.add(a); }
  function release(a) { held.delete(a); }

  window.addEventListener('keydown', (e) => {
    const a = map[e.code];
    if (!a) return;
    e.preventDefault();
    if (!e.repeat) press(a);
  });
  window.addEventListener('keyup', (e) => { const a = map[e.code]; if (a) release(a); });
  window.addEventListener('blur', () => held.clear());

  // touch pad: any element with data-pad="left|right|up|down|jump"
  document.querySelectorAll('[data-pad]').forEach((el) => {
    const a = el.dataset.pad;
    const on = (e) => { e.preventDefault(); press(a); el.classList.add('is-down'); };
    const off = (e) => { e.preventDefault(); release(a); el.classList.remove('is-down'); };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  });

  const state = { x: 0, up: false, down: false, jump: false, upPressed: false, jumpPressed: false };
  return {
    state,
    // call once per frame before reading state
    poll() {
      state.x = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
      state.up = held.has('up');
      state.down = held.has('down');
      state.jump = held.has('jump');
      state.upPressed = pressed.has('up');
      state.jumpPressed = pressed.has('jump');
      pressed.clear();
      return state;
    },
    clear() { held.clear(); pressed.clear(); },
  };
}
