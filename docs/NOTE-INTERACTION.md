# Note Interaction / Hit-Test / Highlight Boundary

## Authority

This extension is presentation-only. The renderer owns rendered-note hit-testing, highlighting, cursor movement and presentation state. It does **not** own pitch, duration, octave, voice, tie, tuplet, OMR correction, canonical score truth or teacher approval.

A successful hit-test returns only a `ScoreNoteRef`. Consumers must resolve that locator against their own separately verified canonical model before performing any edit or correction.

The following assumption is explicitly invalid:

```text
renderer ScoreNoteRef.noteIndex == consumer global/canonical NoteObject array index
```

## ScoreNoteRef identity policy

`ScoreNoteRef` remains:

```ts
{
  partId: string;
  measureIndex: number;
  noteIndex: number;
  voice?: number;
}
```

The existing `0.2.0` traversal policy remains authoritative:

```text
selected part
→ instrument staves sorted by idInMusicSheet
→ staff entry order
→ graphical voice entry order
→ graphical note order
```

When a valid non-negative OSMD/MusicXML voice id is available, hit-test returns `voice` and `noteIndex` is counted after filtering the selected part + measure to that voice. If a usable voice id is unavailable, the renderer does not invent one; `voice` is omitted and `noteIndex` is the unfiltered traversal index for that part + measure.

Pitch, duration or visual proximity are never used to establish identity.

## Browser adapter hit-test

`OsmdRenderer.resolveNoteAtClientPoint({ clientX, clientY })` is an adapter interaction extension. It is intentionally not added to the base `ScoreRenderer` interface in this stage.

After each successful render, the OSMD adapter builds a bounded renderer-owned DOM-to-`ScoreNoteRef` index. The index:

- is constructed from the same graphical traversal used by `ScoreNoteRef` resolution;
- stores only rendered DOM ownership and stable locator values;
- uses a `WeakMap`, so it does not retain stale DOM after render replacement;
- is rebuilt after render and part-visibility graphic rebuilds;
- is reset on load, rerender failure and dispose;
- is bounded to 200,000 graphical notes per render;
- never searches for a nearest note.

If two different `ScoreNoteRef` values claim the same graphical DOM element, that element is marked ambiguous and hit-test returns `null` rather than selecting the first note.

### Glyph and exact touch-ownership policy

The pinned OSMD `2.1.2` adapter uses the public graphical-note primitives `getNoteheadSVGs()`, `vfnoteIndex` and `getSVGGElement()`.

The notehead remains the strongest exact identity target. Chord members may share `getSVGGElement()` while `getNoteheadSVGs()[vfnoteIndex]` resolves distinct notehead elements, so an exact notehead descendant always wins over a broader ambiguous ancestor.

For mobile usability, the adapter may additionally register a graphical note group as an interaction owner **only through deterministic DOM ownership**:

- the group is obtained directly from the same exact `GraphicalNote` via `getSVGGElement()`;
- if exactly one `ScoreNoteRef` owns that group, a hit on its stem/flag/dot/other descendant may resolve to that same exact locator;
- if multiple different `ScoreNoteRef` values claim the group, the group is marked ambiguous and group-only hits return `null`;
- a distinct exact notehead inside an ambiguous shared group remains selectable because the more-specific exact notehead already proves identity;
- no bounding-box expansion, coordinate radius, nearest-note search, pitch matching or consumer-side SVG scraping is introduced.

For a single pitched graphical note, if `vfnoteIndex` is unavailable but `getNoteheadSVGs()` exposes exactly one element, index `0` is accepted as an unambiguous exact-notehead fallback. For multi-note/chord cases a valid `vfnoteIndex` is required; otherwise interaction fails closed. Graphical rests are excluded using the public source-note `isRest()` signal and are never added to the note interaction index.

Hit-test walks only the actual `document.elementFromPoint()` DOM ancestry until the renderer container.

- an exact mapped notehead element or its descendant may resolve to that note;
- a uniquely-owned graphical note group or its descendant may resolve to that same note;
- shared/ambiguous graphical groups return `null` unless a more-specific exact notehead descendant already proved identity;
- rests, beams outside a uniquely-owned note group, staff lines, slurs, text, measure whitespace and other unmapped SVG/HTML nodes return `null`;
- elements outside the renderer container return `null`;
- no nearest-note fallback exists;
- no pitch matching exists.

Duplicate exact-notehead ownership remains ambiguous and returns `null` rather than selecting an arbitrary note.

## BrowserScoreHost API

The browser host adds three presentation APIs:

```ts
host.hitTestNote({ clientX, clientY })
// → ScoreNoteRef | null

await host.highlight({ target: scoreNoteRef, className? })

await host.clearHighlights()
```

Interaction is rejected when:

- the host is disposed;
- no score has been rendered;
- replacement render is in flight;
- note hit-test is unavailable on the selected renderer;
- note-highlight capability is unavailable.

`highlight()` continues to target the exact existing `ScoreNoteRef` traversal and does not change source MusicXML colors. `clearHighlights()` removes only renderer-owned highlight class/marker state tracked by the adapter.

## Runtime bridge

The exported Workstation and browser runtimes expose the same operations on the existing ST-owned global host:

```js
globalThis.__ST_SCORE_RENDER_HOST__.hitTestNote({ clientX, clientY })
globalThis.__ST_SCORE_RENDER_HOST__.highlight({ target, className? })
globalThis.__ST_SCORE_RENDER_HOST__.clearHighlights()
```

Runtime payloads fail closed on malformed or non-plain objects, unknown fields, non-finite coordinates, empty/oversized or whitespace-mutated `partId`, unsafe measure/note/voice integers and unsafe highlight class tokens. The bridge exposes no consumer DOM traversal primitive and no OSMD object.

## Contract version decision

`SCORE_RENDERER_CONTRACT_VERSION` remains `0.2.0` for this stage.

Reason: the base `ScoreRenderer` interface, `ScoreNoteRef`, existing capability union and existing consumer obligations are unchanged. The mobile ownership widening remains inside the same browser-adapter hit-test method and does not add a new runtime method or consumer authority. Runtime consumers pin and verify an exact renderer revision in addition to the ST contract version.

A future attempt to add hit-test as a required base `ScoreRenderer` method or new mandatory cross-renderer capability must be reviewed as a separate contract-version decision.

## SesliTab integration rule

The safe consumer chain is:

```text
rendered note
→ renderer hitTestNote()
→ deterministic ScoreNoteRef
→ SesliTab-owned canonical resolver
→ exact canonical note or consumer-side abstain
→ renderer highlight(same ScoreNoteRef)
```

SesliTab must independently prove how `partId`, `measureIndex`, `noteIndex` and optional `voice` map into its canonical note identity. This repository does not define or infer that mapping.
