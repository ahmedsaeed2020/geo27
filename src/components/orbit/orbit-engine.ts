// One animation driver for every "sun" orbit on the site (home first fold and the product orbit navigation).
// The markup is rendered by React (so module links exist on the server and work without the animation); this driver
// only moves what is already there: `[data-orbit-chip]` links in ring order, `[data-orbit-ring]` ellipses,
// `[data-orbit-core]` and an `svg[data-orbit-lines]` it fills with one spoke and travelling pulse per chip.
// Rotation eases to a stop while a module is hovered, focused or highlighted from outside, so it can be read and
// clicked; it runs only while on screen, with the tab visible and not paused, and is static under reduced motion.

export type OrbitRing = {
  /** Horizontal / vertical radius as a fraction of the geometry scale (sx / sy). */
  rx: number;
  ry: number;
  /** Seconds per revolution. */
  period: number;
  /** Starting angle offset in radians. */
  offset: number;
  count: number;
};

export type OrbitGeometry = (width: number, height: number) => { cx: number; cy: number; sx: number; sy: number };

export type OrbitOptions = {
  rings: OrbitRing[];
  geometry: OrbitGeometry;
  /** Pull, scale and glow towards the pointer, plus a slight core drift (home first fold). */
  parallax?: boolean;
  /** Soften chips on the far side of the orbit. */
  depthBlur?: boolean;
  /** Opacity and scale of a chip at the far side; the near side is always 1 / minScale + scaleRange. */
  minOpacity?: number;
  minScale?: number;
  scaleRange?: number;
  /** Duration of the entrance in which chips travel out from the core (0 disables it). */
  introMs?: number;
  line?: string;
  pulse?: string;
  /** Called when the highlighted chip changes (-1 for none). */
  onActive?: (index: number) => void;
  /** Extra per-frame styling (home glow). */
  decorate?: (el: HTMLElement, state: { depth: number; influence: number; active: boolean }) => void;
};

export type OrbitHandle = {
  setPaused: (paused: boolean) => void;
  /** Highlights a chip from outside (legend hover/focus); -1 clears it. */
  setActive: (index: number) => void;
  destroy: () => void;
};

const TAU = Math.PI * 2;
const SVGNS = 'http://www.w3.org/2000/svg';
const ease = (x: number) => 1 - Math.pow(1 - x, 3);

/** Resting angle of chip `j` on a ring, shared by the server-rendered position and the driver. */
export const restingAngle = (ring: OrbitRing, j: number) => (j / Math.max(1, ring.count)) * TAU + ring.offset;

/** Chip index → [ring, index on ring], in ring order. */
export function chipSlots(rings: OrbitRing[]): { ring: number; j: number }[] {
  return rings.flatMap((ring, r) => Array.from({ length: ring.count }, (_, j) => ({ ring: r, j })));
}

