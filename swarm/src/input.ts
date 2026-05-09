import type { Camera } from './camera';

export interface AttachInputOpts {
  target: HTMLCanvasElement;
  camera: Camera;
  getViewport: () => { w: number; h: number };
}

export function attachInput(opts: AttachInputOpts) {
  const { target, camera, getViewport } = opts;

  const pointers = new Map<number, { x: number; y: number }>();
  let lastPinchDist = 0;

  target.addEventListener('pointerdown', (e) => {
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
    pointers.delete(e.pointerId);
    if (pointers.size < 2) lastPinchDist = 0;
  }
  target.addEventListener('pointerup', endPointer);
  target.addEventListener('pointercancel', endPointer);

  // Mouse wheel — zoom around cursor.
  target.addEventListener('wheel', (e) => {
    e.preventDefault();
    // 1.0015^-deltaY: ~14% zoom-out per 100-px notch, smooth on trackpad.
    const factor = Math.pow(1.0015, -e.deltaY);
    const vp = getViewport();
    camera.zoomAt(factor, e.clientX, e.clientY, vp.w, vp.h);
  }, { passive: false });

  // Keyboard — zoom around screen center.
  window.addEventListener('keydown', (e) => {
    let factor = 1;
    if (e.key === '+' || e.key === '=') factor = 1.2;
    else if (e.key === '-' || e.key === '_') factor = 1 / 1.2;
    else return;
    const vp = getViewport();
    camera.zoomAt(factor, vp.w / 2, vp.h / 2, vp.w, vp.h);
  });
}
