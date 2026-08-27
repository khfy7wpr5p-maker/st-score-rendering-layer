import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import {
  SCORE_RENDERER_CONTRACT_VERSION,
  type ScoreHighlight,
  type ScoreMeasureRef,
  type ScorePartRef,
  type ScoreRenderOptions,
  type ScoreRenderResult,
  type ScoreRenderer,
  type ScoreRendererCapability,
  type ScoreSource,
} from "@st/score-renderer-contracts";
import { UnsupportedRendererCapabilityError, validateScoreSource } from "@st/score-renderer-core";

const CAPABILITIES: ReadonlySet<ScoreRendererCapability> = new Set(["musicxml-render", "svg-export", "tablature"]);

export class OsmdRenderer implements ScoreRenderer {
  readonly id = "osmd";
  readonly capabilities = CAPABILITIES;
  readonly #container: HTMLElement;
  #osmd: OpenSheetMusicDisplay | undefined;
  #loaded = false;

  constructor(container: HTMLElement) { this.#container = container; }

  async load(source: ScoreSource): Promise<void> {
    validateScoreSource(source);
    const osmd = this.#ensureOsmd();
    await osmd.load(source.content);
    this.#loaded = true;
  }

  async render(options: ScoreRenderOptions = {}): Promise<ScoreRenderResult> {
    if (!this.#loaded) throw new Error("A MusicXML score must be loaded before render().");
    const osmd = this.#ensureOsmd();
    osmd.setOptions({
      autoResize: options.autoResize ?? true,
      drawTitle: options.drawTitle ?? true,
      drawComposer: options.drawComposer ?? true,
      pageFormat: options.pageMode === "page" ? "A4 P" : "Endless",
    });
    osmd.render();
    return { rendererId: this.id, contractVersion: SCORE_RENDERER_CONTRACT_VERSION };
  }

  async exportSvg(): Promise<readonly string[]> {
    return [...this.#container.querySelectorAll("svg")].map((node) => node.outerHTML);
  }
  async highlight(_highlight: ScoreHighlight): Promise<void> { throw new UnsupportedRendererCapabilityError("note-highlight"); }
  async clearHighlights(): Promise<void> { throw new UnsupportedRendererCapabilityError("note-highlight"); }
  async moveCursor(_target: ScoreMeasureRef): Promise<void> { throw new UnsupportedRendererCapabilityError("cursor"); }
  async setPartVisible(_part: ScorePartRef, _visible: boolean): Promise<void> { throw new UnsupportedRendererCapabilityError("part-visibility"); }

  async dispose(): Promise<void> {
    this.#container.replaceChildren();
    this.#osmd = undefined;
    this.#loaded = false;
  }

  #ensureOsmd(): OpenSheetMusicDisplay {
    if (this.#osmd === undefined) {
      this.#osmd = new OpenSheetMusicDisplay(this.#container, { autoResize: true, backend: "svg" });
    }
    return this.#osmd;
  }
}
