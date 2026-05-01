import type { Renderer } from '../render/Renderer.js';

export type InputCallbacks = {
  onTap?: (wx: number, wy: number, sx: number, sy: number) => void;
  onLongPress?: (wx: number, wy: number, sx: number, sy: number) => void;
  onTripleTapCorner?: () => void;
};

interface Pointer {
  startX: number; startY: number;
  x: number; y: number;
  startTime: number;
  moved: boolean;
  consumed: boolean;
  longPressTimer: ReturnType<typeof setTimeout> | null;
}

const TAP_MAX_MOVE = 18;
const TAP_MAX_DURATION = 450;
const LONGPRESS_MS = 500;
const TRIPLE_TAP_MS = 700;
const TRIPLE_TAP_CORNER_PX = 100;

export class PointerInput {
  private readonly target: HTMLElement;
  private readonly renderer: Renderer;
  private readonly cb: InputCallbacks;
  private readonly pointers = new Map<number, Pointer>();
  private pinchStart = 0;
  private tapTimes: number[] = [];

  constructor(target: HTMLElement, renderer: Renderer, cb: InputCallbacks) {
    this.target = target;
    this.renderer = renderer;
    this.cb = cb;

    target.addEventListener('pointerdown', (e) => this._onDown(e));
    target.addEventListener('pointermove', (e) => this._onMove(e));
    target.addEventListener('pointerup',   (e) => this._onUp(e));
    target.addEventListener('pointercancel', (e) => this._onUp(e));
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener('wheel', (e) => this._onWheel(e), { passive: false });
    // Block iOS Safari pinch-zoom / double-tap-zoom
    target.addEventListener('gesturestart',  (e) => e.preventDefault());
    target.addEventListener('gesturechange', (e) => e.preventDefault());
    target.addEventListener('gestureend',    (e) => e.preventDefault());
  }

  private _onDown(e: PointerEvent): void {
    e.preventDefault();
    try { this.target.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const p: Pointer = {
      startX: e.clientX, startY: e.clientY,
      x: e.clientX, y: e.clientY,
      startTime: performance.now(),
      moved: false,
      consumed: false,
      longPressTimer: null,
    };
    this.pointers.set(e.pointerId, p);

    if (this.pointers.size === 2) {
      const arr = Array.from(this.pointers.values());
      const a = arr[0]!, b = arr[1]!;
      this.pinchStart = Math.hypot(a.x - b.x, a.y - b.y);
      // Two fingers cancel any pending long-press
      for (const q of this.pointers.values()) {
        if (q.longPressTimer) { clearTimeout(q.longPressTimer); q.longPressTimer = null; }
      }
    } else {
      p.longPressTimer = setTimeout(() => {
        p.longPressTimer = null;
        if (p.moved) return;
        if (this.pointers.size !== 1) return;
        p.consumed = true;
        if (navigator.vibrate) try { navigator.vibrate(25); } catch { /* ignore */ }
        const w = this.renderer.screenToWorld(p.startX, p.startY);
        this.cb.onLongPress?.(w.x, w.y, p.startX, p.startY);
      }, LONGPRESS_MS);
    }
  }

  private _onMove(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.abs(e.clientX - p.startX) > TAP_MAX_MOVE ||
        Math.abs(e.clientY - p.startY) > TAP_MAX_MOVE) {
      p.moved = true;
      if (p.longPressTimer) { clearTimeout(p.longPressTimer); p.longPressTimer = null; }
    }

    if (this.pointers.size === 1) {
      this.renderer.pan(dx, dy);
    } else if (this.pointers.size === 2) {
      const arr = Array.from(this.pointers.values());
      const a = arr[0]!, b = arr[1]!;
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

  private _onUp(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    if (p.longPressTimer) { clearTimeout(p.longPressTimer); p.longPressTimer = null; }
    const duration = performance.now() - p.startTime;
    const wasTap = !p.moved && !p.consumed && duration < TAP_MAX_DURATION;
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinchStart = 0;
    if (wasTap) this._handleTap(p.startX, p.startY);
  }

  private _onWheel(e: WheelEvent): void {
    e.preventDefault();
    const factor = Math.exp(-e.deltaY * 0.0015);
    this.renderer.zoomAt(e.clientX, e.clientY, factor);
  }

  private _handleTap(sx: number, sy: number): void {
    const now = performance.now();
    this.tapTimes = this.tapTimes.filter((t) => now - t < TRIPLE_TAP_MS);
    this.tapTimes.push(now);

    if (this.tapTimes.length >= 3 &&
        sx > window.innerWidth - TRIPLE_TAP_CORNER_PX && sy < TRIPLE_TAP_CORNER_PX) {
      this.tapTimes = [];
      this.cb.onTripleTapCorner?.();
      return;
    }
    const w = this.renderer.screenToWorld(sx, sy);
    this.cb.onTap?.(w.x, w.y, sx, sy);
  }
}
