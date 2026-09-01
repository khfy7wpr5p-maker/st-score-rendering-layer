# Note Interaction / Hit-Test / Highlight Boundary

## Authority

This layer is presentation-only. The renderer owns rendered-note hit-testing and reversible highlighting; the consumer owns canonical musical identity and selected-note application state.

The renderer does **not** own pitch, duration, octave, voice correctness, tie/tuplet correction, OMR truth, teacher approval or edit authority.

A successful hit-test returns only a `ScoreNoteRef`. Consumers must resolve that locator against their own canonical model before an edit/correction action.

Invalid assumption:

```text
renderer ScoreNoteRef.noteIndex == consumer global/canonical NoteObject array index
```

## Event ownership

The renderer does not register `pointerdown`, `touchstart`, `click` or gesture listeners. A host/application obtains an event and calls:

```ts
host.hitTestNote({ clientX: event.clientX, clientY: event.clientY })
```

Gesture policy, touch-action policy, selection/deselection and application callbacks remain consumer responsibilities.

## ScoreNoteRef identity policy

```ts
{
  partId: string;
  measureIndex: number;
  noteIndex: number;
  voice?: number;
}
```

Traversal policy:

```text
selected part / Instrument.IdString
→ instrument staves sorted by idInMusicSheet
→ staff entry order
→ graphical voice entry order
→ graphical note order
```

When a valid non-negative OSMD/MusicXML voice id is available, hit-test returns `voice` and `noteIndex` is counted within that voice for the selected part+measure. If a usable voice id is unavailable, the renderer does not invent one; `voice` is omitted and `noteIndex` is the unfiltered traversal index for that part+measure.

Pitch, duration and visual proximity are never used to establish identity.

## Visual geometry vs interaction geometry

These are deliberately different concepts.

**Visual geometry** is the SVG geometry produced by OSMD.

**Interaction geometry** is deterministic DOM ownership registered by the ST adapter:

- the exact notehead element is the strongest target;
- a graphical-note group obtained from the same exact OSMD `GraphicalNote` may additionally be an interaction owner when exactly one `ScoreNoteRef` owns it;
- shared groups are ambiguous and fail closed.

There is no synthetic bounding-box expansion, hit radius, nearest-note search or score-space distance calculation.

## Browser adapter hit-test

`OsmdRenderer.resolveNoteAtClientPoint({ clientX, clientY })` is an OSMD-adapter extension. It is intentionally not required by the base `ScoreRenderer` interface in contract `0.2.0`.

After each successful render, the adapter builds a bounded DOM-to-`ScoreNoteRef` index. The index:

- uses the same graphical traversal as `ScoreNoteRef` resolution;
- stores only DOM ownership and stable locator values;
- uses a `WeakMap`;
- is rebuilt after render and part-visibility graphic rebuilds;
- is reset on load, rerender failure and dispose;
- is bounded to 200,000 graphical notes per render;
- never searches for a nearest note.

If two different `ScoreNoteRef` values claim the same DOM element, that element is marked ambiguous.

## Client-coordinate policy

The adapter accepts browser viewport coordinates and calls:

```ts
document.elementFromPoint(clientX, clientY)
```

It then walks DOM ancestry only until the renderer container.

There is no custom:

- viewport→score coordinate conversion;
- scroll-offset calculation;
- device-pixel-ratio conversion;
- browser/pinch zoom transform;
- bounding-box spatial index.

The browser's DOM hit-testing resolves the currently rendered/transformed element.

## Exact notehead and graphical-group ownership

The pinned OSMD `2.1.2` adapter uses `getNoteheadSVGs()`, `vfnoteIndex` and `getSVGGElement()`.

The notehead remains the strongest exact identity target. Chord members may share a graphical group while having distinct noteheads, so an exact notehead descendant can resolve successfully even when a broader ancestor is ambiguous.

A uniquely owned graphical note group may widen touch ownership to stem/flag/dot/other descendants of that same group. If multiple notes claim the group, a group-only hit returns `null`.

For a single pitched graphical note, if `vfnoteIndex` is unavailable but `getNoteheadSVGs()` exposes exactly one element, index `0` is accepted as an unambiguous fallback. Multi-note cases require a valid exact notehead index or fail closed.

