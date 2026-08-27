export const SCORE_RENDERER_CONTRACT_VERSION = "0.2.0" as const;

export type ScoreSource = Readonly<{
  kind: "musicxml";
  content: string;
  sourceId?: string;
}>;

export type ScoreRenderOptions = Readonly<{
  pageMode?: "continuous" | "page";
  drawTitle?: boolean;
  drawComposer?: boolean;
  autoResize?: boolean;
}>;

export type ScoreRenderResult = Readonly<{
  rendererId: string;
  contractVersion: typeof SCORE_RENDERER_CONTRACT_VERSION;
}>;

/**
 * Stable rendered-note locator.
 * `noteIndex` is zero-based within the selected part + measure after optional `voice`
 * filtering, traversed in instrument-staff, staff-entry, graphical-voice-entry, note order.
 * `voice`, when supplied, is the MusicXML/OSMD voice id.
 */
export type ScoreNoteRef = Readonly<{
  partId: string;
  measureIndex: number;
  noteIndex: number;
  voice?: number;
}>;

export type ScoreMeasureRef = Readonly<{ partId: string; measureIndex: number }>;
export type ScorePartRef = Readonly<{ partId: string }>;
export type ScoreHighlight = Readonly<{ target: ScoreNoteRef; className?: string }>;

export type ScoreRendererCapability =
  | "musicxml-render"
  | "svg-export"
  | "cursor"
  | "note-highlight"
  | "part-visibility"
  | "tablature"
  | "headless";

export interface ScoreRenderer {
  readonly id: string;
  readonly capabilities: ReadonlySet<ScoreRendererCapability>;
  load(source: ScoreSource): Promise<void>;
  render(options?: ScoreRenderOptions): Promise<ScoreRenderResult>;
  exportSvg(): Promise<readonly string[]>;
  highlight(highlight: ScoreHighlight): Promise<void>;
  clearHighlights(): Promise<void>;
  moveCursor(target: ScoreMeasureRef): Promise<void>;
  setPartVisible(part: ScorePartRef, visible: boolean): Promise<void>;
  dispose(): Promise<void>;
}
