// Keyboard + mouse (pointer lock), and on-screen controls for touch screens.
export class Input {
  constructor(canvas) {
    this.canvas = canvas; this.keys = new Set(); this.taps = new Set(); this.dx = 0; this.dy = 0;
    this.fire = false; this.ads = false; this.firePressed = false; this.locked = false; this.lockFailed = false; this.active = false;
    this.stick = [0, 0]; this.touch = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
    this.onUnlock = () => {};
    const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    addEventListener('keydown', (e) => {
      if (typing(e) || !this.active) return;
      if (['Space', 'Tab', 'KeyC'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.taps.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.fire = false; this.ads = false; });
    addEventListener('mousedown', (e) => {
      if (!this.active || this.touch) return;
      if (!this.locked && !this.lockFailed) { this.lock(); return; }
      if (e.button === 0) { this.fire = true; this.firePressed = true; }
      if (e.button === 2) this.ads = true;
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.fire = false; if (e.button === 2) this.ads = false; });
    addEventListener('contextmenu', (e) => { if (this.active) e.preventDefault(); });
    addEventListener('mousemove', (e) => {
      if (!this.active || this.touch || (!this.locked && !this.lockFailed)) return;
      if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return; // browsers emit occasional huge spikes
      this.dx += e.movementX || 0; this.dy += e.movementY || 0;
    });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked) { this.fire = false; this.ads = false; this.onUnlock(); }
    });
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true; });
    if (this.touch) this.setupTouch();
  }
  lock() {
    if (this.touch) return;
    const fallback = () => { try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => { this.lockFailed = true; }); } catch { this.lockFailed = true; } };
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(fallback);
    } catch { fallback(); }
  }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  down(code) { return this.keys.has(code); }
  tap(code) { return this.taps.has(code); }
  look() { const r = [this.dx, this.dy]; this.dx = 0; this.dy = 0; return r; }
  endFrame() { this.taps.clear(); this.firePressed = false; }
  move() {
    let f = (this.down('KeyW') || this.down('ArrowUp') ? 1 : 0) - (this.down('KeyS') || this.down('ArrowDown') ? 1 : 0);
    let s = (this.down('KeyD') || this.down('ArrowRight') ? 1 : 0) - (this.down('KeyA') || this.down('ArrowLeft') ? 1 : 0);
    if (this.stick[0] || this.stick[1]) { s = this.stick[0]; f = -this.stick[1]; }
    return [f, s];
  }
  get sprint() { return this.down('ShiftLeft') || this.down('ShiftRight') || Math.hypot(this.stick[0], this.stick[1]) > 0.92; }
  get crouch() { return this.down('KeyC') || this.touchCrouch; }

  setupTouch() {
    const ui = document.getElementById('touch');
    const stick = document.getElementById('stick'), knob = stick.firstElementChild;
    let stickId = null, lookId = null, sx = 0, sy = 0, lx = 0, ly = 0;
    const btn = (id, on, off) => {
      const el = document.getElementById(id);
      el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); on(); el.classList.add('on'); }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); off && off(); el.classList.remove('on'); }, { passive: false });
    };
    btn('t-fire', () => { this.fire = true; this.firePressed = true; }, () => { this.fire = false; });
    btn('t-ads', () => { this.ads = !this.ads; });
    btn('t-jump', () => this.taps.add('Space'));
    btn('t-crouch', () => { this.touchCrouch = !this.touchCrouch; });
    btn('t-reload', () => this.taps.add('KeyR'));
    btn('t-optic', () => this.taps.add('KeyV'));
    ui.addEventListener('touchstart', (e) => {
      if (!this.active) return;
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.45 && stickId === null) {
          stickId = t.identifier; sx = t.clientX; sy = t.clientY;
          stick.style.left = sx - 60 + 'px'; stick.style.top = sy - 60 + 'px'; stick.hidden = false;
        } else if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
      }
    }, { passive: true });
    ui.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          let x = (t.clientX - sx) / 55, y = (t.clientY - sy) / 55; const l = Math.hypot(x, y);
          if (l > 1) { x /= l; y /= l; }
          this.stick = [x, y]; knob.style.transform = `translate(${x * 40}px, ${y * 40}px)`;
        } else if (t.identifier === lookId) { this.dx += (t.clientX - lx) * 1.6; this.dy += (t.clientY - ly) * 1.6; lx = t.clientX; ly = t.clientY; }
      }
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) { stickId = null; this.stick = [0, 0]; knob.style.transform = ''; stick.hidden = true; }
        if (t.identifier === lookId) lookId = null;
      }
    };
    ui.addEventListener('touchend', end); ui.addEventListener('touchcancel', end);
  }
}
