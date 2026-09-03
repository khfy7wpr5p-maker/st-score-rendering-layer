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

interface OsmdCursorIterator { CurrentMeasureIndex: number; }
interface OsmdCursor { iterator?: OsmdCursorIterator; reset(): void; show(): void; next(): void; nextMeasure?(): void; }
interface OsmdStaff { idInMusicSheet: number; }
interface OsmdInstrument { IdString: string; Visible: boolean; Staves: readonly OsmdStaff[]; }
interface OsmdSourceNote { isRest?(): boolean; }
interface OsmdGraphicalNote {
  getSVGGElement?(): Element | undefined;
  getNoteheadSVGs?(): Element[];
  vfnoteIndex?: number;
  sourceNote?: OsmdSourceNote;
}
interface OsmdGraphicalVoiceEntry {
  notes?: readonly OsmdGraphicalNote[];
  parentVoiceEntry?: {
    ParentVoice?: { VoiceId?: number };
    parentVoice?: { VoiceId?: number };
  };
}
interface OsmdGraphicalStaffEntry { graphicalVoiceEntries?: readonly OsmdGraphicalVoiceEntry[]; }
interface OsmdGraphicalMeasure { staffEntries?: readonly OsmdGraphicalStaffEntry[]; }
export interface OsmdEngine {
  load(content: string): Promise<unknown>;
  setOptions(options: Record<string, unknown>): void;
  render(): void;
  updateGraphic?(): void;
  cursor?: OsmdCursor;
  Sheet?: { Instruments?: readonly OsmdInstrument[]; SourceMeasures?: readonly unknown[]; };
  graphic?: { measureList?: readonly (readonly (OsmdGraphicalMeasure | undefined)[])[]; };
}

export type OsmdFactory = (container: HTMLElement) => OsmdEngine;
export type OsmdClientPoint = Readonly<{ clientX: number; clientY: number }>;
export type OsmdNoteHitMissReason =
  | "NO_ELEMENT_AT_POINT"
  | "OUTSIDE_RENDER_CONTAINER"
  | "UNMAPPED_ELEMENT"
  | "AMBIGUOUS_OWNERSHIP"
  | "NO_NOTE_OWNER";
export type OsmdNoteHitDetailedResult =
  | Readonly<{ kind: "HIT"; target: ScoreNoteRef }>
  | Readonly<{ kind: "MISS"; reason: OsmdNoteHitMissReason }>;

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
const MAX_HIT_TEST_NOTE_ELEMENTS = 200_000;
const AMBIGUOUS_HIT_OWNER = "AMBIGUOUS" as const;
const NO_NOTE_HIT_OWNER = "NO_NOTE_OWNER" as const;

type OsmdModuleShape = Partial<typeof OsmdModule> & { default?: Partial<typeof OsmdModule>; };
type IndexedGraphicalNote = Readonly<{
  note: OsmdGraphicalNote;
  globalIndex: number;
  voice?: number;
  voiceIndex?: number;
}>;
type HitTestOwner = ScoreNoteRef | typeof AMBIGUOUS_HIT_OWNER | typeof NO_NOTE_HIT_OWNER;
type ElementOwnershipResult = Readonly<{
  insideContainer: boolean;
  target?: ScoreNoteRef;
  reason?: "AMBIGUOUS_OWNERSHIP" | "NO_NOTE_OWNER";
}>;