export function startOrbit(root: HTMLElement, opts: OrbitOptions): OrbitHandle {
  const { rings, geometry } = opts;
  const minOpacity = opts.minOpacity ?? 0.4;
  const minScale = opts.minScale ?? 0.58;
  const scaleRange = opts.scaleRange ?? 0.54;
  const introMs = opts.introMs ?? 1700;
  const chipsEls = Array.from(root.querySelectorAll<HTMLElement>('[data-orbit-chip]'));
  const ringEls = Array.from(root.querySelectorAll<HTMLElement>('[data-orbit-ring]'));
  const core = root.querySelector<HTMLElement>('[data-orbit-core]');
  const svg = root.querySelector<SVGSVGElement>('svg[data-orbit-lines]');
  const slots = chipSlots(rings);

  type Chip = { el: HTMLElement; line: SVGLineElement | null; pulse: SVGCircleElement | null; ring: number; base: number; phase: number };
  const chips: Chip[] = slots.slice(0, chipsEls.length).map((slot, i) => {
    let line: SVGLineElement | null = null;
    let pulse: SVGCircleElement | null = null;
    if (svg) {
      line = document.createElementNS(SVGNS, 'line');
      line.setAttribute('stroke', opts.line ?? '#34D399');
      line.setAttribute('stroke-width', '1');
      svg.appendChild(line);
      pulse = document.createElementNS(SVGNS, 'circle');
      pulse.setAttribute('r', '2.2');
      pulse.setAttribute('fill', opts.pulse ?? '#8FF7C8');
      svg.appendChild(pulse);
    }
    return { el: chipsEls[i]!, line, pulse, ring: slot.ring, base: restingAngle(rings[slot.ring]!, slot.j), phase: (i * 0.618) % 1 };
  });

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, cx = 0, cy = 0, sx = 0, sy = 0;
  let paused = false;
  let onScreen = true;
  let raf = 0;
  let clock = 0;
  let last = 0;
  let speed = 1;
  let introStart = -1;
  let hovered = -1;
  let external = -1;
  let shown = -2;
  const activeIndex = () => (hovered >= 0 ? hovered : external);

  function resize() {
    const r = root.getBoundingClientRect();
    W = r.width; H = r.height;
    ({ cx, cy, sx, sy } = geometry(W, H));
    if (svg) { svg.setAttribute('width', String(W)); svg.setAttribute('height', String(H)); }
    ringEls.forEach((el, i) => {
      const ring = rings[i];
      if (!ring) return;
      el.style.width = `${ring.rx * sx * 2}px`;
      el.style.height = `${ring.ry * sy * 2}px`;
    });
    draw();
  }

  // Pointer tracking for the parallax pull.
  let mX: number | null = null, mY: number | null = null, tgX = 0, tgY = 0, curX = 0, curY = 0;
  function track(clientX: number, clientY: number) {
    const r = root.getBoundingClientRect();
    const x = clientX - r.left, y = clientY - r.top;
    if (x >= -80 && y >= -80 && x <= r.width + 80 && y <= r.height + 80) {
      mX = x; mY = y; tgX = (x / r.width - 0.5) * 2; tgY = (y / r.height - 0.5) * 2;
    } else { mX = mY = null; tgX = 0; tgY = 0; }
    draw();
  }
  const onPointer = (e: PointerEvent) => track(e.clientX, e.clientY);
  const onTouch = (e: TouchEvent) => { const t = e.touches[0]; if (t) track(t.clientX, t.clientY); };
  const onBlur = () => { mX = mY = null; tgX = 0; tgY = 0; draw(); };
  if (opts.parallax) {
    window.addEventListener('pointermove', onPointer, { passive: true });
    window.addEventListener('touchmove', onTouch, { passive: true });
    window.addEventListener('blur', onBlur);
  }

  // Hover and keyboard focus on a chip stop the rotation and show its name.
  const listeners = chips.map((c, i) => {
    const enter = () => { hovered = i; draw(); };
    const leave = () => { if (hovered === i) hovered = -1; draw(); };
    c.el.addEventListener('pointerenter', enter);
    c.el.addEventListener('pointerleave', leave);
    c.el.addEventListener('focus', enter);
    c.el.addEventListener('blur', leave);
    return { el: c.el, enter, leave };
  });

  const running = () => onScreen && !paused && document.visibilityState === 'visible';

  function frame(ts: number) {
    raf = 0;
    if (introStart < 0) introStart = ts;
    const dt = last ? Math.min(ts - last, 50) : 0;
    last = ts;
    const active = activeIndex();
    // Ease the rotation to a stop while a module is highlighted, and back up afterwards.
    speed += ((active >= 0 ? 0 : 1) - speed) * 0.12;
    if (running() && !reduce) clock += dt * speed;
    const t = clock / 1000;
    const intro = reduce || introMs <= 0 ? 1 : Math.min(1, (ts - introStart) / introMs);
    curX += (tgX - curX) * 0.08;
    curY += (tgY - curY) * 0.08;
    if (core && opts.parallax) core.style.transform = `translate(-50%,-50%) translate(${(curX * -18).toFixed(1)}px,${(curY * -14).toFixed(1)}px)`;
    if (active !== shown) {
      chips.forEach((c, i) => c.el.toggleAttribute('data-active', i === active));
      root.toggleAttribute('data-orbit-focus', active >= 0);
      shown = active;
      opts.onActive?.(active);
    }
    for (let i = 0; i < chips.length; i++) {
      const c = chips[i]!;
      const ring = rings[c.ring]!;
      const ang = c.base - (t / ring.period) * TAU;
      const depth = (Math.sin(ang) + 1) / 2;
      const par = 1 + c.ring * 0.9;
      const arrive = ease(Math.min(1, Math.max(0, intro * 1.35 - c.ring * 0.17)));
      const reach = 0.3 + 0.7 * arrive;
      let px = cx + Math.cos(ang) * ring.rx * sx * reach;
      let py = cy + Math.sin(ang) * ring.ry * sy * reach;
      if (opts.parallax) {
        px += curX * 32 * par * (0.5 + depth * 0.5);
        py += curY * 24 * par * (0.5 + depth * 0.5);
      }
      let scale = (minScale + depth * scaleRange) * (0.6 + 0.4 * arrive);
      let op = (minOpacity + depth * (1 - minOpacity)) * arrive;
      let influence = 0;
      if (opts.parallax && mX != null && mY != null) {
        const dx = mX - px, dy = mY - py, dist = Math.sqrt(dx * dx + dy * dy);
        influence = Math.max(0, 1 - dist / 190);
        px += dx * 0.045 * influence;
        py += dy * 0.045 * influence;
        scale *= 1 + 0.28 * influence;
        op = Math.min(1, op + 0.28 * influence);
      }
      const isActive = i === active;
      if (isActive) { scale = Math.max(scale * 1.12, 1.08); op = 1; influence = Math.max(influence, 1); }
      c.el.style.transform = `translate(-50%,-50%) translate(${px.toFixed(1)}px,${py.toFixed(1)}px) scale(${scale.toFixed(3)})`;
      c.el.style.opacity = op.toFixed(3);
      c.el.style.zIndex = String(isActive ? 500 : (influence > 0.35 ? 300 : 0) + (depth >= 0.5 ? 90 + Math.round(depth * 10) : 60 + Math.round(depth * 20)));
      if (opts.depthBlur) c.el.style.filter = depth < 0.5 && influence < 0.15 ? `blur(${((0.5 - depth) * 2.4).toFixed(2)}px)` : 'none';
      opts.decorate?.(c.el, { depth, influence, active: isActive });
      if (c.line && c.pulse) {
        c.line.setAttribute('x1', String(cx)); c.line.setAttribute('y1', String(cy));
        c.line.setAttribute('x2', px.toFixed(1)); c.line.setAttribute('y2', py.toFixed(1));
        c.line.setAttribute('stroke-opacity', (isActive ? 0.7 : (0.05 + depth * 0.14 + influence * 0.28) * arrive).toFixed(3));
        c.line.setAttribute('stroke-width', isActive ? '1.6' : '1');
        const prog = (t / 3.4 + c.phase) % 1;
        c.pulse.setAttribute('cx', (px + (cx - px) * prog).toFixed(1));
        c.pulse.setAttribute('cy', (py + (cy - py) * prog).toFixed(1));
        c.pulse.setAttribute('r', (1.4 + depth * 1.8 + influence * 1.2).toFixed(2));
        c.pulse.setAttribute('fill-opacity', ((0.15 + depth * 0.7 + influence * 0.35) * (1 - prog) * arrive).toFixed(3));
      }
    }
    const settling = Math.abs(speed - (active >= 0 ? 0 : 1)) > 0.01 || intro < 1 || Math.abs(tgX - curX) > 0.002 || Math.abs(tgY - curY) > 0.002;
    if (running() && (!reduce || settling)) raf = requestAnimationFrame(frame);
    else last = 0;
  }

  function draw() { if (!raf) raf = requestAnimationFrame(frame); }

  let ro: ResizeObserver | null = null;
  if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(resize); ro.observe(root); }
  else window.addEventListener('resize', resize);
  const visibility = new IntersectionObserver(([entry]) => { onScreen = Boolean(entry?.isIntersecting); draw(); });
  visibility.observe(root);
  document.addEventListener('visibilitychange', draw);
  resize();

  return {
    setPaused(next) { paused = next; draw(); },
    setActive(index) { external = index; draw(); },
    destroy() {
      cancelAnimationFrame(raf);
      raf = 0;
      visibility.disconnect();
      document.removeEventListener('visibilitychange', draw);
      ro?.disconnect();
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('touchmove', onTouch);
      window.removeEventListener('blur', onBlur);
      listeners.forEach(({ el, enter, leave }) => {
        el.removeEventListener('pointerenter', enter);
        el.removeEventListener('pointerleave', leave);
        el.removeEventListener('focus', enter);
        el.removeEventListener('blur', leave);
      });
      chips.forEach(c => { c.line?.remove(); c.pulse?.remove(); });
    },
  };
}
