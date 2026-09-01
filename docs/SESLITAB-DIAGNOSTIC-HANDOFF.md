# SesliTab Consumer Diagnostic Handoff

Program: `SRL-EDITOR-BRIDGE-01` / `SRL-EB-08`

This document is a consumer-integration checklist for SesliTab. It defines how renderer-owned evidence should be handed to SesliTab/Editor Core without moving canonical score or edit authority into the rendering layer.

## Authority rule

The rendering layer may report current-render presentation evidence. It does not decide canonical note identity, editor selection validity, panel state, keypad state, Guitar TAB navigation, Violin transformation state, playback authorization, OMR truth or score mutation.

`ScoreNoteRef` is a rendered locator only. `renderEpoch` is presentation freshness evidence only. Neither value is a `SemanticAddress` and neither may be converted into canonical identity through pitch matching, nearest-note search, radius expansion, DOM ids or SVG proximity.

## Required handoff sequence

For an ordinary physical note tap, the consumer flow is:

```text
1. event received
2. extract fresh event.clientX / event.clientY
3. call hitTestNoteDetailed({ clientX, clientY })
4. renderer HIT/MISS diagnostic
5. verify hit.renderEpoch equals the current successful render epoch
6. on HIT, pass ScoreNoteRef to the current consumer canonical resolver
7. canonical resolver returns exact current SemanticAddress/selection or MISS
8. on canonical success, update consumer/editor selected-note state
9. enable the relevant consumer panel/keypad state
10. call renderer highlight() with the current-render ScoreNoteRef
```

A quality-marker path is not a prerequisite for ordinary note selection. The ordinary note event must be diagnosable through the same renderer HIT/MISS and consumer canonical-resolution stages.

## Fail-closed decisions

### Renderer MISS

If `hitTestNoteDetailed()` returns `MISS`, the consumer must not invoke canonical resolution for a guessed note and must not enable editing for a guessed target.

Renderer miss reasons are:

- `NO_ELEMENT_AT_POINT`
- `OUTSIDE_RENDER_CONTAINER`
- `UNMAPPED_ELEMENT`
- `AMBIGUOUS_OWNERSHIP`
- `NO_NOTE_OWNER`

### Stale presentation evidence

If the hit `renderEpoch` differs from the epoch of the current successful render, the result is stale. The consumer must abstain, clear/rebind selection as appropriate, and obtain a fresh hit after the current render.

A replacement render, failed replacement or dispose invalidates prior hit evidence. A numerically/string-equal `ScoreNoteRef` from an earlier render does not make the old evidence current.

### Canonical-map MISS

A renderer `HIT` is not sufficient to edit. If the current consumer/Editor Core mapping cannot resolve the returned `ScoreNoteRef` exactly, the consumer must abstain. It must not use pitch, duration, visual position or a nearby canonical object as a fallback.

### UI state failure

If renderer HIT and canonical resolution both succeed but the panel/keypad/tab does not enable or open, classify that as consumer/editor UI state failure unless separate renderer evidence proves a renderer failure. Do not relabel it as a renderer hit-test miss.

## Diagnostic code classes

Recommended consumer-side codes are deliberately separated by ownership:

| Code | Owner/class | Meaning |
| --- | --- | --- |
| `SRL_RENDERER_MISS_NO_ELEMENT` | renderer evidence | no browser element at the point |
| `SRL_RENDERER_MISS_OUTSIDE_CONTAINER` | renderer evidence | event point is outside renderer container |
| `SRL_RENDERER_MISS_UNMAPPED_ELEMENT` | renderer evidence | DOM element is inside container but has no note owner |
| `SRL_RENDERER_MISS_AMBIGUOUS_OWNERSHIP` | renderer evidence | shared graphical ownership; renderer abstained |
| `SRL_RENDERER_MISS_NO_NOTE_OWNER` | renderer evidence | known rendered object is not selectable note ownership |
| `SRL_RENDERER_STALE_EPOCH` | bridge freshness | evidence belongs to a prior/non-current render |
| `ST_CANONICAL_MAP_MISS` | consumer/editor | current renderer locator did not resolve canonically |
| `ST_EDITOR_SELECTION_REJECTED` | consumer/editor | editor rejected current canonical selection/revision |
| `ST_UI_PANEL_ENABLE_FAILED` | consumer UI | canonical selection succeeded but panel/keypad state did not enable |
| `ST_UI_HIGHLIGHT_APPLY_FAILED` | presentation/UI coordination | canonical selection succeeded but current-render highlight failed |
| `ST_UI_TAB_OPEN_FAILED` | consumer UI | Guitar TAB/Violin/other tab-open action failed after valid selection |

