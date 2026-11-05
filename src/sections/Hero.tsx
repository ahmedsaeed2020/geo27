import { useLocale, localizeTree } from "@/lib/i18n";
import { useEffect, useRef } from "react";

const DIGIT_ICON =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiB3aWR0aD0iNTEyIiBoZWlnaHQ9IjUxMiIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJEaWdpdCI+CiAgPHJlY3QgeD0iMTgiIHk9IjIyLjUiIHdpZHRoPSI0MCIgaGVpZ2h0PSIxMyIgcng9IjYuNSIgZmlsbD0iI0ZGRkZGRiI+PC9yZWN0PgogIDxyZWN0IHg9IjYzIiB5PSIyMi41IiB3aWR0aD0iMTkiIGhlaWdodD0iMTMiIHJ4PSI1IiBmaWxsPSIjMzREMzk5Ij48L3JlY3Q+CiAgPHJlY3QgeD0iMTgiIHk9IjQzLjUiIHdpZHRoPSI2NCIgaGVpZ2h0PSIxMyIgcng9IjYuNSIgZmlsbD0iI0ZGRkZGRiI+PC9yZWN0PgogIDxyZWN0IHg9IjE4IiB5PSI2NC41IiB3aWR0aD0iNTAiIGhlaWdodD0iMTMiIHJ4PSI2LjUiIGZpbGw9IiNGRkZGRkYiPjwvcmVjdD4KPC9zdmc+";

