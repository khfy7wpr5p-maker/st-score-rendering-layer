import {
  SCORE_RENDERER_CONTRACT_VERSION,
  type ScoreMeasureRef,
  type ScoreRenderOptions,
  type ScoreRenderResult,
  type ScoreRenderer,
  type ScoreSource,
} from "@st/score-renderer-contracts";
import { validateScoreSource } from "@st/score-renderer-core";
import { OsmdRenderer } from "@st/score-renderer-osmd";

export type BrowserRendererFactory = (container: HTMLElement) => ScoreRenderer;

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
  ): Promise<ScoreRenderResult> {
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
        return result;
      } catch (error) {
        await this.#resetCurrentRenderer();
        throw error;
      }
    } finally {
      this.#renderInFlight = false;
    }
  }

  async exportSvg(): Promise<readonly string[]> {
    this.#requireAvailable();
    if (this.#renderInFlight) {
      throw new BrowserScoreHostUnavailableError("SVG export is unavailable while rendering is in progress.");
    }
    const renderer = this.#renderer;
    if (renderer === undefined) {
      throw new BrowserScoreHostUnavailableError("A score must be rendered before SVG export.");
    }
    return renderer.exportSvg();
  }

  async moveCursor(target: ScoreMeasureRef): Promise<void> {
    this.#requireAvailable();
    if (this.#renderInFlight) {
      throw new BrowserScoreHostUnavailableError("Measure cursor is unavailable while rendering is in progress.");
    }
    const renderer = this.#renderer;
    if (renderer === undefined) {
      throw new BrowserScoreHostUnavailableError("A score must be rendered before moving the measure cursor.");
    }
    if (!renderer.capabilities.has("cursor")) {
      throw new BrowserScoreHostUnavailableError("Selected renderer does not provide measure cursor capability.");
    }
    await renderer.moveCursor(target);
  }

  async dispose(): Promise<void> {
    if (this.#disposed) return;
    this.#disposed = true;
    await this.#resetCurrentRenderer();
  }

  #requireAvailable(): void {
    if (this.#disposed) {
      throw new BrowserScoreHostUnavailableError("BrowserScoreHost has been disposed.");
    }
  }

  async #resetCurrentRenderer(): Promise<void> {
    const renderer = this.#renderer;
    this.#renderer = undefined;
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