function resolveOpenSheetMusicDisplay(): typeof OsmdModule.OpenSheetMusicDisplay {
  const moduleShape = OsmdModule as OsmdModuleShape;
  const constructor = moduleShape.OpenSheetMusicDisplay ?? moduleShape.default?.OpenSheetMusicDisplay;
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

function requireFiniteCoordinate(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be a finite number.`);
}

function voiceId(entry: OsmdGraphicalVoiceEntry): number | undefined {
  return entry.parentVoiceEntry?.ParentVoice?.VoiceId ?? entry.parentVoiceEntry?.parentVoice?.VoiceId;
}

function normalizedVoiceId(entry: OsmdGraphicalVoiceEntry): number | undefined {
  const value = voiceId(entry);
  return value !== undefined && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function sameScoreNoteRef(left: ScoreNoteRef, right: ScoreNoteRef): boolean {
  return left.partId === right.partId
    && left.measureIndex === right.measureIndex
    && left.noteIndex === right.noteIndex
    && left.voice === right.voice;
}

function miss(reason: OsmdNoteHitMissReason): OsmdNoteHitDetailedResult {
  return Object.freeze({ kind: "MISS", reason });
}

function hit(target: ScoreNoteRef): OsmdNoteHitDetailedResult {
  return Object.freeze({ kind: "HIT", target });
}

function isScoreNoteRefOwner(owner: HitTestOwner): owner is ScoreNoteRef {
  return owner !== AMBIGUOUS_HIT_OWNER && owner !== NO_NOTE_HIT_OWNER;
}

export class OsmdRenderer implements ScoreRenderer {
  readonly id = "osmd";
  readonly capabilities = CAPABILITIES;
  readonly #container: HTMLElement;
  readonly #factory: OsmdFactory;
  readonly #highlighted = new Map<Element, string>();

  #noteRefByElement: WeakMap<Element, HitTestOwner> = new WeakMap();
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
    this.#resetHitTestIndex();
    const osmd = this.#ensureOsmd();
    await osmd.load(source.content);
    this.#loaded = true;
    this.#rendered = false;
  }

  async render(options: ScoreRenderOptions = {}): Promise<ScoreRenderResult> {
    if (!this.#loaded) throw new Error("A MusicXML score must be loaded before render().");
    await this.clearHighlights();
    this.#resetHitTestIndex();
    const osmd = this.#ensureOsmd();
    osmd.setOptions({
      autoResize: options.autoResize ?? true,
      drawTitle: options.drawTitle ?? true,
      drawComposer: options.drawComposer ?? true,
      pageFormat: options.pageMode === "page" ? "A4 P" : "Endless",
    });
    osmd.render();
    this.#rendered = true;
    try {
      this.#rebuildHitTestIndex();
    } catch (error) {
      this.#rendered = false;
      this.#resetHitTestIndex();
      throw error;
    }
    return { rendererId: this.id, contractVersion: SCORE_RENDERER_CONTRACT_VERSION };
  }

  async exportSvg(): Promise<readonly string[]> {
    return [...this.#container.querySelectorAll("svg")].map((node) => node.outerHTML);
  }

  resolveRenderedNoteElement(target: ScoreNoteRef): Element {
    this.#requireRendered("resolveRenderedNoteElement()");
    return this.#resolveExactNoteheadElement(this.#resolveGraphicalNote(target));
  }

  resolveNoteAtClientPoint(point: OsmdClientPoint): ScoreNoteRef | null {
    const result = this.resolveNoteAtClientPointDetailed(point);
    return result.kind === "HIT" ? result.target : null;
  }

  resolveNoteAtClientPointDetailed(point: OsmdClientPoint): OsmdNoteHitDetailedResult {
    this.#requireRendered("resolveNoteAtClientPointDetailed()");
    requireFiniteCoordinate(point.clientX, "clientX");
    requireFiniteCoordinate(point.clientY, "clientY");

    const document = this.#container.ownerDocument;
    const initial = document.elementFromPoint(point.clientX, point.clientY);
    const stacked = typeof document.elementsFromPoint === "function"
      ? document.elementsFromPoint(point.clientX, point.clientY)
      : [];
    const candidates: Element[] = [];
    if (initial !== null) candidates.push(initial);
    for (const element of stacked) {
      if (!candidates.includes(element)) candidates.push(element);
    }
    if (candidates.length === 0) return miss("NO_ELEMENT_AT_POINT");

    let resolved: ScoreNoteRef | undefined;
    let sawInsideContainer = false;
    let sawAmbiguous = false;
    let sawNoNoteOwner = false;

    for (const candidate of candidates) {
      const ownership = this.#resolveElementOwnership(candidate);
      sawInsideContainer ||= ownership.insideContainer;
      if (ownership.reason === "AMBIGUOUS_OWNERSHIP") sawAmbiguous = true;
      if (ownership.reason === "NO_NOTE_OWNER") sawNoNoteOwner = true;
      if (ownership.target === undefined) continue;
      if (resolved !== undefined && !sameScoreNoteRef(resolved, ownership.target)) {
        return miss("AMBIGUOUS_OWNERSHIP");
      }
      resolved = ownership.target;
    }

    if (resolved !== undefined) return hit(resolved);
    if (!sawInsideContainer) return miss("OUTSIDE_RENDER_CONTAINER");
    if (sawAmbiguous) return miss("AMBIGUOUS_OWNERSHIP");
    if (sawNoNoteOwner) return miss("NO_NOTE_OWNER");
    return miss("UNMAPPED_ELEMENT");
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
    this.#resetHitTestIndex();
    instrument.Visible = visible;
    if (!osmd.updateGraphic) throw new Error("OSMD updateGraphic() is unavailable for part visibility changes.");
    osmd.updateGraphic();
    osmd.render();
    this.#rendered = true;
    try {
      this.#rebuildHitTestIndex();
    } catch (error) {
      this.#rendered = false;
      this.#resetHitTestIndex();
      throw error;
    }
  }

  async dispose(): Promise<void> {
    await this.clearHighlights();
    this.#resetHitTestIndex();
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

  #listGraphicalNotes(partId: string, measureIndex: number): readonly IndexedGraphicalNote[] {
    const osmd = this.#ensureOsmd();
    const instrument = this.#findInstrument(partId);
    const measure = osmd.graphic?.measureList?.[measureIndex];
    if (!measure) throw new Error(`Rendered measure ${measureIndex} is unavailable.`);
    const indexedNotes: IndexedGraphicalNote[] = [];
    const voiceIndexes = new Map<number, number>();
    let globalIndex = 0;
    const staffIds = instrument.Staves.map((staff) => staff.idInMusicSheet).sort((a, b) => a - b);
    for (const staffId of staffIds) {
      const graphicalMeasure = measure[staffId];
      for (const staffEntry of graphicalMeasure?.staffEntries ?? []) {
        for (const graphicalVoiceEntry of staffEntry.graphicalVoiceEntries ?? []) {
          const voice = normalizedVoiceId(graphicalVoiceEntry);
          for (const note of graphicalVoiceEntry.notes ?? []) {
            if (voice === undefined) {
              indexedNotes.push(Object.freeze({ note, globalIndex }));
            } else {
              const voiceIndex = voiceIndexes.get(voice) ?? 0;
              indexedNotes.push(Object.freeze({ note, globalIndex, voice, voiceIndex }));
              voiceIndexes.set(voice, voiceIndex + 1);
            }
            globalIndex += 1;
          }
        }
      }
    }
    return indexedNotes;
  }

  #resolveGraphicalNote(target: ScoreNoteRef): OsmdGraphicalNote {
    requireNonNegativeInteger(target.measureIndex, "measureIndex");
    requireNonNegativeInteger(target.noteIndex, "noteIndex");
    if (target.voice !== undefined) requireNonNegativeInteger(target.voice, "voice");
    const notes = this.#listGraphicalNotes(target.partId, target.measureIndex);
    const selected = target.voice === undefined
      ? notes.find((entry) => entry.globalIndex === target.noteIndex)
      : notes.find((entry) => entry.voice === target.voice && entry.voiceIndex === target.noteIndex);
    if (selected === undefined) {
      const voiceSuffix = target.voice === undefined ? "" : ` for voice ${target.voice}`;
      throw new Error(`Rendered note ${target.noteIndex}${voiceSuffix} was not found in part '${target.partId}', measure ${target.measureIndex}.`);
    }
    return selected.note;
  }

  #isRest(note: OsmdGraphicalNote): boolean {
    const isRest = note.sourceNote?.isRest;
    return typeof isRest === "function" && isRest.call(note.sourceNote) === true;
  }

  #resolveExactNoteheadElement(note: OsmdGraphicalNote): Element {
    if (this.#isRest(note)) {
      throw new Error("The selected score entry is a rest and has no notehead interaction target.");
    }
    const noteheads = note.getNoteheadSVGs?.();
    if (!Array.isArray(noteheads) || noteheads.length === 0) {
      throw new Error("OSMD did not expose notehead SVG elements for the selected note.");
    }
    const rawIndex = note.vfnoteIndex;
    const index = Number.isSafeInteger(rawIndex) && (rawIndex as number) >= 0
      ? rawIndex as number
      : noteheads.length === 1
        ? 0
        : undefined;
    if (index === undefined) {
      throw new Error("OSMD did not expose a valid notehead index for an ambiguous multi-note graphical entry.");
    }
    const element = noteheads[index];
    const ElementConstructor = this.#container.ownerDocument.defaultView?.Element;
    if (ElementConstructor === undefined || !(element instanceof ElementConstructor)) {
      throw new Error("OSMD did not expose an exact SVG notehead element for the selected note.");
    }
    return element;
  }

  #resolveOwnedGraphicalGroup(note: OsmdGraphicalNote): Element | null {
    const group = note.getSVGGElement?.();
    const ElementConstructor = this.#container.ownerDocument.defaultView?.Element;
    return ElementConstructor !== undefined && group instanceof ElementConstructor ? group : null;
  }

  #resolveElementOwnership(initial: Element): ElementOwnershipResult {
    let current: Element | null = initial;
    let resolved: ScoreNoteRef | undefined;
    while (current !== null) {
      if (current === this.#container) {
        return resolved === undefined
          ? Object.freeze({ insideContainer: true })
          : Object.freeze({ insideContainer: true, target: resolved });
      }
      const owner = this.#noteRefByElement.get(current);
      if (owner === AMBIGUOUS_HIT_OWNER) {
        if (resolved === undefined) {
          return Object.freeze({ insideContainer: true, reason: "AMBIGUOUS_OWNERSHIP" });
        }
      } else if (owner === NO_NOTE_HIT_OWNER) {
        if (resolved === undefined) {
          return Object.freeze({ insideContainer: true, reason: "NO_NOTE_OWNER" });
        }
      } else if (owner !== undefined) {
        if (resolved !== undefined && !sameScoreNoteRef(resolved, owner)) {
          return Object.freeze({ insideContainer: true, reason: "AMBIGUOUS_OWNERSHIP" });
        }
        resolved = owner;
      }
      current = current.parentElement;
    }
    return Object.freeze({ insideContainer: false });
  }

  #rebuildHitTestIndex(): void {
    this.#resetHitTestIndex();
    const osmd = this.#ensureOsmd();
    const instruments = osmd.Sheet?.Instruments ?? [];
    const measureCount = osmd.graphic?.measureList?.length ?? 0;
    let indexedGraphicalNoteCount = 0;
    for (const instrument of instruments) {
      for (let measureIndex = 0; measureIndex < measureCount; measureIndex += 1) {
        const entries = this.#listGraphicalNotes(instrument.IdString, measureIndex);
        for (const entry of entries) {
          indexedGraphicalNoteCount += 1;
          if (indexedGraphicalNoteCount > MAX_HIT_TEST_NOTE_ELEMENTS) {
            throw new RangeError(`Rendered note hit-test index exceeds ${MAX_HIT_TEST_NOTE_ELEMENTS} graphical notes.`);
          }
          if (this.#isRest(entry.note)) {
            const restGroup = this.#resolveOwnedGraphicalGroup(entry.note);
            if (restGroup !== null) this.#registerHitTestElement(restGroup, NO_NOTE_HIT_OWNER);
            continue;
          }
          const element = this.#resolveExactNoteheadElement(entry.note);
          const target: ScoreNoteRef = entry.voice === undefined
            ? Object.freeze({ partId: instrument.IdString, measureIndex, noteIndex: entry.globalIndex })
            : Object.freeze({
                partId: instrument.IdString,
                measureIndex,
                noteIndex: entry.voiceIndex as number,
                voice: entry.voice,
              });
          this.#registerHitTestElement(element, target);
          const group = this.#resolveOwnedGraphicalGroup(entry.note);
          if (group !== null && group !== element) this.#registerHitTestElement(group, target);
        }
      }
    }
  }

  #registerHitTestElement(element: Element, owner: HitTestOwner): void {
    if (!this.#noteRefByElement.has(element)) {
      this.#noteRefByElement.set(element, owner);
      return;
    }
    const previous = this.#noteRefByElement.get(element);
    if (previous === undefined || previous === AMBIGUOUS_HIT_OWNER) return;
    if (owner === AMBIGUOUS_HIT_OWNER) {
      this.#noteRefByElement.set(element, AMBIGUOUS_HIT_OWNER);
      return;
    }
    if (previous === NO_NOTE_HIT_OWNER && owner === NO_NOTE_HIT_OWNER) return;
    if (isScoreNoteRefOwner(previous) && isScoreNoteRefOwner(owner) && sameScoreNoteRef(previous, owner)) return;
    this.#noteRefByElement.set(element, AMBIGUOUS_HIT_OWNER);
  }

  #resetHitTestIndex(): void {
    this.#noteRefByElement = new WeakMap();
  }

  #ensureHighlightStyle(): void {
    if (this.#container.querySelector("style[data-st-score-highlight-style]") !== null) return;
    const document = this.#container.ownerDocument;
    const style = document.createElement("style");
    style.setAttribute("data-st-score-highlight-style", "true");
    style.textContent = '[data-st-score-highlight="true"] { fill: #ff8c00 !important; stroke: #ff8c00 !important; } [data-st-score-highlight="true"] * { fill: #ff8c00 !important; stroke: #ff8c00 !important; }';
    this.#container.prepend(style);
  }
}
