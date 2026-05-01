// Pointer-event-based input. Handles single-pointer pan, two-pointer pinch,
// taps, and a triple-tap shortcut on the top-right corner to toggle debug HUD.
class InputController {
  constructor(target, renderer) {
    this.target = target;
    this.renderer = renderer;
    this.pointers = new Map();
    this.pinchStart = 0;
    this.tapTimes = [];
    this.callbacks = {};

    target.addEventListener('pointerdown', e => this._onDown(e));
    target.addEventListener('pointermove', e => this._onMove(e));
    target.addEventListener('pointerup',   e => this._onUp(e));
    target.addEventListener('pointercancel', e => this._onUp(e));
    target.addEventListener('contextmenu', e => e.preventDefault());
    // Block browser pinch-zoom / double-tap-zoom over the canvas
    target.addEventListener('gesturestart',  e => e.preventDefault());
    target.addEventListener('gesturechange', e => e.preventDefault());
    target.addEventListener('gestureend',    e => e.preventDefault());
    target.addEventListener('wheel', e => this._onWheel(e), { passive: false });
  }

  on(event, cb) { this.callbacks[event] = cb; }
  _emit(event, ...args) { if (this.callbacks[event]) this.callbacks[event](...args); }

  _onDown(e) {
    e.preventDefault();
    try { this.target.setPointerCapture(e.pointerId); } catch (_) {}
    const p = {
      id: e.pointerId,
      startX: e.clientX, startY: e.clientY,
      x: e.clientX, y: e.clientY,
      startTime: performance.now(),
      moved: false,
      consumed: false,
      longPressTimer: null,
    };
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      // Two-finger gestures cancel any pending long-press
      for (const q of this.pointers.values()) {
        if (q.longPressTimer) { clearTimeout(q.longPressTimer); q.longPressTimer = null; }
      }
    } else {
      p.longPressTimer = setTimeout(() => {
        p.longPressTimer = null;
        if (p.moved) return;
        if (this.pointers.size !== 1) return;
        p.consumed = true;
        this._handleLongPress(p.startX, p.startY);
      }, CONFIG.LONGPRESS_MS);
    }
  }

  _onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.abs(e.clientX - p.startX) > CONFIG.TAP_MAX_MOVE ||
        Math.abs(e.clientY - p.startY) > CONFIG.TAP_MAX_MOVE) {
      p.moved = true;
      if (p.longPressTimer) { clearTimeout(p.longPressTimer); p.longPressTimer = null; }
    }

    if (this.pointers.size === 1) {
      this.renderer.pan(dx, dy);
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchStart > 0) {
        const factor = dist / this.pinchStart;
        const cx = (a.x + b.x) / 2;
        const cy = (a.y + b.y) / 2;
        this.renderer.zoomAt(cx, cy, factor);
      }
      this.pinchStart = dist;
    }
  }

  _onUp(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    if (p.longPressTimer) { clearTimeout(p.longPressTimer); p.longPressTimer = null; }
    const duration = performance.now() - p.startTime;
    const wasTap = !p.moved && !p.consumed && duration < CONFIG.TAP_MAX_DURATION;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchStart = 0;
    if (wasTap) this._handleTap(p.startX, p.startY);
  }

  _onWheel(e) {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    this.renderer.zoomAt(e.clientX, e.clientY, factor);
  }

  _handleTap(sx, sy) {
    const now = performance.now();
    this.tapTimes = this.tapTimes.filter(t => now - t < CONFIG.TRIPLE_TAP_MS);
    this.tapTimes.push(now);

    const corner = CONFIG.TRIPLE_TAP_CORNER_PX;
    if (this.tapTimes.length >= 3 &&
        sx > window.innerWidth - corner && sy < corner) {
      this.tapTimes = [];
      this._emit('tripletap-debug');
      return;
    }

    const w = this.renderer.screenToWorld(sx, sy);
    this._emit('tap', w.x, w.y, sx, sy);
  }

  _handleLongPress(sx, sy) {
    if (navigator.vibrate) try { navigator.vibrate(25); } catch (_) {}
    const w = this.renderer.screenToWorld(sx, sy);
    this._emit('longpress', w.x, w.y, sx, sy);
  }
}
