import {
  SCORE_RENDERER_CONTRACT_VERSION,
  type ScoreHighlight,
  type ScoreMeasureRef,
  type ScoreNoteRef,
  type ScoreRenderOptions,
  type ScoreRenderResult,
  type ScoreRenderer,
  type ScoreSource,
} from "@st/score-renderer-contracts";
import { validateScoreSource } from "@st/score-renderer-core";
import { OsmdRenderer } from "@st/score-renderer-osmd";

export type BrowserRendererFactory = (container: HTMLElement) => ScoreRenderer;
export type BrowserNoteHitPoint = Readonly<{ clientX: number; clientY: number }>;
export type BrowserNoteHitMissReason =
  | "NO_ELEMENT_AT_POINT"
  | "OUTSIDE_RENDER_CONTAINER"
  | "UNMAPPED_ELEMENT"
  | "AMBIGUOUS_OWNERSHIP"
  | "NO_NOTE_OWNER";
export type BrowserRenderEpoch = string;
export type BrowserRenderResult = ScoreRenderResult & Readonly<{
  renderEpoch: BrowserRenderEpoch;
  sourceId?: string;
}>;
export type BrowserRenderedHitEvidence = Readonly<{
  kind: "HIT";
  renderEpoch: BrowserRenderEpoch;
  sourceId?: string;
  target: ScoreNoteRef;
}>;
export type BrowserRenderedHitMiss = Readonly<{
  kind: "MISS";
  renderEpoch: BrowserRenderEpoch;
  sourceId?: string;
  reason: BrowserNoteHitMissReason;
}>;
export type BrowserNoteHitDetailedResult = BrowserRenderedHitEvidence | BrowserRenderedHitMiss;

type BrowserNoteHitTestRenderer = ScoreRenderer & Readonly<{
  resolveNoteAtClientPoint(point: BrowserNoteHitPoint): ScoreNoteRef | null;
}>;
type BrowserDetailedNoteHitTestRenderer = BrowserNoteHitTestRenderer & Readonly<{
  resolveNoteAtClientPointDetailed(point: BrowserNoteHitPoint): unknown;
}>;

export type BrowserScoreHostOptions = Readonly<{
  expectedContractVersion: string;
  rendererFactory?: BrowserRendererFactory;
}>;

export class ScoreRendererContractVersionMismatchError extends Error {
  readonly expected: string;
  readonly actual: string;

  constructor(expected: string, actual: string) {
    super(`Score renderer contract mismatch: expected ${expected}, received ${actual}.`);
    this.name = "ScoreRendererContractVersionMismatchError";
    this.expected = expected;
    this.actual = actual;
  }
}

export class BrowserScoreHostUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserScoreHostUnavailableError";
  }
}

const DEFAULT_RENDERER_FACTORY: BrowserRendererFactory = (container) => new OsmdRenderer(container);
const EVIDENCE_SOURCE_ID_MAX_LENGTH = 256;
const NOTE_PART_ID_MAX_LENGTH = 128;
const HIT_MISS_REASONS: ReadonlySet<BrowserNoteHitMissReason> = new Set([
  "NO_ELEMENT_AT_POINT",
  "OUTSIDE_RENDER_CONTAINER",
  "UNMAPPED_ELEMENT",
  "AMBIGUOUS_OWNERSHIP",
  "NO_NOTE_OWNER",
]);

function hasNoteHitTest(renderer: ScoreRenderer): renderer is BrowserNoteHitTestRenderer {
  return typeof (renderer as Partial<BrowserNoteHitTestRenderer>).resolveNoteAtClientPoint === "function";
}

function hasDetailedNoteHitTest(renderer: ScoreRenderer): renderer is BrowserDetailedNoteHitTestRenderer {
  return hasNoteHitTest(renderer) &&
    typeof (renderer as Partial<BrowserDetailedNoteHitTestRenderer>).resolveNoteAtClientPointDetailed === "function";
}

function requireFinitePoint(point: BrowserNoteHitPoint): void {
  if (point === null || typeof point !== "object" || Array.isArray(point)) {
    throw new TypeError("Score note hit-test point must be an object.");
  }
  if (!Number.isFinite(point.clientX) || !Number.isFinite(point.clientY)) {
    throw new RangeError("Score note hit-test coordinates must be finite numbers.");
  }
}

function requirePlainObject(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

function requireAllowedKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>, label: string): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new TypeError(`${label} contains unsupported field '${key}'.`);
  }
}