These names are a handoff vocabulary, not new renderer runtime enum values. Only the five renderer MISS reasons are returned by the renderer API.

## Telemetry privacy boundary

Diagnostic telemetry may record bounded operational metadata such as:

- diagnostic code/stage;
- renderer contract version;
- exact renderer source revision/runtime manifest identity;
- runtime target (`browser`/Workstation) where already known by the host;
- whether detailed hit returned `HIT` or `MISS`;
- renderer miss reason;
- whether current-epoch comparison passed;
- whether canonical resolution passed;
- whether panel/highlight/tab state transition passed;
- coarse viewport-width bucket and pointer type when the consumer already owns them.

Do **not** put the following into renderer/selection diagnostic telemetry:

- MusicXML or fragments of MusicXML;
- rendered SVG content or DOM paths;
- score title/composer text;
- note names, pitch, duration or lyrics;
- `SemanticAddress` or canonical score object dumps;
- user-provided filenames or raw `sourceId` values;
- OMR source images/PDF contents;
- authentication/user secrets.

If correlation is required, use an application-owned bounded opaque diagnostic/request id that is not derived from score contents.

## Guitar TAB and Violin classification

A Guitar TAB or Violin tab-open failure is a **consumer issue by default** when:

- the renderer successfully rendered the current score;
- a physical event reaches the host;
- `hitTestNoteDetailed()` produces a current-epoch HIT; and
- canonical resolution succeeds.

The rendering layer does not own application tab navigation or instrument-specific editor panels. Such failures may be reclassified as renderer defects only when renderer evidence independently shows a render, hit-test, epoch or highlight failure.

Do not claim that renderer-side WebKit/Chromium success fixes Guitar TAB/Violin consumer navigation without consumer evidence.

## Rerender/rebind checklist

After an editor revision or deliberate replacement render:

1. discard stored renderer hit evidence from the previous epoch;
2. retain canonical selection only if Editor Core says it remains valid for the new revision;
3. obtain the new successful `renderEpoch`;
4. use the consumer's current canonical-to-render mapping to locate/rebind the visual target;
5. highlight only the current-render locator;
6. if any exact mapping step fails, clear presentation selection rather than guessing.

The renderer does not automatically restore canonical selection after rerender.

## Incident triage matrix

| Last proven stage | Classification | Next investigation |
| --- | --- | --- |
| event not received | consumer input/UI | listener, overlay, gesture policy |
| renderer MISS | renderer evidence or physical event position | inspect exact miss reason; no fallback |
| renderer HIT but epoch stale | consumer lifecycle/bridge | replacement-render bookkeeping |
| current renderer HIT, canonical MISS | consumer/editor mapping | revision-bound mapping/Editor Core |
| canonical selection succeeds, panel/keypad disabled | consumer UI state | panel enable/state reducer |
| canonical selection succeeds, tab fails to open | consumer navigation/UI | Guitar TAB/Violin tab flow |
| current canonical selection succeeds, highlight fails | renderer presentation coordination | current locator/capability/lifecycle |

## Acceptance examples

```text
physical note tap
→ renderer HIT
→ current epoch
→ canonical resolver HIT
→ editor selection
→ panel/keypad enabled
→ current ScoreNoteRef highlight
```

```text
physical note tap
→ renderer MISS: AMBIGUOUS_OWNERSHIP
→ consumer abstains
→ no guessed canonical selection
→ panel/keypad remains unavailable for that guessed target
```

```text
renderer HIT
→ canonical resolver MISS
→ ST_CANONICAL_MAP_MISS
→ no pitch/nearest-note fallback
→ no edit target
```

```text
editor revision
→ replacement render
→ new renderEpoch
→ old evidence rejected
→ deterministic current mapping/rebind
→ current highlight
```

See [EDITOR-BRIDGE.md](EDITOR-BRIDGE.md), [NOTE-INTERACTION.md](NOTE-INTERACTION.md), [BROWSER-HOST.md](BROWSER-HOST.md) and [MOBILE-SAFARI.md](MOBILE-SAFARI.md).
