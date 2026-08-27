import type { ScoreNoteRef } from "@st/score-renderer-contracts";

export const DEFAULT_MAX_ACCESSIBLE_TARGETS = 10_000;
export const DEFAULT_MAX_ACCESSIBILITY_LABEL_LENGTH = 512;

export type ScoreAccessibilityEntry = Readonly<{
  target: ScoreNoteRef;
  label: string;
  focusable?: boolean;
}>;

export type RenderedTargetResolver = (
  target: ScoreNoteRef,
) => Element | null | undefined;

export type ScoreAccessibilityBridgeOptions = Readonly<{
  maxEntries?: number;
  maxLabelLength?: number;
}>;

type AttributeSnapshot = Readonly<{
  present: boolean;
  value: string | null;
}>;

type AppliedTarget = Readonly<{
  key: string;
  target: ScoreNoteRef;
  element: Element;
  focusable: boolean;
  ariaLabel: AttributeSnapshot;
  role: AttributeSnapshot;
  tabindex: AttributeSnapshot;
  marker: AttributeSnapshot;
}>;

type FocusableElement = Element & {
  focus?: () => void;
};

const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F-\u009F]/u;
const MAX_CONFIGURED_ENTRIES = 50_000;
const MAX_CONFIGURED_LABEL_LENGTH = 2_048;

function requirePositiveInteger(value: number, label: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(`${label} must be a positive safe integer no greater than ${maximum}.`);
  }
  return value;
}

function requireNonNegativeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
}

function requireSafePartId(partId: string): string {
  const normalized = partId.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 256 ||
    normalized !== partId ||
    CONTROL_CHARACTER_PATTERN.test(normalized)
  ) {
    throw new Error("Accessibility target partId must contain 1-256 printable characters with no surrounding whitespace.");
  }
  return normalized;
}

function targetKey(target: ScoreNoteRef): string {
  const partId = requireSafePartId(target.partId);
  requireNonNegativeInteger(target.measureIndex, "measureIndex");
  requireNonNegativeInteger(target.noteIndex, "noteIndex");
  if (target.voice !== undefined) requireNonNegativeInteger(target.voice, "voice");
  return `${partId}\u0000${target.measureIndex}\u0000${target.voice ?? ""}\u0000${target.noteIndex}`;
}

function normalizeLabel(label: string, maxLength: number): string {
  if (typeof label !== "string") throw new TypeError("Accessibility label must be a string.");
  const normalized = label.trim();
  if (normalized.length === 0 || normalized.length > maxLength) {
    throw new Error(`Accessibility label must contain 1-${maxLength} characters.`);
  }
  if (CONTROL_CHARACTER_PATTERN.test(normalized)) {
    throw new Error("Accessibility label must not contain control characters.");
  }
  return normalized;
}

function snapshotAttribute(element: Element, name: string): AttributeSnapshot {
  return {
    present: element.hasAttribute(name),
    value: element.getAttribute(name),
  };
}

function restoreAttribute(element: Element, name: string, snapshot: AttributeSnapshot): void {
  if (!snapshot.present) {
    element.removeAttribute(name);
    return;
  }
  element.setAttribute(name, snapshot.value ?? "");
}

function restoreTarget(target: AppliedTarget): void {
  restoreAttribute(target.element, "aria-label", target.ariaLabel);
  restoreAttribute(target.element, "role", target.role);
  restoreAttribute(target.element, "tabindex", target.tabindex);
  restoreAttribute(target.element, "data-st-score-a11y", target.marker);
}

function focusElement(element: Element): void {
  const focus = (element as FocusableElement).focus;
  if (typeof focus !== "function") {
    throw new Error("The resolved accessibility target is not focusable in this runtime.");
  }
  focus.call(element);
}

export class ScoreAccessibilityBridge {
  readonly #resolver: RenderedTargetResolver;
  readonly #maxEntries: number;
  readonly #maxLabelLength: number;
  #applied: readonly AppliedTarget[] = [];
  #focusOrder: readonly AppliedTarget[] = [];
  #focusIndex = -1;