function normalizeScoreNoteRef(value: unknown): ScoreNoteRef {
  const target = requirePlainObject(value, "Detailed note hit target");
  requireAllowedKeys(target, new Set(["partId", "measureIndex", "noteIndex", "voice"]), "Detailed note hit target");
  const partId = target.partId;
  if (typeof partId !== "string" || partId.length === 0 || partId.length > NOTE_PART_ID_MAX_LENGTH || partId !== partId.trim()) {
    throw new TypeError("Detailed note hit target partId must be a non-empty bounded string without surrounding whitespace.");
  }
  const measureIndex = target.measureIndex;
  const noteIndex = target.noteIndex;
  if (!Number.isSafeInteger(measureIndex) || (measureIndex as number) < 0) {
    throw new RangeError("Detailed note hit target measureIndex must be a non-negative safe integer.");
  }
  if (!Number.isSafeInteger(noteIndex) || (noteIndex as number) < 0) {
    throw new RangeError("Detailed note hit target noteIndex must be a non-negative safe integer.");
  }
  const voice = target.voice;
  if (voice !== undefined && (!Number.isSafeInteger(voice) || (voice as number) < 0)) {
    throw new RangeError("Detailed note hit target voice must be a non-negative safe integer when supplied.");
  }
  return voice === undefined
    ? Object.freeze({ partId, measureIndex: measureIndex as number, noteIndex: noteIndex as number })
    : Object.freeze({ partId, measureIndex: measureIndex as number, noteIndex: noteIndex as number, voice: voice as number });
}

function normalizeDetailedRendererHit(value: unknown):
  | Readonly<{ kind: "HIT"; target: ScoreNoteRef }>
  | Readonly<{ kind: "MISS"; reason: BrowserNoteHitMissReason }> {
  const result = requirePlainObject(value, "Detailed note hit result");
  if (result.kind === "HIT") {
    requireAllowedKeys(result, new Set(["kind", "target"]), "Detailed note hit result");
    return Object.freeze({ kind: "HIT", target: normalizeScoreNoteRef(result.target) });
  }
  if (result.kind === "MISS") {
    requireAllowedKeys(result, new Set(["kind", "reason"]), "Detailed note hit result");
    if (typeof result.reason !== "string" || !HIT_MISS_REASONS.has(result.reason as BrowserNoteHitMissReason)) {
      throw new TypeError("Detailed note hit result contains an unsupported miss reason.");
    }
    return Object.freeze({ kind: "MISS", reason: result.reason as BrowserNoteHitMissReason });
  }
  throw new TypeError("Detailed note hit result kind must be HIT or MISS.");
}

function boundedEvidenceSourceId(sourceId: string | undefined): string | undefined {
  if (sourceId === undefined) return undefined;
  if (sourceId.length === 0 || sourceId.length > EVIDENCE_SOURCE_ID_MAX_LENGTH || sourceId !== sourceId.trim() || sourceId.includes("\u0000")) {
    return undefined;
  }
  return sourceId;
}

/**
 * Browser-only presentation host for ST score rendering.
 *
 * The host accepts bounded in-memory MusicXML, verifies the ST runtime contract,
 * owns only its presentation container, and delegates rendering through the
 * ST renderer adapter boundary. It does not grant filesystem, network, project,
 * transport, MIDI, audio, plugin, AI, or realtime authority.
 */
export class BrowserScoreHost {
  readonly #container: HTMLElement;
  readonly #expectedContractVersion: string;
  readonly #rendererFactory: BrowserRendererFactory;
  #renderer: ScoreRenderer | undefined;
  #disposed = false;
  #renderInFlight = false;
  #renderEpochCounter = 0;
  #activeRenderEpoch: BrowserRenderEpoch | undefined;
  #activeEvidenceSourceId: string | undefined;

  constructor(container: HTMLElement, options: BrowserScoreHostOptions) {
    if (typeof container?.replaceChildren !== "function") {
      throw new TypeError("BrowserScoreHost requires an HTMLElement-like presentation container.");
    }
    if (options.expectedContractVersion !== SCORE_RENDERER_CONTRACT_VERSION) {
      throw new ScoreRendererContractVersionMismatchError(
        options.expectedContractVersion,
        SCORE_RENDERER_CONTRACT_VERSION,
      );
    }

    this.#container = container;
    this.#expectedContractVersion = options.expectedContractVersion;
    this.#rendererFactory = options.rendererFactory ?? DEFAULT_RENDERER_FACTORY;
  }

  get expectedContractVersion(): string {
    return this.#expectedContractVersion;
  }

  async renderMusicXml(
    content: string,
    options: ScoreRenderOptions = {},
    sourceId?: string,
  ): Promise<BrowserRenderResult> {
    this.#requireAvailable();
    if (this.#renderInFlight) {
      throw new BrowserScoreHostUnavailableError(
        "A score render is already in progress; concurrent replacement is not allowed.",
      );
    }
    this.#renderInFlight = true;

    try {
      const source: ScoreSource = sourceId === undefined
        ? { kind: "musicxml", content }
        : { kind: "musicxml", content, sourceId };

      try {
        validateScoreSource(source);
      } catch (error) {
        await this.#resetCurrentRenderer();
        throw error;
      }

      await this.#resetCurrentRenderer();
      this.#requireAvailable();

      try {
        const renderer = this.#rendererFactory(this.#container);
        this.#renderer = renderer;
        if (!renderer.capabilities.has("musicxml-render") || !renderer.capabilities.has("svg-export")) {
          throw new BrowserScoreHostUnavailableError(
            "Selected renderer does not provide the required browser-host capabilities.",
          );
        }

        await renderer.load(source);
        this.#requireAvailable();
        const result = await renderer.render(options);
        this.#requireAvailable();
        if (result.contractVersion !== this.#expectedContractVersion) {
          throw new ScoreRendererContractVersionMismatchError(
            this.#expectedContractVersion,
            result.contractVersion,
          );
        }
        const renderEpoch = this.#nextRenderEpoch();
        const evidenceSourceId = boundedEvidenceSourceId(sourceId);
        this.#activeRenderEpoch = renderEpoch;
        this.#activeEvidenceSourceId = evidenceSourceId;
        return evidenceSourceId === undefined
          ? Object.freeze({ ...result, renderEpoch })
          : Object.freeze({ ...result, renderEpoch, sourceId: evidenceSourceId });
      } catch (error) {
        await this.#resetCurrentRenderer();
        throw error;
      }
    } finally {
      this.#renderInFlight = false;
    }
  }

