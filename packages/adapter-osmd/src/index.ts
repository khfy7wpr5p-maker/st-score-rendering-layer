import * as OsmdModule from "opensheetmusicdisplay";
import {
  SCORE_RENDERER_CONTRACT_VERSION,
  type ScoreHighlight,
  type ScoreMeasureRef,
  type ScoreNoteRef,
  type ScorePartRef,
  type ScoreRenderOptions,
  type ScoreRenderResult,
  type ScoreRenderer,
  type ScoreRendererCapability,
  type ScoreSource,
} from "@st/score-renderer-contracts";
import { validateScoreSource } from "@st/score-renderer-core";

interface OsmdCursorIterator {
  CurrentMeasureIndex: number;
}

interface OsmdCursor {
  iterator?: OsmdCursorIterator;
  reset(): void;
  show(): void;
  next(): void;
  nextMeasure?(): void;
}

interface OsmdStaff {
  idInMusicSheet: number;
}

interface OsmdInstrument {
  IdString: string;
  Visible: boolean;
  Staves: readonly OsmdStaff[];
}

interface OsmdGraphicalNote {
  getSVGGElement?(): Element | undefined;
}

interface OsmdGraphicalVoiceEntry {
  notes?: readonly OsmdGraphicalNote[];
  parentVoiceEntry?: {
    ParentVoice?: { VoiceId?: number };
    parentVoice?: { VoiceId?: number };
  };
}

interface OsmdGraphicalStaffEntry {
  graphicalVoiceEntries?: readonly OsmdGraphicalVoiceEntry[];
}

interface OsmdGraphicalMeasure {
  staffEntries?: readonly OsmdGraphicalStaffEntry[];
}

export interface OsmdEngine {
  load(content: string): Promise<unknown>;
  setOptions(options: Record<string, unknown>): void;
  render(): void;
  updateGraphic?(): void;
  cursor?: OsmdCursor;
  Sheet?: {
    Instruments?: readonly OsmdInstrument[];
    SourceMeasures?: readonly unknown[];
  };
  graphic?: {
    measureList?: readonly (readonly (OsmdGraphicalMeasure | undefined)[])[];
  };
}

export type OsmdFactory = (container: HTMLElement) => OsmdEngine;

const CAPABILITIES: ReadonlySet<ScoreRendererCapability> = new Set([
  "musicxml-render",
  "svg-export",
  "cursor",
  "note-highlight",
  "part-visibility",
  "tablature",
]);
const DEFAULT_HIGHLIGHT_CLASS = "st-score-highlight";
const HIGHLIGHT_CLASS_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;

type OsmdModuleShape = Partial<typeof OsmdModule> & {
  default?: Partial<typeof OsmdModule>;
};

function resolveOpenSheetMusicDisplay(): typeof OsmdModule.OpenSheetMusicDisplay {
  const moduleShape = OsmdModule as OsmdModuleShape;
  const constructor =
    moduleShape.OpenSheetMusicDisplay ??
    moduleShape.default?.OpenSheetMusicDisplay;
  if (constructor === undefined) {
    throw new Error("OpenSheetMusicDisplay constructor is unavailable from the installed module.");
  }
  return constructor;
}

function createDefaultOsmd(container: HTMLElement): OsmdEngine {
  const OpenSheetMusicDisplay = resolveOpenSheetMusicDisplay();
  return new OpenSheetMusicDisplay(container, { autoResize: true, backend: "svg" }) as unknown as OsmdEngine;
}

function requireNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
}

function voiceId(entry: OsmdGraphicalVoiceEntry): number | undefined {
  return entry.parentVoiceEntry?.ParentVoice?.VoiceId ?? entry.parentVoiceEntry?.parentVoice?.VoiceId;
}

export class OsmdRenderer implements ScoreRenderer {
  readonly id = "osmd";
  readonly capabilities = CAPABILITIES;
  readonly #container: HTMLElement;
  readonly #factory: OsmdFactory;
  readonly #highlighted = new Map<Element, string>();
  #osmd: OsmdEngine | undefined;
  #loaded = false;
  #rendered = false;

  constructor(container: HTMLElement, factory: OsmdFactory = createDefaultOsmd) {
    this.#container = container;
    this.#factory = factory;
  }

  async load(source: ScoreSource): Promise<void> {
    validateScoreSource(source);
    await this.clearHighlights();
    const osmd = this.#ensureOsmd();
    await osmd.load(source.content);
    this.#loaded = true;
    this.#rendered = false;
  }