  constructor(resolver: RenderedTargetResolver, options: ScoreAccessibilityBridgeOptions = {}) {
    if (typeof resolver !== "function") throw new TypeError("RenderedTargetResolver must be a function.");
    this.#resolver = resolver;
    this.#maxEntries = requirePositiveInteger(
      options.maxEntries ?? DEFAULT_MAX_ACCESSIBLE_TARGETS,
      "maxEntries",
      MAX_CONFIGURED_ENTRIES,
    );
    this.#maxLabelLength = requirePositiveInteger(
      options.maxLabelLength ?? DEFAULT_MAX_ACCESSIBILITY_LABEL_LENGTH,
      "maxLabelLength",
      MAX_CONFIGURED_LABEL_LENGTH,
    );
  }

  get size(): number {
    return this.#applied.length;
  }

  apply(entries: readonly ScoreAccessibilityEntry[]): Readonly<{ count: number }> {
    if (!Array.isArray(entries)) throw new TypeError("Accessibility entries must be an array.");
    if (entries.length > this.#maxEntries) {
      throw new RangeError(`Accessibility map exceeds the configured ${this.#maxEntries}-target limit.`);
    }

    const keys = new Set<string>();
    const elements = new Set<Element>();
    const prepared: Array<Readonly<{
      key: string;
      target: ScoreNoteRef;
      label: string;
      element: Element;
      focusable: boolean;
    }>> = [];

    // Phase 1: validate and resolve every semantic target before mutating the DOM.
    for (const entry of entries) {
      const key = targetKey(entry.target);
      if (keys.has(key)) throw new Error(`Duplicate accessibility target '${key}' is not allowed.`);
      keys.add(key);

      const label = normalizeLabel(entry.label, this.#maxLabelLength);
      const element = this.#resolver(entry.target);
      if (!element) throw new Error(`Accessibility target '${key}' could not be resolved in the rendered score.`);
      if (elements.has(element)) {
        throw new Error("Two accessibility targets resolved to the same rendered element.");
      }
      elements.add(element);
      prepared.push({ key, target: entry.target, label, element, focusable: entry.focusable ?? true });
    }

    // Phase 2: only after the entire map is known-good do we replace the active overlay.
    this.clear();
    const applied: AppliedTarget[] = [];
    try {
      for (const target of prepared) {
        const snapshot: AppliedTarget = {
          key: target.key,
          target: target.target,
          element: target.element,
          focusable: target.focusable,
          ariaLabel: snapshotAttribute(target.element, "aria-label"),
          role: snapshotAttribute(target.element, "role"),
          tabindex: snapshotAttribute(target.element, "tabindex"),
          marker: snapshotAttribute(target.element, "data-st-score-a11y"),
        };
        // Register the snapshot before the first mutation so even a throwing DOM
        // implementation cannot leave a partially-applied accessibility overlay.
        applied.push(snapshot);
        target.element.setAttribute("aria-label", target.label);
        target.element.setAttribute("role", "img");
        target.element.setAttribute("tabindex", target.focusable ? "0" : "-1");
        target.element.setAttribute("data-st-score-a11y", "true");
      }
    } catch (error) {
      for (const target of applied.reverse()) restoreTarget(target);
      throw error;
    }

    this.#applied = Object.freeze([...applied]);
    this.#focusOrder = Object.freeze(applied.filter((target) => target.focusable));
    this.#focusIndex = -1;
    return { count: applied.length };
  }

  focus(target: ScoreNoteRef): void {
    const key = targetKey(target);
    const index = this.#focusOrder.findIndex((candidate) => candidate.key === key);
    if (index < 0) throw new Error("The requested accessibility target is not in the active focus order.");
    const selected = this.#focusOrder[index];
    if (!selected) throw new Error("Accessibility focus order is inconsistent.");
    focusElement(selected.element);
    this.#focusIndex = index;
  }

  focusNext(): boolean {
    const nextIndex = this.#focusIndex + 1;
    const selected = this.#focusOrder[nextIndex];
    if (!selected) return false;
    focusElement(selected.element);
    this.#focusIndex = nextIndex;
    return true;
  }

  focusPrevious(): boolean {
    const previousIndex = this.#focusIndex < 0 ? this.#focusOrder.length - 1 : this.#focusIndex - 1;
    const selected = this.#focusOrder[previousIndex];
    if (!selected) return false;
    focusElement(selected.element);
    this.#focusIndex = previousIndex;
    return true;
  }

  clear(): void {
    for (const target of [...this.#applied].reverse()) restoreTarget(target);
    this.#applied = [];
    this.#focusOrder = [];
    this.#focusIndex = -1;
  }

  dispose(): void {
    this.clear();
  }
}