  async exportSvg(): Promise<readonly string[]> {
    const renderer = this.#requireRenderer("SVG export");
    return renderer.exportSvg();
  }

  async moveCursor(target: ScoreMeasureRef): Promise<void> {
    const renderer = this.#requireRenderer("Measure cursor");
    if (!renderer.capabilities.has("cursor")) {
      throw new BrowserScoreHostUnavailableError("Selected renderer does not provide measure cursor capability.");
    }
    await renderer.moveCursor(target);
  }

  hitTestNote(point: BrowserNoteHitPoint): ScoreNoteRef | null {
    requireFinitePoint(point);
    const renderer = this.#requireRenderer("Note hit-test");
    if (!hasNoteHitTest(renderer)) {
      throw new BrowserScoreHostUnavailableError("Selected renderer does not provide note hit-test capability.");
    }
    return renderer.resolveNoteAtClientPoint(point);
  }

  hitTestNoteDetailed(point: BrowserNoteHitPoint): BrowserNoteHitDetailedResult {
    requireFinitePoint(point);
    const renderer = this.#requireRenderer("Detailed note hit-test");
    if (!hasDetailedNoteHitTest(renderer)) {
      throw new BrowserScoreHostUnavailableError("Selected renderer does not provide detailed note hit-test capability.");
    }
    const renderEpoch = this.#activeRenderEpoch;
    if (renderEpoch === undefined) {
      throw new BrowserScoreHostUnavailableError("Detailed note hit-test requires an active render epoch.");
    }
    const result = normalizeDetailedRendererHit(renderer.resolveNoteAtClientPointDetailed(point));
    const sourceId = this.#activeEvidenceSourceId;
    if (result.kind === "HIT") {
      return sourceId === undefined
        ? Object.freeze({ kind: "HIT", renderEpoch, target: result.target })
        : Object.freeze({ kind: "HIT", renderEpoch, sourceId, target: result.target });
    }
    return sourceId === undefined
      ? Object.freeze({ kind: "MISS", renderEpoch, reason: result.reason })
      : Object.freeze({ kind: "MISS", renderEpoch, sourceId, reason: result.reason });
  }

  async highlight(highlight: ScoreHighlight): Promise<void> {
    const renderer = this.#requireRenderer("Note highlight");
    if (!renderer.capabilities.has("note-highlight")) {
      throw new BrowserScoreHostUnavailableError("Selected renderer does not provide note highlight capability.");
    }
    await renderer.highlight(highlight);
  }

  async clearHighlights(): Promise<void> {
    const renderer = this.#requireRenderer("Note highlight clearing");
    if (!renderer.capabilities.has("note-highlight")) {
      throw new BrowserScoreHostUnavailableError("Selected renderer does not provide note highlight capability.");
    }
    await renderer.clearHighlights();
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    await this.#resetCurrentRenderer();
  }

  #nextRenderEpoch(): BrowserRenderEpoch {
    if (this.#renderEpochCounter >= Number.MAX_SAFE_INTEGER) {
      throw new BrowserScoreHostUnavailableError("Render epoch space is exhausted for this browser host instance.");
    }
    this.#renderEpochCounter += 1;
    return `render-${this.#renderEpochCounter.toString(36)}`;
  }

  #requireAvailable(): void {
    if (this.#disposed) {
      throw new BrowserScoreHostUnavailableError("BrowserScoreHost has been disposed.");
    }
  }

  #requireRenderer(operation: string): ScoreRenderer {
    this.#requireAvailable();
    if (this.#renderInFlight) {
      throw new BrowserScoreHostUnavailableError(`${operation} is unavailable while rendering is in progress.`);
    }
    const renderer = this.#renderer;
    if (renderer === undefined) {
      throw new BrowserScoreHostUnavailableError(`A score must be rendered before ${operation.toLowerCase()}.`);
    }
    return renderer;
  }

  async #resetCurrentRenderer(): Promise<void> {
    const renderer = this.#renderer;
    this.#renderer = undefined;
    this.#activeRenderEpoch = undefined;
    this.#activeEvidenceSourceId = undefined;
    if (renderer !== undefined) {
      try {
        await renderer.dispose();
      } catch {
        // Container clearing below is the fail-closed authority boundary.
      }
    }
    this.#container.replaceChildren();
  }
}
