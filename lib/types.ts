// Shared contract between the analysis engine, the fix prompt, persistence and UI.
// Every module imports from here; change it deliberately.

export type TenetId =
  | "pain"
  | "show"
  | "action"
  | "specificity"
  | "voice"
  | "economy"
  | "identity"
  | "speed";

export type Severity = "low" | "medium" | "high";

/** Region on a full-page screenshot, in CSS pixels of that viewport. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  viewport: "desktop" | "mobile";
}

export interface Finding {
  /** Stable id, e.g. "cta-below-fold" or "llm-3". */
  id: string;
  tenet: TenetId | "markers";
  severity: Severity;
  title: string;
  /** One sentence: why this hurts the page, in plain language. */
  detail: string;
  /** Quoted snippets from the page. */
  evidence: string[];
  boxes: Box[];
  /** 0..1 contribution weight inside its tenet. */
  weight: number;
  source: "detector" | "judge";
}

export interface TextBlock {
  tag: string;
  text: string;
  box: Box;
  /** Computed font family and size for this element. */
  fontFamily: string;
  fontSize: number;
}

export interface ViewportCapture {
  viewport: "desktop" | "mobile";
  width: number;
  height: number;
  fullHeight: number;
  /** Full-page screenshot, base64 (no data: prefix). */
  screenshot: string;
  /** Media type of `screenshot`; PNG when absent. */
  screenshotType?: "image/png" | "image/jpeg";
  /** PNG of the first viewport only, base64. */
  firstViewport: string;
  blocks: TextBlock[];
  links: { text: string; href: string; box: Box; isButton: boolean }[];
  images: {
    src: string;
    alt: string;
    box: Box;
    hasDimensions: boolean;
    kind: "img" | "svg" | "video" | "background";
  }[];
  sections: { tag: string; box: Box; text: string; childCount: number }[];
}

export interface Capture {
  url: string;
  finalUrl: string;
  title: string;
  html: string;
  /** Frozen snapshot: rendered DOM, <base href>, inlined CSS, scripts stripped. */
  snapshotHtml: string;
  visibleText: string;
  fonts: string[];
  colors: string[];
  backgrounds: string[];
  cls: number;
  lcp: number | null;
  desktop: ViewportCapture;
  mobile: ViewportCapture;
}

export interface Metrics {
  mobileScreens: number;
  cls: number;
  lcp: number | null;
  emojiCount: number;
  emDashCount: number;
  wordCount: number;
  distinctCtaLabels: number;
  headlineInFirstViewport: boolean;
  ctaInFirstViewport: boolean;
}

export interface TenetScore {
  tenet: TenetId;
  /** 0..100, higher = sloppier. */
  slop: number;
  detector: number;
  judge: number | null;
}

export interface Score {
  /** 0..100, higher = sloppier. */
  total: number;
  grade: "A" | "B" | "C" | "D" | "F";
  tenets: TenetScore[];
  markersPenalty: number;
}

export interface UniquenessSignal {
  title: string;
  evidence: string;
}

export interface FiveSecondTest {
  whatIsIt: string;
  whoIsItFor: string;
  whatDoIDoNext: string;
  matchesPage: boolean;
  note: string;
}

export interface Report {
  id: string;
  url: string;
  title: string;
  metrics: Metrics;
  findings: Finding[];
  uniqueness: UniquenessSignal[];
  fiveSecond: FiveSecondTest | null;
  score: Score;
  /** Facts about the product extracted from the page, kept by the fix prompt. */
  productFacts: string[];
  screenshots: { desktop: string; mobile: string }; // URLs (signed or data:)
  snapshotUrl: string;
  claimToken?: string;
}

/** SSE events from POST /api/analyze. Each line: `data: <json>\n\n`. */
export type AnalyzeEvent =
  | {
      type: "status";
      message: string;
      box?: Box;
      screenshot?: "desktop" | "mobile";
    }
  | {
      type: "screenshot";
      viewport: "desktop" | "mobile";
      url: string;
      fullHeight: number;
      width: number;
    }
  | {
      type: "metric";
      key: keyof Metrics;
      value: number | boolean | null;
      label: string;
    }
  | { type: "finding"; finding: Finding }
  | { type: "score"; score: Score }
  | { type: "done"; report: Report }
  | { type: "error"; message: string };

export interface InterviewAnswers {
  story?: string;
  pain?: string;
  customer?: string;
  action?: string;
  culture?: string;
  games?: string;
  hobbies?: string;
  place?: string;
  hate?: string;
}

export type InterviewKey = keyof InterviewAnswers;

/** POST /api/interview body → 204. Saves the "Make it yours" answers. */
export interface InterviewSaveRequest {
  reportId: string;
  /** Proof of authorship; without it (or the owner's session) nothing is saved. */
  claimToken?: string;
  answers: InterviewAnswers;
}

export type Stage = "idle" | "analyzing" | "results" | "prompt";

/** Media type of a viewport's full-page screenshot. */
export function screenshotMime(vp: Pick<ViewportCapture, "screenshotType">) {
  return vp.screenshotType ?? "image/png";
}