const ICONS: Record<string, string> = {
  accounts:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJBY2NvdW50cyI+CiAgPHJlY3QgeD0iMjIiIHk9IjM0IiB3aWR0aD0iNDQiIGhlaWdodD0iMTIiIHJ4PSI2IiBmaWxsPSIjRkZGRkZGIj48L3JlY3Q+CiAgPHJlY3QgeD0iNzAiIHk9IjM0IiB3aWR0aD0iMTQiIGhlaWdodD0iMTIiIHJ4PSI1IiBmaWxsPSIjMzREMzk5Ij48L3JlY3Q+CiAgPHJlY3QgeD0iMjIiIHk9IjU0IiB3aWR0aD0iNDQiIGhlaWdodD0iMTIiIHJ4PSI2IiBmaWxsPSIjRkZGRkZGIj48L3JlY3Q+CiAgPHJlY3QgeD0iNzAiIHk9IjU0IiB3aWR0aD0iMTQiIGhlaWdodD0iMTIiIHJ4PSI1IiBmaWxsPSIjRkZGRkZGIj48L3JlY3Q+Cjwvc3ZnPg==",
  crm: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJjcm0iPgogIDxyZWN0IHg9IjIyIiB5PSIyOCIgd2lkdGg9IjU2IiBoZWlnaHQ9IjEyIiByeD0iNiIgZmlsbD0iI0ZGRkZGRiI+PC9yZWN0PgogIDxyZWN0IHg9IjMyIiB5PSI0OCIgd2lkdGg9IjM2IiBoZWlnaHQ9IjEyIiByeD0iNiIgZmlsbD0iI0ZGRkZGRiI+PC9yZWN0PgogIDxyZWN0IHg9IjQxIiB5PSI2OCIgd2lkdGg9IjE4IiBoZWlnaHQ9IjEyIiByeD0iNiIgZmlsbD0iIzM0RDM5OSI+PC9yZWN0Pgo8L3N2Zz4=",
  einvoicing:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJlaW52b2ljaW5nIj4KICA8cmVjdCB4PSIyMiIgeT0iMjgiIHdpZHRoPSIzNCIgaGVpZ2h0PSI5IiByeD0iNC41IiBmaWxsPSIjRkZGRkZGIj48L3JlY3Q+CiAgPHJlY3QgeD0iMjIiIHk9IjQ0IiB3aWR0aD0iMzQiIGhlaWdodD0iOSIgcng9IjQuNSIgZmlsbD0iI0ZGRkZGRiI+PC9yZWN0PgogIDxyZWN0IHg9IjIyIiB5PSI2MCIgd2lkdGg9IjI0IiBoZWlnaHQ9IjkiIHJ4PSI0LjUiIGZpbGw9IiNGRkZGRkYiPjwvcmVjdD4KICA8cmVjdCB4PSI1OCIgeT0iNTIiIHdpZHRoPSIyMiIgaGVpZ2h0PSIyMiIgcng9IjUiIGZpbGw9IiMzNEQzOTkiPjwvcmVjdD4KPC9zdmc+",
  financial:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJmaW5hbmNpYWwiPgogIDxyZWN0IHg9IjI0IiB5PSIyNiIgd2lkdGg9IjUyIiBoZWlnaHQ9IjExIiByeD0iNS41IiBmaWxsPSIjRkZGRkZGIj48L3JlY3Q+CiAgPHJlY3QgeD0iMjQiIHk9IjQyIiB3aWR0aD0iMzYiIGhlaWdodD0iMTEiIHJ4PSI1LjUiIGZpbGw9IiNGRkZGRkYiPjwvcmVjdD4KICA8cmVjdCB4PSIyNCIgeT0iNTgiIHdpZHRoPSI0NCIgaGVpZ2h0PSIxMSIgcng9IjUuNSIgZmlsbD0iI0ZGRkZGRiI+PC9yZWN0PgogIDxyZWN0IHg9IjI0IiB5PSI3NSIgd2lkdGg9IjUyIiBoZWlnaHQ9IjgiIHJ4PSI0IiBmaWxsPSIjMzREMzk5Ij48L3JlY3Q+Cjwvc3ZnPg==",
  hr: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJociI+CiAgPGNpcmNsZSBjeD0iMzMiIGN5PSIzNCIgcj0iMTAiIGZpbGw9IiNGRkZGRkYiPjwvY2lyY2xlPgogIDxjaXJjbGUgY3g9IjY3IiBjeT0iMzQiIHI9IjEwIiBmaWxsPSIjMzREMzk5Ij48L2NpcmNsZT4KICA8cmVjdCB4PSIxOCIgeT0iNTIiIHdpZHRoPSIzMCIgaGVpZ2h0PSIyMCIgcng9IjEwIiBmaWxsPSIjRkZGRkZGIj48L3JlY3Q+CiAgPHJlY3QgeD0iNTIiIHk9IjUyIiB3aWR0aD0iMzAiIGhlaWdodD0iMjAiIHJ4PSIxMCIgZmlsbD0iI0ZGRkZGRiI+PC9yZWN0Pgo8L3N2Zz4=",
  inventory:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJJbnZlbnRvcnkiPgogIDxyZWN0IHg9IjI0IiB5PSIyNCIgd2lkdGg9IjI2IiBoZWlnaHQ9IjI2IiByeD0iNSIgZmlsbD0iI0ZGRkZGRiI+PC9yZWN0PgogIDxyZWN0IHg9IjU2IiB5PSIyNCIgd2lkdGg9IjI2IiBoZWlnaHQ9IjI2IiByeD0iNSIgZmlsbD0iI0ZGRkZGRiI+PC9yZWN0PgogIDxyZWN0IHg9IjI0IiB5PSI1NiIgd2lkdGg9IjI2IiBoZWlnaHQ9IjI2IiByeD0iNSIgZmlsbD0iI0ZGRkZGRiI+PC9yZWN0PgogIDxyZWN0IHg9IjU2IiB5PSI1NiIgd2lkdGg9IjI2IiBoZWlnaHQ9IjI2IiByeD0iNSIgZmlsbD0iIzM0RDM5OSI+PC9yZWN0Pgo8L3N2Zz4=",
  manufacturing:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJtYW51ZmFjdHVyaW5nIj4KICA8cmVjdCB4PSIyMCIgeT0iNTAiIHdpZHRoPSI2MCIgaGVpZ2h0PSIzMCIgcng9IjUiIGZpbGw9IiNGRkZGRkYiPjwvcmVjdD4KICA8cG9seWdvbiBwb2ludHM9IjIwLDUwIDIwLDM2IDM4LDUwIDM4LDM2IDU2LDUwIiBmaWxsPSIjRkZGRkZGIj48L3BvbHlnb24+CiAgPHJlY3QgeD0iNjIiIHk9IjI2IiB3aWR0aD0iMTEiIGhlaWdodD0iMjIiIHJ4PSI0IiBmaWxsPSIjRkZGRkZGIj48L3JlY3Q+CiAgPHJlY3QgeD0iNDQiIHk9IjYwIiB3aWR0aD0iMTIiIGhlaWdodD0iMTIiIHJ4PSIzIiBmaWxsPSIjMzREMzk5Ij48L3JlY3Q+Cjwvc3ZnPg==",
  pos: "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJwb3MiPgogIDxyZWN0IHg9IjI4IiB5PSIyNCIgd2lkdGg9IjQ0IiBoZWlnaHQ9IjM0IiByeD0iNyIgZmlsbD0iI0ZGRkZGRiI+PC9yZWN0PgogIDxyZWN0IHg9IjM4IiB5PSIzMiIgd2lkdGg9IjI0IiBoZWlnaHQ9IjgiIHJ4PSI0IiBmaWxsPSIjMzREMzk5Ij48L3JlY3Q+CiAgPHJlY3QgeD0iMjIiIHk9IjY2IiB3aWR0aD0iNTYiIGhlaWdodD0iMTIiIHJ4PSI2IiBmaWxsPSIjRkZGRkZGIj48L3JlY3Q+Cjwvc3ZnPg==",
  projects:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJwcm9qZWN0cyI+CiAgPHJlY3QgeD0iMjIiIHk9IjI4IiB3aWR0aD0iMzgiIGhlaWdodD0iMTEiIHJ4PSI1LjUiIGZpbGw9IiNGRkZGRkYiPjwvcmVjdD4KICA8cmVjdCB4PSI0MCIgeT0iNDUiIHdpZHRoPSI0MCIgaGVpZ2h0PSIxMSIgcng9IjUuNSIgZmlsbD0iIzM0RDM5OSI+PC9yZWN0PgogIDxyZWN0IHg9IjMwIiB5PSI2MiIgd2lkdGg9IjM0IiBoZWlnaHQ9IjExIiByeD0iNS41IiBmaWxsPSIjRkZGRkZGIj48L3JlY3Q+Cjwvc3ZnPg==",
  purchases:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJQdXJjaGFzZXMiPgogIDxyZWN0IHg9IjI0IiB5PSIzMCIgd2lkdGg9IjE0IiBoZWlnaHQ9IjQ4IiByeD0iNSIgZmlsbD0iIzM0RDM5OSI+PC9yZWN0PgogIDxyZWN0IHg9IjQzIiB5PSI0NiIgd2lkdGg9IjE0IiBoZWlnaHQ9IjMyIiByeD0iNSIgZmlsbD0iI0ZGRkZGRiI+PC9yZWN0PgogIDxyZWN0IHg9IjYyIiB5PSI1OCIgd2lkdGg9IjE0IiBoZWlnaHQ9IjIwIiByeD0iNSIgZmlsbD0iI0ZGRkZGRiI+PC9yZWN0Pgo8L3N2Zz4=",
  reports:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJyZXBvcnRzIj4KICA8cmVjdCB4PSIyMiIgeT0iMjQiIHdpZHRoPSI1NiIgaGVpZ2h0PSIxMCIgcng9IjUiIGZpbGw9IiNGRkZGRkYiPjwvcmVjdD4KICA8cmVjdCB4PSIyMiIgeT0iNDAiIHdpZHRoPSIyNiIgaGVpZ2h0PSIzNiIgcng9IjYiIGZpbGw9IiNGRkZGRkYiPjwvcmVjdD4KICA8cmVjdCB4PSI1NCIgeT0iNDAiIHdpZHRoPSIyNCIgaGVpZ2h0PSIxNiIgcng9IjUiIGZpbGw9IiMzNEQzOTkiPjwvcmVjdD4KICA8cmVjdCB4PSI1NCIgeT0iNjAiIHdpZHRoPSIyNCIgaGVpZ2h0PSIxNiIgcng9IjUiIGZpbGw9IiNGRkZGRkYiPjwvcmVjdD4KPC9zdmc+",
  sales:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIiB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgcm9sZT0iaW1nIiBhcmlhLWxhYmVsPSJTYWxlcyI+CiAgPHJlY3QgeD0iMjQiIHk9IjU4IiB3aWR0aD0iMTQiIGhlaWdodD0iMjAiIHJ4PSI1IiBmaWxsPSIjRkZGRkZGIj48L3JlY3Q+CiAgPHJlY3QgeD0iNDMiIHk9IjQ2IiB3aWR0aD0iMTQiIGhlaWdodD0iMzIiIHJ4PSI1IiBmaWxsPSIjRkZGRkZGIj48L3JlY3Q+CiAgPHJlY3QgeD0iNjIiIHk9IjMwIiB3aWR0aD0iMTQiIGhlaWdodD0iNDgiIHJ4PSI1IiBmaWxsPSIjMzREMzk5Ij48L3JlY3Q+Cjwvc3ZnPg==",
};

