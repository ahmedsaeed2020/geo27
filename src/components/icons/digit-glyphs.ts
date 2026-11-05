// The DIGIT icon set. Every glyph sits on the 100×100 grid of the original digit-erp.com icons and uses their two
// tones only: ink (tone 0, the element's text colour) and accent (tone 1, `--di-accent`, the brand green by default).
// `site` glyphs are copied shape-for-shape from the icons published on the original site; `drawn` glyphs cover
// subjects that set never had and are built from the same primitives (rounded bars, discs, rings, 7–13 unit strokes).

type Tone = 0 | 1;

/** Rounded rectangle: x, y, width, height, corner radius, tone. */
type Rect = readonly ['r', number, number, number, number, number, Tone];
/** Disc: cx, cy, r, tone. */
type Disc = readonly ['c', number, number, number, Tone];
/** Ring: cx, cy, r, stroke width, tone. */
type Ring = readonly ['o', number, number, number, number, Tone];
/** Filled polygon points, tone. */
type Poly = readonly ['g', string, Tone];
/** Filled path (even-odd, so inner sub-paths cut holes), tone. */
type Fill = readonly ['p', string, Tone];
/** Stroked path with round caps and joins: d, stroke width, tone. */
type Stroke = readonly ['s', string, number, Tone];

export type Shape = Rect | Disc | Ring | Poly | Fill | Stroke;
export type Glyph = { from: 'site' | 'drawn'; shapes: readonly Shape[] };

const site = (...shapes: Shape[]): Glyph => ({ from: 'site', shapes });
const drawn = (...shapes: Shape[]): Glyph => ({ from: 'drawn', shapes });

