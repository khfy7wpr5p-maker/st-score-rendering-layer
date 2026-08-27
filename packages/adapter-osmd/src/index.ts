import * as OsmdModule from "opensheetmusicdisplay";
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

export interface OsmdEngine {
  load(content: string): Promise<unknown>;
  setOptions(options: Record<string, unknown>): void;
  render(): void;
}

export type OsmdFactory = (container: HTMLElement) => OsmdEngine;

const CAPABILITIES: ReadonlySet<ScoreRendererCapability> = new Set(["musicxml-render", "svg-export"]);

type OsmdModuleShape = Partial<typeof OsmdModule> & {
  default?: Partial<typeof OsmdModule>;
};

function resolveOpenSheetMusicDisplay(): typeof OsmdModule.OpenSheetMusicDisplay {
  const moduleShape = OsmdModule as OsmdModuleShape;
  const constructor = moduleShape.OpenSheetMusicDisplay ?? moduleShape.default?.OpenSheetMusicDisplay;
  if (constructor === undefined) {
    throw new Error("OpenSheetMusicDisplay constructor is unavailable from the installed OSMD module.");
  }
  return constructor;
}

function createDefaultOsmd(container: HTMLElement): OsmdEngine {
  const OpenSheetMusicDisplay = resolveOpenSheetMusicDisplay();
  return new OpenSheetMusicDisplay(container, { autoResize: true, backend: "svg" });
}

export class OsmdRenderer implements ScoreRenderer {
  readonly id = "osmd";
  readonly capabilities = CAPABILITIES;
  readonly #container: HTMLElement;
  readonly #factory: OsmdFactory;
  #osmd: OsmdEngine | undefined;
  #loaded = false;

  constructor(container: HTMLElement, factory: OsmdFactory = createDefaultOsmd) {
    this.#container = container;
    this.#factory = factory;
  }

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

  async highlight(_highlight: ScoreHighlight): Promise<void> {
    throw new UnsupportedRendererCapabilityError("note-highlight");
  }

  async clearHighlights(): Promise<void> {
    throw new UnsupportedRendererCapabilityError("note-highlight");
  }

  async moveCursor(_target: ScoreMeasureRef): Promise<void> {
    throw new UnsupportedRendererCapabilityError("cursor");
  }

  async setPartVisible(_part: ScorePartRef, _visible: boolean): Promise<void> {
    throw new UnsupportedRendererCapabilityError("part-visibility");
  }

  async dispose(): Promise<void> {
    this.#container.replaceChildren();
    this.#osmd = undefined;
    this.#loaded = false;
  }

  #ensureOsmd(): OsmdEngine {
    if (this.#osmd === undefined) this.#osmd = this.#factory(this.#container);
    return this.#osmd;
  }
}