const RINGS = [
  { rx: 0.205, ry: 0.095, period: 74, offset: 0.0, mods: ["financial", "sales", "inventory"] },
  { rx: 0.315, ry: 0.14, period: 104, offset: 0.6, mods: ["accounts", "purchases", "hr", "crm"] },
  { rx: 0.435, ry: 0.18, period: 150, offset: 1.2, mods: ["pos", "manufacturing", "projects", "einvoicing", "reports"] },
];

function OrbitBackground({ paused }: { paused: boolean }) {
  const locale = useLocale();
  const rootRef = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(paused);
  const wakeRef = useRef<() => void>(() => {});
  useEffect(() => {
    pausedRef.current = paused;
    wakeRef.current();
  }, [paused]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const SVGNS = "http://www.w3.org/2000/svg";
    const system = root.querySelector<HTMLDivElement>(".dgt-system")!;
    const svg = root.querySelector<SVGSVGElement>(".dgt-lines")!;
    const ringEls = root.querySelectorAll<HTMLDivElement>(".dgt-ring");
    const core = root.querySelector<HTMLDivElement>(".dgt-core")!;

    type Chip = {
      el: HTMLDivElement; line: SVGLineElement; pulse: SVGCircleElement;
      ring: number; base: number; period: number; phase: number;
    };
    const chips: Chip[] = [];
    RINGS.forEach((ring, ri) => {
      const count = ring.mods.length;
      ring.mods.forEach((mod, j) => {
        const el = document.createElement("div");
        el.className = "dgt-chip";
        const img = document.createElement("img");
        img.src = ICONS[mod]!;
        img.alt = "";
        img.setAttribute("aria-hidden", "true");
        el.appendChild(img);
        system.appendChild(el);
        const line = document.createElementNS(SVGNS, "line");
        line.setAttribute("stroke", "#34D399");
        line.setAttribute("stroke-width", "1");
        svg.appendChild(line);
        const pulse = document.createElementNS(SVGNS, "circle");
        pulse.setAttribute("r", "2.2");
        pulse.setAttribute("fill", "#8FF7C8");
        svg.appendChild(pulse);
        chips.push({ el, line, pulse, ring: ri, base: (j / count) * Math.PI * 2 + ring.offset, period: ring.period, phase: Math.random() });
      });
    });

    let W = 0, H = 0, cx = 0, cy = 0, R = 0;
    function resize() {
      const r = root!.getBoundingClientRect();
      W = r.width; H = r.height; cx = W / 2; cy = H * (H < 720 ? 0.38 : 0.34); R = Math.min(W, H);
      svg.setAttribute("width", String(W));
      svg.setAttribute("height", String(H));
      ringEls.forEach((e, i) => {
        const c = RINGS[i];
        if (!c) return;
        e.style.width = c.rx * R * 2 + "px";
        e.style.height = c.ry * R * 2 + "px";
      });
    }
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(resize);
      ro.observe(root);
    } else {
      window.addEventListener("resize", resize);
    }
    resize();

    let mX: number | null = null, mY: number | null = null, tgX = 0, tgY = 0, curX = 0, curY = 0;
    function updateMouse(e: { clientX: number; clientY: number }) {
      const r = root!.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (x >= -80 && y >= -80 && x <= r.width + 80 && y <= r.height + 80) {
        mX = x; mY = y; tgX = (x / r.width - 0.5) * 2; tgY = (y / r.height - 0.5) * 2;
      } else {
        mX = mY = null; tgX = 0; tgY = 0;
      }
    }
    const onPointer = (e: PointerEvent) => updateMouse(e);
    const onMouse = (e: MouseEvent) => updateMouse(e);
    const onTouch = (e: TouchEvent) => { if (e.touches && e.touches[0]) updateMouse(e.touches[0]); };
    const onBlur = () => { mX = mY = null; tgX = 0; tgY = 0; };
    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("mousemove", onMouse, { passive: true });
    window.addEventListener("touchmove", onTouch, { passive: true });
    window.addEventListener("blur", onBlur);

    const reduce = window.matchMedia("(prefers-reduced-motion:reduce)").matches;
    let raf = 0;
    // The orbit only runs while it is on screen, the tab is visible and the visitor has not paused it.
    let onScreen = true;
    let clock = 0;
    let last = 0;
    let introStart = -1;
    const running = () => onScreen && !pausedRef.current && document.visibilityState === "visible";
    const ease = (x: number) => 1 - Math.pow(1 - x, 3);
    function frame(ts: number) {
      raf = 0;
      if (introStart < 0) introStart = ts;
      clock += last ? Math.min(ts - last, 50) : 0;
      last = ts;
      const t = reduce ? 0 : clock / 1000;
      // Entrance: the modules travel out from the core onto their orbits, ring by ring.
      const intro = reduce ? 1 : Math.min(1, (ts - introStart) / 1700);
      curX += (tgX - curX) * 0.08;
      curY += (tgY - curY) * 0.08;
      core.style.transform = `translate(-50%,-50%) translate(${(curX * -18).toFixed(1)}px,${(curY * -14).toFixed(1)}px)`;
      for (let i = 0; i < chips.length; i++) {
        const c = chips[i]!, cfg = RINGS[c.ring]!;
        const ang = c.base - (t / c.period) * Math.PI * 2;
        const depth = (Math.sin(ang) + 1) / 2;
        const par = 1 + c.ring * 0.9;
        const arrive = ease(Math.min(1, Math.max(0, intro * 1.35 - c.ring * 0.17)));
        const reach = 0.3 + 0.7 * arrive;
        let px = cx + Math.cos(ang) * cfg.rx * R * reach + curX * 32 * par * (0.5 + depth * 0.5);
        let py = cy + Math.sin(ang) * cfg.ry * R * reach + curY * 24 * par * (0.5 + depth * 0.5);
        let scale = (0.58 + depth * 0.54) * (0.6 + 0.4 * arrive), op = (0.4 + depth * 0.6) * arrive;
        let influence = 0;
        if (mX != null && mY != null) {
          const dx = mX - px, dy = mY - py, dist = Math.sqrt(dx * dx + dy * dy);
          influence = Math.max(0, 1 - dist / 190);
          px += dx * 0.045 * influence;
          py += dy * 0.045 * influence;
          scale *= 1 + 0.28 * influence;
          op = Math.min(1, op + 0.28 * influence);
        }
        c.el.style.transform = `translate(-50%,-50%) translate(${px.toFixed(1)}px,${py.toFixed(1)}px) scale(${scale.toFixed(3)})`;
        c.el.style.opacity = op.toFixed(3);
        c.el.style.zIndex = String((influence > 0.35 ? 300 : 0) + (depth >= 0.5 ? 90 + Math.round(depth * 10) : 60 + Math.round(depth * 20)));
        c.el.style.filter = depth < 0.5 && influence < 0.15 ? `blur(${((0.5 - depth) * 2.4).toFixed(2)}px)` : "none";
        c.el.style.borderColor = `rgba(52,211,153,${(0.3 + influence * 0.55).toFixed(2)})`;
        c.el.style.boxShadow = `0 10px 30px rgba(0,0,0,.5),0 0 ${(22 + influence * 42).toFixed(0)}px rgba(52,211,153,${(0.14 + influence * 0.34).toFixed(2)}),inset 0 1px 0 rgba(255,255,255,.08)`;
        c.line.setAttribute("x1", String(cx)); c.line.setAttribute("y1", String(cy));
        c.line.setAttribute("x2", String(px)); c.line.setAttribute("y2", String(py));
        c.line.setAttribute("stroke-opacity", (0.04 + depth * 0.12 + influence * 0.28).toFixed(3));
        const prog = (t / 3.4 + c.phase) % 1;
        c.pulse.setAttribute("cx", (px + (cx - px) * prog).toFixed(1));
        c.pulse.setAttribute("cy", (py + (cy - py) * prog).toFixed(1));
        c.pulse.setAttribute("r", (1.4 + depth * 1.8 + influence * 1.2).toFixed(2));
        c.pulse.setAttribute("fill-opacity", ((0.15 + depth * 0.7 + influence * 0.35) * (1 - prog) * arrive).toFixed(3));
        c.line.setAttribute("stroke-opacity", ((0.04 + depth * 0.12 + influence * 0.28) * arrive).toFixed(3));
      }
      if (running() && !(reduce && intro >= 1)) raf = requestAnimationFrame(frame);
      else last = 0;
    }
    const wake = () => { if (!raf && running()) raf = requestAnimationFrame(frame); };
    wakeRef.current = wake;
    const visibility = new IntersectionObserver(([entry]) => { onScreen = Boolean(entry?.isIntersecting); wake(); });
    visibility.observe(root);
    document.addEventListener("visibilitychange", wake);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      visibility.disconnect();
      document.removeEventListener("visibilitychange", wake);
      wakeRef.current = () => {};
      ro?.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("mousemove", onMouse);
      window.removeEventListener("touchmove", onTouch);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return localizeTree((
    <div ref={rootRef} id="dgt-bg" aria-hidden="true">
      <div className="dgt-bloom" />
      <div className="dgt-corona" />
      <div className="dgt-space" />
      <svg className="dgt-lines" />
      <div className="dgt-system">
        <div className="dgt-ring dgt-r1" />
        <div className="dgt-ring dgt-r2" />
        <div className="dgt-ring dgt-r3" />
        <div className="dgt-core">
          <div className="dgt-halo" />
          <div className="dgt-disc">
            <img src={DIGIT_ICON} alt="" aria-hidden="true" />
          </div>
        </div>
      </div>
      <div className="dgt-vignette" />
    </div>
  ), locale);
}