  async render(options: ScoreRenderOptions = {}): Promise<ScoreRenderResult> {
    if (!this.#loaded) throw new Error("A MusicXML score must be loaded before render().");
    await this.clearHighlights();
    const osmd = this.#ensureOsmd();
    osmd.setOptions({
      autoResize: options.autoResize ?? true,
      drawTitle: options.drawTitle ?? true,
      drawComposer: options.drawComposer ?? true,
      pageFormat: options.pageMode === "page" ? "A4 P" : "Endless",
    });
    osmd.render();
    this.#rendered = true;
    return { rendererId: this.id, contractVersion: SCORE_RENDERER_CONTRACT_VERSION };
  }

  async exportSvg(): Promise<readonly string[]> {
    return [...this.#container.querySelectorAll("svg")].map((node) => node.outerHTML);
  }

  /**
   * Adapter-specific rendered-target resolver for ST-owned presentation helpers such as
   * the accessibility bridge. It exposes only a DOM Element, never an OSMD model object.
   */
  resolveRenderedNoteElement(target: ScoreNoteRef): Element {
    this.#requireRendered("resolveRenderedNoteElement()");
    const graphicalNote = this.#resolveGraphicalNote(target);
    const element = graphicalNote.getSVGGElement?.();
    if (!element) throw new Error("The selected note has no SVG element in the rendered score.");
    return element;
  }

  async highlight(highlight: ScoreHighlight): Promise<void> {
    this.#requireRendered("highlight()");
    const className = highlight.className ?? DEFAULT_HIGHLIGHT_CLASS;
    if (!HIGHLIGHT_CLASS_PATTERN.test(className)) {
      throw new Error("Highlight className must be one safe CSS class token of at most 64 characters.");
    }
    const element = this.resolveRenderedNoteElement(highlight.target);
    this.#ensureHighlightStyle();
    element.classList.add(className);
    element.setAttribute("data-st-score-highlight", "true");
    this.#highlighted.set(element, className);
  }

  async clearHighlights(): Promise<void> {
    for (const [element, className] of this.#highlighted) {
      element.classList.remove(className);
      element.removeAttribute("data-st-score-highlight");
    }
    this.#highlighted.clear();
  }

  async moveCursor(target: ScoreMeasureRef): Promise<void> {
    this.#requireRendered("moveCursor()");
    requireNonNegativeInteger(target.measureIndex, "measureIndex");
    const osmd = this.#ensureOsmd();
    this.#findInstrument(target.partId);
    const measureCount = osmd.Sheet?.SourceMeasures?.length;
    if (measureCount !== undefined && target.measureIndex >= measureCount) {
      throw new RangeError(`measureIndex ${target.measureIndex} is outside the loaded score.`);
    }
    const cursor = osmd.cursor;
    if (!cursor) throw new Error("OSMD cursor is unavailable for the loaded score.");
    cursor.reset();
    cursor.show();

    let current = cursor.iterator?.CurrentMeasureIndex;
    let steps = 0;
    const maxSteps = (measureCount ?? target.measureIndex + 1) + 2;
    while (current !== target.measureIndex && steps < maxSteps) {
      if (current !== undefined && current > target.measureIndex) break;
      if (cursor.nextMeasure) cursor.nextMeasure();
      else cursor.next();
      current = cursor.iterator?.CurrentMeasureIndex;
      steps += 1;
    }
    if (current !== target.measureIndex) {
      throw new Error(`OSMD cursor could not reach measureIndex ${target.measureIndex}.`);
    }
  }

  async setPartVisible(part: ScorePartRef, visible: boolean): Promise<void> {
    if (!this.#loaded) throw new Error("A MusicXML score must be loaded before setPartVisible().");
    const osmd = this.#ensureOsmd();
    const instrument = this.#findInstrument(part.partId);
    await this.clearHighlights();
    instrument.Visible = visible;
    if (!osmd.updateGraphic) throw new Error("OSMD updateGraphic() is unavailable for part visibility changes.");
    osmd.updateGraphic();
    osmd.render();
    this.#rendered = true;
  }

  async dispose(): Promise<void> {
    await this.clearHighlights();
    this.#container.replaceChildren();
    this.#osmd = undefined;
    this.#loaded = false;
    this.#rendered = false;
  }

  #ensureOsmd(): OsmdEngine {
    if (this.#osmd === undefined) this.#osmd = this.#factory(this.#container);
    return this.#osmd;
  }

  #requireRendered(operation: string): void {
    if (!this.#rendered) throw new Error(`A score must be rendered before ${operation}.`);
  }

  #findInstrument(partId: string): OsmdInstrument {
    if (partId.trim().length === 0) throw new Error("partId must not be empty.");
    const instrument = this.#ensureOsmd().Sheet?.Instruments?.find((candidate) => candidate.IdString === partId);
    if (!instrument) throw new Error(`Part '${partId}' was not found in the loaded score.`);
    return instrument;
  }

  #resolveGraphicalNote(target: ScoreNoteRef): OsmdGraphicalNote {
    requireNonNegativeInteger(target.measureIndex, "measureIndex");
    requireNonNegativeInteger(target.noteIndex, "noteIndex");
    if (target.voice !== undefined) requireNonNegativeInteger(target.voice, "voice");

    const osmd = this.#ensureOsmd();
    const instrument = this.#findInstrument(target.partId);
    const measure = osmd.graphic?.measureList?.[target.measureIndex];
    if (!measure) throw new Error(`Rendered measure ${target.measureIndex} is unavailable.`);

    const notes: OsmdGraphicalNote[] = [];
    const staffIds = instrument.Staves.map((staff) => staff.idInMusicSheet).sort((a, b) => a - b);
    for (const staffId of staffIds) {
      const graphicalMeasure = measure[staffId];
      for (const staffEntry of graphicalMeasure?.staffEntries ?? []) {
        for (const graphicalVoiceEntry of staffEntry.graphicalVoiceEntries ?? []) {
          if (target.voice !== undefined && voiceId(graphicalVoiceEntry) !== target.voice) continue;
          notes.push(...(graphicalVoiceEntry.notes ?? []));
        }
      }
    }

    const note = notes[target.noteIndex];
    if (!note) {
      const voiceSuffix = target.voice === undefined ? "" : ` for voice ${target.voice}`;
      throw new Error(`Rendered note ${target.noteIndex}${voiceSuffix} was not found in part '${target.partId}', measure ${target.measureIndex}.`);
    }
    return note;
  }

  #ensureHighlightStyle(): void {
    if (this.#container.querySelector("style[data-st-score-highlight-style]") !== null) return;
    const document = this.#container.ownerDocument;
    if (!document) throw new Error("The renderer container has no ownerDocument for highlight styling.");
    const style = document.createElement("style");
    style.setAttribute("data-st-score-highlight-style", "true");
    style.textContent = '[data-st-score-highlight="true"] * { fill: #ff8c00 !important; stroke: #ff8c00 !important; }';
    this.#container.prepend(style);
  }
}
