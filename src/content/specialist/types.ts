// DIGIT Construction, DIGIT CRM and DIGIT FSM + ITM department pages (owner brief "V4 — complete remaining
// products", 2026-11-04). Copy is adapted from the approved DIGIT Corporate Profile 2026 (page numbers are kept
// per department) and the existing site; nothing here is evidence that a feature is deployed. Every item carries
// its public status so pages never present a documented or set-up-dependent capability as released.
export type L = { ar: string; en: string };
export type SpecialistProduct = 'construction' | 'crm' | 'fsm';

/**
 * `demonstrated`: visible in a genuine DIGIT screenshot shown on the page.
 * `documented`: described in the approved corporate profile; shown in a demo session per edition and scope.
 * `scoped`: depends on set-up, an integration or a separately scoped service.
 */
export type EvidenceStatus = 'demonstrated' | 'documented' | 'scoped';

/** `record` is either translated copy or a system document name shown as-is in both languages (e.g. `Work Order`). */
export type FlowStep = { id: string; label: L; record: L | string; owner: L; state: L; output: L };
export type RecordItem = { name: L; code?: string; body: L; status: EvidenceStatus };
export type Decision = { question: L; answer: L; source: L; owner: L };
export type ReportItem = { name: L; purpose: L; status: EvidenceStatus };
export type Distinction = { term: L; means: L; notThis: L };
export type ScopeItem = { title: L; body: L; status: EvidenceStatus };
export type RoleView = { role: L; does: L; sees: L };
export type Connection = { path: string; label: L; why: L };

export type SpecialistSection =
  | { id: 'intro'; kind: 'intro'; title: L; lede: L; points: { title: L; body: L }[] }
  | { id: 'flow'; kind: 'flow'; title: L; lede: L; steps: FlowStep[]; note?: L }
  | { id: 'records'; kind: 'records'; title: L; lede: L; items: RecordItem[] }
  | { id: 'distinct'; kind: 'distinct'; title: L; lede: L; items: Distinction[] }
  | { id: 'roles'; kind: 'roles'; title: L; lede: L; items: RoleView[] }
  | { id: 'decisions'; kind: 'decisions'; title: L; lede: L; items: Decision[] }
  | { id: 'reports'; kind: 'reports'; title: L; lede: L; items: ReportItem[] }
  | { id: 'screens'; kind: 'screens'; title: L; lede: L; shots: string[] }
  | { id: 'scope'; kind: 'scope'; title: L; lede: L; items: ScopeItem[] }
  | { id: 'connections'; kind: 'connections'; title: L; lede: L; links: Connection[] };

export type SpecialistSectionId = SpecialistSection['id'];

/** Visual signature of a department page, so the 25 pages do not share one composition. */
export type Signature = 'stack' | 'ledger' | 'timeline' | 'matrix' | 'lanes' | 'loop';

export type SpecialistDepartment = {
  product: SpecialistProduct;
  slug: string;
  label: L;
  summary: L;
  headline: L;
  seoDescription: L;
  /** Corporate profile pages the copy is adapted from. */
  profilePages: number[];
  /** Approved photograph for the hero (key in src/content/specialist/photos.ts). */
  photo: string;
  /** Real DIGIT screens (ids in src/content/screens.ts); empty when no capture exists yet. */
  heroShots: string[];
  /** True when no real screen exists: the page shows a labelled process graphic and the gap is recorded. */
  illustrative: boolean;
  signature: Signature;
  sections: SpecialistSection[];
};