export default function Hero() {
  const locale = useLocale();
  return localizeTree((
    <section id="digit-orbit" className="relative min-h-[60vh] overflow-hidden bg-dark">
      <style>{`
#dgt-bg{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;background:#08140F;font-family:'IBM Plex Sans Arabic',-apple-system,Segoe UI,Tahoma,sans-serif;}
#dgt-bg *{box-sizing:border-box;}
#dgt-bg .dgt-bloom{position:absolute;left:50%;top:34%;width:150vmax;height:150vmax;transform:translate(-50%,-50%);animation:dgtBloom 7s ease-in-out infinite;background:radial-gradient(circle at 50% 50%,rgba(52,211,153,.34) 0%,rgba(63,203,134,.20) 10%,rgba(10,135,84,.14) 22%,rgba(6,78,59,.07) 38%,rgba(8,20,15,0) 56%);}
@keyframes dgtBloom{0%,100%{opacity:.85;transform:translate(-50%,-50%) scale(1);}50%{opacity:1;transform:translate(-50%,-50%) scale(1.06);}}
#dgt-bg .dgt-corona{position:absolute;left:50%;top:34%;width:640px;height:640px;transform:translate(-50%,-50%);opacity:.55;mix-blend-mode:screen;animation:dgtSpin 48s linear infinite;background:conic-gradient(from 0deg,rgba(52,211,153,0) 0deg,rgba(52,211,153,.16) 12deg,rgba(52,211,153,0) 24deg,rgba(52,211,153,0) 40deg,rgba(63,203,134,.14) 52deg,rgba(52,211,153,0) 64deg,rgba(52,211,153,0) 96deg,rgba(52,211,153,.16) 108deg,rgba(52,211,153,0) 120deg,rgba(52,211,153,0) 160deg,rgba(63,203,134,.12) 172deg,rgba(52,211,153,0) 184deg,rgba(52,211,153,0) 220deg,rgba(52,211,153,.15) 232deg,rgba(52,211,153,0) 244deg,rgba(52,211,153,0) 290deg,rgba(63,203,134,.13) 302deg,rgba(52,211,153,0) 314deg,rgba(52,211,153,0) 360deg);-webkit-mask:radial-gradient(circle at 50% 50%,rgba(0,0,0,0) 84px,#000 130px,rgba(0,0,0,.35) 250px,transparent 330px);mask:radial-gradient(circle at 50% 50%,rgba(0,0,0,0) 84px,#000 130px,rgba(0,0,0,.35) 250px,transparent 330px);}
@keyframes dgtSpin{to{transform:translate(-50%,-50%) rotate(360deg);}}
#dgt-bg .dgt-space{position:absolute;inset:0;background:radial-gradient(circle at 50% 34%,rgba(52,211,153,.05) 0%,rgba(8,20,15,0) 60%),radial-gradient(1px 1px at 20% 30%,rgba(52,211,153,.5),transparent),radial-gradient(1px 1px at 80% 20%,rgba(52,211,153,.35),transparent),radial-gradient(1px 1px at 65% 75%,rgba(52,211,153,.4),transparent),radial-gradient(1px 1px at 30% 80%,rgba(52,211,153,.3),transparent),radial-gradient(1px 1px at 88% 62%,rgba(52,211,153,.3),transparent),radial-gradient(1px 1px at 12% 60%,rgba(52,211,153,.25),transparent);}
#dgt-bg .dgt-lines{position:absolute;inset:0;}
#dgt-bg .dgt-system{position:absolute;inset:0;}
#dgt-bg .dgt-ring{position:absolute;left:50%;top:34%;transform:translate(-50%,-50%);border:1px solid rgba(52,211,153,.10);border-radius:50%;}
#dgt-bg .dgt-r1{border-color:rgba(52,211,153,.12);}
#dgt-bg .dgt-r2{border-color:rgba(52,211,153,.09);}
#dgt-bg .dgt-r3{border-color:rgba(52,211,153,.07);}
#dgt-bg .dgt-core{position:absolute;left:50%;top:34%;z-index:90;transform:translate(-50%,-50%);display:grid;place-items:center;}
#dgt-bg .dgt-halo{position:absolute;width:260px;height:260px;border-radius:50%;animation:dgtBreathe 6s ease-in-out infinite;background:radial-gradient(circle at 50% 50%,rgba(63,203,134,.45) 0%,rgba(10,135,84,.20) 40%,rgba(8,20,15,0) 70%);}
#dgt-bg .dgt-disc{position:relative;width:122px;height:122px;border-radius:50%;display:grid;place-items:center;animation:dgtPulse 6s ease-in-out infinite;border:1px solid rgba(63,203,134,.55);background:radial-gradient(circle at 50% 32%,rgba(23,64,47,.96),rgba(7,22,16,.98)),radial-gradient(circle at 50% 20%,rgba(63,203,134,.5),rgba(8,20,15,0) 60%);box-shadow:0 0 0 6px rgba(52,211,153,.06),0 0 54px rgba(52,211,153,.5),0 0 120px rgba(52,211,153,.28),inset 0 2px 0 rgba(255,255,255,.14),inset 0 0 30px rgba(52,211,153,.22);}
#dgt-bg .dgt-disc img{width:62px;height:62px;display:block;filter:drop-shadow(0 0 12px rgba(52,211,153,.75));}
@keyframes dgtBreathe{0%,100%{opacity:.85;transform:scale(1);}50%{opacity:1;transform:scale(1.1);}}
@keyframes dgtPulse{0%,100%{box-shadow:0 0 0 6px rgba(52,211,153,.06),0 0 54px rgba(52,211,153,.46),0 0 120px rgba(52,211,153,.24),inset 0 2px 0 rgba(255,255,255,.14),inset 0 0 30px rgba(52,211,153,.2);}50%{box-shadow:0 0 0 9px rgba(52,211,153,.09),0 0 78px rgba(52,211,153,.64),0 0 150px rgba(52,211,153,.34),inset 0 2px 0 rgba(255,255,255,.18),inset 0 0 36px rgba(52,211,153,.28);}}
#dgt-bg .dgt-chip{position:absolute;left:0;top:0;width:78px;height:78px;border-radius:22px;display:grid;place-items:center;transform:translate(-50%,-50%);will-change:transform,opacity,filter,box-shadow;border-color:rgba(52,211,153,.30);transition:box-shadow .18s ease,border-color .18s ease,filter .18s ease;background:linear-gradient(160deg,rgba(20,50,37,.94),rgba(9,24,18,.94));border:1px solid rgba(52,211,153,.3);box-shadow:0 10px 30px rgba(0,0,0,.5),0 0 22px rgba(52,211,153,.14),inset 0 1px 0 rgba(255,255,255,.08);}
#dgt-bg .dgt-chip img{width:42px;height:42px;display:block;filter:drop-shadow(0 0 6px rgba(52,211,153,.45));}
#dgt-bg .dgt-vignette{position:absolute;inset:0;background:radial-gradient(ellipse 80% 80% at 50% 34%,rgba(8,20,15,0) 55%,rgba(8,20,15,.55) 100%);}
@media (max-height:720px){#dgt-bg .dgt-bloom,#dgt-bg .dgt-corona{top:38%;}#dgt-bg .dgt-ring,#dgt-bg .dgt-core{top:38%;}}
@media (prefers-reduced-motion:reduce){#dgt-bg .dgt-halo,#dgt-bg .dgt-disc,#dgt-bg .dgt-bloom,#dgt-bg .dgt-corona{animation:none;}}
      `}</style>
      <OrbitBackground />
      <div className="relative z-[2] mx-auto max-w-[1600px] px-6 pt-[340px] pb-[40px] text-center lg:pt-[600px]">
        <p className="text-[28px] font-medium text-mint lg:text-[44px]">محاسبتك أوضح مع ديجيت</p>
        <h2 className="mx-auto mt-2 px-0 text-[34px] leading-[1.25] font-bold text-paper lg:px-[50px] lg:text-[56px]">
          منصة واحدة تدير ماليتك وعملياتك ونقاط بيعك.
        </h2>
        <p className="mx-auto mt-3 max-w-[900px] px-0 py-px text-[16px] text-[#C2CCC5] lg:px-[50px] lg:text-[22px]">
          Digit نظام ERP مالي وتشغيلي للسوق السعودي — محاسبة وفوترة إلكترونية ومبيعات ومشتريات ومخزون ونقاط بيع وتقارير، سحابياً أو داخل سيرفراتك.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <a
            href="/demo"
            className="rounded-[12px] bg-primary px-10 py-4 text-[17px] font-semibold text-white transition-colors hover:bg-deep"
          >
            اطلب عرض سعر
          </a>
          <a
            href="/demo"
            className="rounded-[12px] border border-mint bg-transparent px-10 py-4 text-[17px] font-semibold text-mint transition-colors hover:bg-mint/10"
          >
            احجز Demo
          </a>
        </div>
        <p className="pt-[29px] text-[15px] font-bold text-[#C3C3C3]">
          يدعم الفوترة الإلكترونية · يعتمد عليه أكثر من 200 منشأة سعودية
        </p>
      </div>
    </section>
  ), locale);
}