Graphical rests are excluded from note interaction.

## Hit results

May resolve:

- exact mapped notehead element or descendant;
- uniquely-owned graphical-note group or descendant.

Returns `null` for:

- ambiguous shared groups without a more-specific exact notehead hit;
- duplicate exact-notehead ownership;
- rests;
- staff/measure whitespace;
- unmapped SVG/HTML nodes;
- elements outside the renderer container;
- no DOM element at the client point.

There is no nearest-note or pitch-matching fallback.

## BrowserScoreHost API

```ts
host.hitTestNote({ clientX, clientY })
// ScoreNoteRef | null

await host.highlight({ target: scoreNoteRef, className? })
await host.clearHighlights()
```

Interaction is rejected when:

- the host is disposed;
- no score has been rendered;
- a replacement render is in flight;
- hit-test is unavailable on the selected renderer;
- note-highlight capability is unavailable.

`highlight()` targets the exact `ScoreNoteRef` traversal, adds renderer-owned DOM class/marker state and does not change source MusicXML colors. `clearHighlights()` removes only state tracked by the renderer.

## Selection and deselection

`BrowserScoreHost` and `OsmdRenderer` do not store a `selectedNote` field.

A normal consumer flow is:

```text
hitTestNote
→ consumer resolves ScoreNoteRef
→ consumer stores selected canonical note
→ highlight(ScoreNoteRef)

consumer deselects
→ consumer clears selected canonical note
→ clearHighlights()
```

A rerender clears highlight/index state. If traversal is unchanged, the same logical rendered note may produce the same `ScoreNoteRef`, but the DOM target is not treated as stable identity.

## Runtime bridge

Interactive exported runtimes expose:

```js
globalThis.__ST_SCORE_RENDER_HOST__.hitTestNote({ clientX, clientY })
globalThis.__ST_SCORE_RENDER_HOST__.highlight({ target, className? })
globalThis.__ST_SCORE_RENDER_HOST__.clearHighlights()
```

Runtime payloads fail closed on malformed/non-plain objects, unknown fields, non-finite coordinates, unsafe part IDs, unsafe integer locators and unsafe highlight class tokens.

The runtime exposes no consumer DOM traversal primitive and no OSMD model object.

## Mobile / Safari evidence boundary

PR #16 was motivated by real iPhone/Safari acceptance showing that exact-notehead-only ownership was too small for reliable touch selection. The implemented widening remains deterministic DOM ownership, not heuristic geometry.

Repository CI proves the interaction fixture at 720px and 320px in Chrome/Chromium. It does **not** contain an automated Safari/WebKit job. Safari-specific orientation, safe-area, browser chrome resize, passive-listener and pinch-zoom behavior must therefore not be claimed as repository-CI-proven.

See [MOBILE-SAFARI.md](MOBILE-SAFARI.md).

## SesliTab integration rule

```text
host touch/pointer event
→ renderer hitTestNote()
→ deterministic ScoreNoteRef or null
→ SesliTab-owned canonical resolver
→ exact canonical event or consumer abstain
→ SesliTab-owned selection state
→ renderer highlight(same ScoreNoteRef)
```

SesliTab must independently prove how `partId`, `measureIndex`, `noteIndex` and optional `voice` map into its canonical note identity. This repository does not define or infer that mapping.

## Contract version decision

`SCORE_RENDERER_CONTRACT_VERSION` remains `0.2.0` because note hit-testing is not a mandatory method on the base `ScoreRenderer` interface and the mobile ownership widening does not add new consumer authority.

A future change that makes hit-test a required cross-renderer method/capability requires a separate contract-version review.

## Tests

- `tests/note-interaction.test.mjs`: deterministic identity, unique-group touch ownership, ambiguity abstention, rerender identity, stale DOM reset, rests, no-nearest-note, highlight cleanup;
- `tests/browser-host-interaction.test.mjs`: host delegation/fail-closed state;
- `tests/browser/osmd-note-interaction-fixture.html`: real OSMD/Chrome interaction at 720px and 320px;
- `tests/browser/osmd-chord-notehead-research-fixture.html`: chord notehead identity evidence.
