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
- is bounded to 200,000 graphical note elements per render;
- never searches for a nearest note.

If two different `ScoreNoteRef` values claim the same graphical DOM element, that element is marked ambiguous and hit-test returns `null` rather than selecting the first note.

### Glyph policy

Hit-test walks only the actual `document.elementFromPoint()` DOM ancestry until the renderer container.

- an exact mapped graphical-note element or its descendant may resolve to that note;
- this naturally permits a stem or accidental only when OSMD places that glyph inside the exact graphical-note DOM group;
- rests, beams, staff lines, slurs, text, measure whitespace and other unmapped SVG/HTML nodes return `null`;
- elements outside the renderer container return `null`;
- no nearest-note fallback exists.

Chord noteheads are accepted only when real-browser evidence proves OSMD exposes distinct graphical-note DOM identity. Shared DOM ownership is treated as ambiguous and fails closed.

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

Reason: the base `ScoreRenderer` interface, `ScoreNoteRef`, existing capability union and existing consumer obligations are unchanged. Hit-test is an additive browser-host/runtime presentation extension, structurally detected at the browser boundary. Runtime consumers already pin and verify an exact renderer revision in addition to the ST contract version.

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
