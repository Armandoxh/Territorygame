import type { Camera } from './camera';

const TAP_SLOP = 10; // px of finger travel before a touch becomes a pan

/**
 * One finger drag = pan, two finger pinch = zoom, wheel = zoom.
 * A touch that never moves past TAP_SLOP is reported as a tap.
 */
export function attachInput(el: HTMLElement, cam: Camera, onTap: (sx: number, sy: number) => void): void {
  const pts = new Map<number, { x: number; y: number }>();
  let start: { x: number; y: number } | null = null;
  let panning = false;
  let pinchDist = 0;

  el.addEventListener('pointerdown', (e) => {
    el.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 1) {
      start = { x: e.clientX, y: e.clientY };
      panning = false;
    } else {
      start = null; // a second finger cancels any tap
      pinchDist = pinchSpan();
    }
  });

  el.addEventListener('pointermove', (e) => {
    const prev = pts.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    if (pts.size === 1) {
      if (!panning && start && Math.hypot(cur.x - start.x, cur.y - start.y) > TAP_SLOP) panning = true;
      if (panning) cam.panBy(cur.x - prev.x, cur.y - prev.y);
      pts.set(e.pointerId, cur);
    } else if (pts.size === 2) {
      const before = midpoint();
      pts.set(e.pointerId, cur);
      const after = midpoint();
      const d = pinchSpan();
      if (pinchDist > 0) cam.zoomAt(d / pinchDist, after.x, after.y);
      cam.panBy(after.x - before.x, after.y - before.y);
      pinchDist = d;
    }
  });

  const end = (e: PointerEvent) => {
    if (!pts.has(e.pointerId)) return;
    pts.delete(e.pointerId);
    if (pts.size === 0 && start && !panning && e.type === 'pointerup') onTap(e.clientX, e.clientY);
    if (pts.size === 1) pinchDist = 0;
    if (pts.size === 0) start = null;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    cam.zoomAt(Math.pow(1.0015, -e.deltaY), e.clientX, e.clientY);
  }, { passive: false });

  function midpoint() {
    const [a, b] = [...pts.values()];
    return { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
  }
  function pinchSpan() {
    const [a, b] = [...pts.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}
