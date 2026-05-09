import type { Camera } from './camera';

// A drag handler can hijack a single pointer when it starts on the handler's
// hit area. While that pointer is active, pan/pinch are suppressed and any
// additional pointers are ignored — "lock the camera while dragging."
export interface DragHandler {
  hitTest(sx: number, sy: number): boolean;
  onStart(sx: number, sy: number): void;
  onMove(sx: number, sy: number): void;
  onEnd(sx: number, sy: number): void;
}

export interface AttachInputOpts {
  target: HTMLCanvasElement;
  camera: Camera;
  getViewport: () => { w: number; h: number };
  getDragHandler?: () => DragHandler | null;
  // When true: pinch, wheel, +/- keys ignored (zoom locked); drag-handler
  // hit-tests skipped (army not draggable). Single-pointer pan still
  // works. Used to honor "pan free, zoom locked" behavior during battle.
  getZoomLocked?: () => boolean;
}

export function attachInput(opts: AttachInputOpts) {
  const { target, camera, getViewport, getDragHandler, getZoomLocked } = opts;

  const pointers = new Map<number, { x: number; y: number }>();
  let lastPinchDist = 0;
  let dragPointerId: number | null = null;

  target.addEventListener('pointerdown', (e) => {
    // Already dragging the army — ignore extra pointers entirely.
    if (dragPointerId !== null) return;

    const handler = getDragHandler?.() ?? null;
    const zoomLocked = getZoomLocked?.() ?? false;
    if (handler && !zoomLocked && pointers.size === 0 && handler.hitTest(e.clientX, e.clientY)) {
      target.setPointerCapture(e.pointerId);
      dragPointerId = e.pointerId;
      handler.onStart(e.clientX, e.clientY);
      return;
    }

    target.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const vals = [...pointers.values()];
      const a = vals[0]!;
      const b = vals[1]!;
      lastPinchDist = Math.hypot(b.x - a.x, b.y - a.y);
    }
  });

  target.addEventListener('pointermove', (e) => {
    if (dragPointerId === e.pointerId) {
      const handler = getDragHandler?.() ?? null;
      handler?.onMove(e.clientX, e.clientY);
      return;
    }
    if (dragPointerId !== null) return;

    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.size === 1) {
      camera.panBy(dx, dy);
      return;
    }

    if (pointers.size === 2) {
      // Pinch-zoom is suppressed when zoom is locked.
      if (getZoomLocked?.()) return;
      const vals = [...pointers.values()];
      const a = vals[0]!;
      const b = vals[1]!;
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      if (lastPinchDist > 0) {
        const factor = dist / lastPinchDist;
        const fx = (a.x + b.x) / 2;
        const fy = (a.y + b.y) / 2;
        const vp = getViewport();
        camera.zoomAt(factor, fx, fy, vp.w, vp.h);
      }
      lastPinchDist = dist;
    }
  });

  function endPointer(e: PointerEvent) {
    if (dragPointerId === e.pointerId) {
      const handler = getDragHandler?.() ?? null;
      handler?.onEnd(e.clientX, e.clientY);
      dragPointerId = null;
      return;
    }
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinchDist = 0;
  }
  target.addEventListener('pointerup', endPointer);
  target.addEventListener('pointercancel', endPointer);

  // Mouse wheel — zoom around cursor.
  target.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (getZoomLocked?.()) return;
    // 1.0015^-deltaY: ~14% zoom-out per 100-px notch, smooth on trackpad.
    const factor = Math.pow(1.0015, -e.deltaY);
    const vp = getViewport();
    camera.zoomAt(factor, e.clientX, e.clientY, vp.w, vp.h);
  }, { passive: false });

  // Keyboard — zoom around screen center.
  window.addEventListener('keydown', (e) => {
    if (getZoomLocked?.()) return;
    let factor = 1;
    if (e.key === '+' || e.key === '=') factor = 1.2;
    else if (e.key === '-' || e.key === '_') factor = 1 / 1.2;
    else return;
    const vp = getViewport();
    camera.zoomAt(factor, vp.w / 2, vp.h / 2, vp.w, vp.h);
  });
}
