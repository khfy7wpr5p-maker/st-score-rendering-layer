import type { ScoreRenderer, ScoreSource } from "@st/score-renderer-contracts";

export const DEFAULT_MAX_MUSICXML_BYTES = 5 * 1024 * 1024;

export class InvalidScoreSourceError extends Error {
  readonly code = "INVALID_SCORE_SOURCE";
  constructor(message: string) {
    super(message);
    this.name = "InvalidScoreSourceError";
  }
}

export class UnsupportedRendererCapabilityError extends Error {
  readonly code = "UNSUPPORTED_RENDERER_CAPABILITY";
  constructor(capability: string) {
    super(`Renderer capability is not supported: ${capability}`);
    this.name = "UnsupportedRendererCapabilityError";
  }
}

export function validateScoreSource(source: ScoreSource, maxBytes: number = DEFAULT_MAX_MUSICXML_BYTES): void {
  if (source.kind !== "musicxml") {
    throw new InvalidScoreSourceError("Only in-memory MusicXML sources are accepted.");
  }
  if (source.content.trim().length === 0) {
    throw new InvalidScoreSourceError("MusicXML content must not be empty.");
  }
  if (source.content.includes("\u0000")) {
    throw new InvalidScoreSourceError("MusicXML content contains a NUL byte.");
  }
  const byteLength = new TextEncoder().encode(source.content).byteLength;
  if (byteLength > maxBytes) {
    throw new InvalidScoreSourceError(`MusicXML exceeds the ${maxBytes}-byte input limit.`);
  }
}

export class RendererRegistry {
  readonly #renderers = new Map<string, ScoreRenderer>();
  register(renderer: ScoreRenderer): void {
    if (this.#renderers.has(renderer.id)) throw new Error(`Renderer already registered: ${renderer.id}`);
    this.#renderers.set(renderer.id, renderer);
  }
  get(id: string): ScoreRenderer | undefined { return this.#renderers.get(id); }
  list(): readonly ScoreRenderer[] { return [...this.#renderers.values()]; }
  async disposeAll(): Promise<void> {
    const renderers = [...this.#renderers.values()];
    this.#renderers.clear();
    await Promise.all(renderers.map((renderer) => renderer.dispose()));
  }
}