export const GLYPHS = {
  // ---- Original digit-erp.com icons ----
  /** The DIGIT app mark (its bars, without the app tile). */
  digitMark: site(['r', 18, 22.5, 40, 13, 6.5, 0], ['r', 63, 22.5, 19, 13, 5, 1], ['r', 18, 43.5, 64, 13, 6.5, 0], ['r', 18, 64.5, 50, 13, 6.5, 0]),
  accounts: site(['r', 22, 34, 44, 12, 6, 0], ['r', 70, 34, 14, 12, 5, 1], ['r', 22, 54, 44, 12, 6, 0], ['r', 70, 54, 14, 12, 5, 0]),
  sales: site(['r', 24, 58, 14, 20, 5, 0], ['r', 43, 46, 14, 32, 5, 0], ['r', 62, 30, 14, 48, 5, 1]),
  purchases: site(['r', 24, 30, 14, 48, 5, 1], ['r', 43, 46, 14, 32, 5, 0], ['r', 62, 58, 14, 20, 5, 0]),
  inventory: site(['r', 21, 21, 26, 26, 5, 0], ['r', 53, 21, 26, 26, 5, 0], ['r', 21, 53, 26, 26, 5, 0], ['r', 53, 53, 26, 26, 5, 1]),
  assets: site(['r', 32, 26, 36, 30, 6, 0], ['r', 40, 34, 20, 14, 4, 1], ['r', 20, 64, 60, 13, 6.5, 0]),
  reports: site(['r', 22, 24, 56, 10, 5, 0], ['r', 22, 40, 26, 36, 6, 0], ['r', 54, 40, 24, 16, 5, 1], ['r', 54, 60, 24, 16, 5, 0]),
  financial: site(['r', 24, 22, 52, 11, 5.5, 0], ['r', 24, 38, 36, 11, 5.5, 0], ['r', 24, 54, 44, 11, 5.5, 0], ['r', 24, 71, 52, 8, 4, 1]),
  projects: site(['r', 22, 28, 38, 11, 5.5, 0], ['r', 40, 45, 40, 11, 5.5, 1], ['r', 30, 62, 34, 11, 5.5, 0]),
  team: site(['c', 40, 38, 11, 0], ['r', 24, 56, 32, 20, 10, 0], ['c', 66, 42, 8, 1], ['r', 54, 60, 24, 16, 8, 1]),
  user: site(['c', 50, 36, 14, 1], ['r', 26, 58, 48, 22, 11, 0]),
  calendar: site(['r', 34, 20, 8, 14, 4, 0], ['r', 58, 20, 8, 14, 4, 0], ['r', 22, 30, 56, 48, 8, 0], ['r', 22, 30, 56, 14, 8, 1]),
  signature: site(['o', 50, 46, 20, 8, 1], ['s', 'M41 47 l6 8 l15 -17', 7, 0], ['r', 24, 72, 52, 8, 4, 0]),
  shield: site(['g', '50,16 84,30 84,54 50,84 16,54 16,30', 0], ['s', 'M38 50 l9 10 l18 -22', 8, 1]),
  einvoicing: site(['r', 22, 28, 34, 9, 4.5, 0], ['r', 22, 44, 34, 9, 4.5, 0], ['r', 22, 60, 24, 9, 4.5, 0], ['r', 58, 52, 22, 22, 5, 1]),
  filter: site(['g', '22,24 78,24 56,48 44,48', 0], ['r', 44, 48, 12, 30, 4, 1]),
  dashboard: site(['r', 20, 20, 32, 30, 6, 0], ['r', 58, 20, 22, 14, 4, 0], ['r', 58, 40, 22, 14, 4, 1], ['r', 20, 56, 60, 24, 6, 0]),
  settings: site(['r', 22, 29, 56, 8, 4, 0], ['c', 40, 33, 8, 1], ['r', 22, 48, 56, 8, 4, 0], ['c', 62, 52, 8, 0], ['r', 22, 67, 56, 8, 4, 0], ['c', 34, 71, 8, 0]),
  search: site(['o', 44, 44, 17, 9, 0], ['s', 'M56 56 L75 75', 10, 1]),
  warning: site(['g', '50,22 82,76 18,76', 0], ['r', 46, 40, 8, 20, 4, 1], ['c', 50, 69, 5, 1]),
  costCenters: site(
    ['p', 'M26 50a24 24 0 1 0 48 0a24 24 0 1 0 -48 0z M42 50a8 8 0 1 0 16 0a8 8 0 1 0 -16 0z', 0],
    ['p', 'M50 26h24v24h-24z M50 42a8 8 0 0 1 8 8h-8z', 1],
  ),
  building: site(['r', 22, 42, 56, 34, 4, 0], ['r', 30, 30, 40, 14, 3, 0], ['r', 44, 52, 12, 24, 3, 1]),
  /** Mudad / WPS salary card. */
  payroll: site(['r', 22, 33, 56, 34, 6, 0], ['r', 22, 43, 56, 8, 0, 1], ['r', 60, 55, 12, 8, 3, 1]),
  pos: site(['r', 28, 24, 44, 34, 7, 0], ['r', 38, 32, 24, 8, 4, 1], ['r', 22, 66, 56, 12, 6, 0]),
  pharmacy: site(['r', 30, 24, 40, 52, 12, 0], ['r', 45, 34, 10, 32, 4, 1], ['r', 34, 45, 32, 10, 4, 1]),

  // ---- Drawn in the same grammar ----
  hardHat: drawn(['p', 'M24 62a26 26 0 0 1 52 0z', 0], ['r', 44, 28, 12, 28, 6, 1], ['r', 16, 62, 68, 12, 6, 0]),
  wrench: drawn(['s', 'M28 72 L52 48', 13, 0], ['o', 62, 38, 13, 9, 1]),
  customers: drawn(['c', 38, 40, 11, 0], ['r', 22, 58, 32, 20, 10, 0], ['r', 54, 22, 28, 20, 10, 1], ['g', '60,38 70,38 58,49', 1]),
  orgChart: drawn(
    ['r', 38, 18, 24, 16, 5, 0],
    ['r', 47, 32, 6, 14, 3, 0],
    ['r', 26, 43, 48, 6, 3, 0],
    ['r', 26, 43, 6, 16, 3, 0],
    ['r', 68, 43, 6, 16, 3, 0],
    ['r', 18, 58, 22, 20, 5, 0],
    ['r', 60, 58, 22, 20, 5, 1],
  ),
  userPlus: drawn(['c', 40, 36, 13, 0], ['r', 18, 56, 44, 22, 11, 0], ['r', 67, 30, 8, 26, 4, 1], ['r', 58, 39, 26, 8, 4, 1]),
  /** Notched ruler over an accent dimension line. */
  ruler: drawn(
    ['p', 'M22 26h56a6 6 0 0 1 6 6v16a6 6 0 0 1 -6 6h-56a6 6 0 0 1 -6 -6v-16a6 6 0 0 1 6 -6z M27 26h6v14h-6z M39 26h6v8h-6z M51 26h6v14h-6z M63 26h6v8h-6z', 0],
    ['s', 'M20 72 H80', 6, 1],
    ['s', 'M20 64 V80', 6, 1],
    ['s', 'M80 64 V80', 6, 1],
  ),
  target: drawn(['o', 46, 54, 24, 8, 0], ['c', 46, 54, 9, 1], ['s', 'M54 46 L74 26', 8, 1], ['s', 'M66 22 H78 V34', 6, 1]),
  pin: drawn(['p', 'M50 84C40 71 26 59 26 42a24 24 0 0 1 48 0c0 17-14 29-24 42z M41 42a9 9 0 1 0 18 0a9 9 0 1 0 -18 0z', 0], ['c', 50, 42, 6, 1]),
  clipboard: drawn(['r', 26, 24, 48, 56, 8, 0], ['r', 38, 18, 24, 12, 5, 1], ['r', 36, 44, 28, 7, 3.5, 1], ['r', 36, 58, 18, 7, 3.5, 1]),
  smartphone: drawn(['r', 32, 16, 36, 68, 9, 0], ['r', 44, 23, 12, 5, 2.5, 1], ['r', 42, 70, 16, 6, 3, 1]),
  flower: drawn(
    ['r', 47, 58, 6, 26, 3, 0],
    ['r', 50, 68, 16, 7, 3.5, 1],
    ['c', 50, 26, 10, 0],
    ['c', 64.3, 36.4, 10, 0],
    ['c', 58.8, 53.1, 10, 0],
    ['c', 41.2, 53.1, 10, 0],
    ['c', 35.7, 36.4, 10, 0],
    ['c', 50, 41, 8, 1],
  ),
  scissors: drawn(['s', 'M60 58 L34 20', 8, 0], ['s', 'M40 58 L66 20', 8, 1], ['o', 33, 68, 10, 7, 0], ['o', 67, 68, 10, 7, 0]),
  appliance: drawn(['r', 30, 16, 40, 68, 9, 0], ['r', 30, 41, 40, 4, 0, 1], ['r', 37, 24, 5, 11, 2.5, 1], ['r', 37, 52, 5, 18, 2.5, 1]),
  sofa: drawn(
    ['r', 28, 28, 44, 26, 9, 0],
    ['r', 22, 48, 56, 20, 7, 0],
    ['r', 14, 40, 16, 32, 8, 1],
    ['r', 70, 40, 16, 32, 8, 1],
    ['r', 26, 70, 7, 10, 3, 0],
    ['r', 67, 70, 7, 10, 3, 0],
  ),
  glasses: drawn(['o', 31, 56, 13, 8, 0], ['o', 69, 56, 13, 8, 0], ['s', 'M44 53 Q50 46 56 53', 7, 1], ['s', 'M19 50 L14 38', 6, 0], ['s', 'M81 50 L86 38', 6, 0]),
  coffee: drawn(
    ['o', 68, 53, 9, 7, 1],
    ['r', 18, 36, 46, 38, 11, 0],
    ['r', 28, 16, 6, 14, 3, 1],
    ['r', 43, 16, 6, 14, 3, 1],
    ['r', 14, 78, 58, 6, 3, 0],
  ),
  cake: drawn(['r', 47, 22, 6, 12, 3, 1], ['c', 50, 16, 4.5, 1], ['r', 30, 34, 40, 18, 7, 0], ['r', 20, 50, 60, 28, 7, 0], ['r', 20, 60, 60, 6, 0, 1]),
} satisfies Record<string, Glyph>;

export type GlyphName = keyof typeof GLYPHS;
