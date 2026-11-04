// Shapes of the DIGIT Pro V4 marketing content (source-backed pages; the CMS orders, hides and overrides sections).
export type L = { ar: string; en: string };

/** A real DIGIT Pro screenshot id from product-shots.ts, optionally with a magnified region (percent of width/height). */
export type ShotRef = { id: string; focus?: { x: number; y: number; zoom: number } };

/** A capability shown as available today: its Run11.1 ID must be complete & verified (enforced by tests). */
export type Feature = { id: string; title: L; body: L; shot?: string };

/** A native system document (the English name is how it appears in the English interface). */
export type NativeDoc = { sys: string; name: L; role: L };

export type Workspace = {
  /** Run11.1 workspace code, e.g. ACC-OPS. */
  code: string;
  question: L;
  lede: L;
  /** Hand-off ladder of responsible roles, first to last. */
  roles: L[];
  /** Stages of the department journey this workspace covers (indexes into the page's journey rail). */
  stages?: number[];
  overview: { body: L; features: Feature[]; lead: ShotRef; extra?: ShotRef[] };
  work: { docs: NativeDoc[]; steps: L[]; control: L };
  reports: { keys: string[]; decision: L };
};

export type Step = { title: L; body: L; doc?: string; shot?: string };
export type Term = { term: L; def: L };

export type ProSection =
  | { id: string; kind: 'intro'; thesis: L; question: L; sequence: L[]; roles: L[]; rail?: L[] }
  | { id: string; kind: 'workspace'; ws: Workspace }
  | { id: string; kind: 'flow'; lede: L; steps: Step[] }
  | { id: string; kind: 'anatomy'; lede: L; lead: ShotRef; terms: Term[]; support?: ShotRef[]; note?: L }
  | { id: string; kind: 'match'; lede: L; columns: { doc: L; sys: string; holds: L }[]; checks: Feature[]; note: L }
  | { id: string; kind: 'lifecycle'; lede: L; stages: { title: L; body: L; ws: string; shown: boolean; shot?: string }[]; note: L }
  | { id: string; kind: 'mosaic'; lede: L; items: { shot: string; note: L }[] }
  | { id: string; kind: 'decisions'; lede: L; items: { question: L; answer: L; report?: string; href?: string; shot?: string }[] }
  | { id: string; kind: 'connections'; lede: L; items: { to: string; title: L; body: L }[] }
  | { id: string; kind: 'features'; lede: L; items: Feature[]; layout?: 'grid' | 'rows' }
  | { id: string; kind: 'report-feature'; lede: L; items: { key: string; question: L; role: L; records: L; filters: L; decision: L; shot: string; shotNote: L }[] }
  | { id: string; kind: 'report-directory'; lede: L }
  | { id: string; kind: 'layers'; lede: L; layers: { name: L; who: L; purpose: L; example: L; shot: string; href: string }[] }
  | { id: string; kind: 'questions'; lede: L; items: ExecQuestion[] }
  | { id: string; kind: 'chapter'; kicker: L; lede: L; lead: ShotRef; points: { title: L; body: L }[]; reports: string[]; support?: string[]; flip?: boolean }
  | { id: string; kind: 'tiers'; lede: L }
  | { id: string; kind: 'explorer'; lede: L; themes: { id: string; label: L }[]; items: (Feature & { theme: string })[] }
  | { id: string; kind: 'scope'; lede: L; items: { title: L; body: L; tier: 'available' | 'verifying' | 'scoped'; ids: string[]; shot?: string }[] }
  | { id: string; kind: 'cta'; body: L; interest: L };

/**
 * One executive question (Run11.1 EXE-01…12). `status`: `screen` = a verified screen in this release answers it;
 * `report` = answered through standard reports while the dedicated executive card is still being verified.
 */
export type ExecQuestion = {
  id: string;
  question: L;
  view: L;
  sources: L;
  reports: string[];
  decision: L;
  shot?: string;
  status: 'screen' | 'report';
  evidence: string[];
};

export type ProPageContent = { key: string; sections: ProSection[] };
