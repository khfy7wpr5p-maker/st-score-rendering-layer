# Error and Degraded Modes

The renderer distinguishes presentation availability from application capabilities owned elsewhere. It does not contain a global “score valid/invalid/playable” state.

## Source validation

`validateScoreSource()` rejects before vendor parsing when:

- source kind is not `musicxml`;
- content is empty/whitespace-only;
- content contains a NUL byte;
- content exceeds the configured/default byte limit (5 MiB).

These checks are transport/resource guards, not full MusicXML semantic validation.

## Browser-host replacement behavior

A failed **replacement** request clears stale renderer-owned presentation.

| Condition | Rendered score after failure | Interaction | Recovery |
| --- | --- | --- | --- |
| invalid ST source | empty | unavailable | submit a later valid render |
| renderer missing required render capabilities | empty | unavailable | choose valid renderer/new render |
| OSMD load/parser failure | empty | unavailable | later valid render |
| render failure | empty | unavailable | later valid render |
| returned contract mismatch | empty | unavailable | compatible renderer/runtime required |
| concurrent replacement while one render is active | active/in-flight renderer is not disposed by rejected second request | second request unavailable | wait for current synchronous lifecycle to resolve at application level; retry after it is no longer in flight |
| host disposed | empty | unavailable | create a new host instance |

The host does not preserve an old score after a failed replacement because stale presentation could be mistaken for the new source.

## MusicXML quality states

The repository does not define these as first-class states:

- “partially valid MusicXML”;
- “partially renderable”;
- “OMR validated”;
- “fully corrected”;
- “playable”.

A source that passes ST input guards may still fail inside OSMD. Conversely, a source produced from imperfect OMR may render successfully if OSMD accepts it.

Unknown/unsupported MusicXML notation is vendor behavior unless a feature is explicitly fixture-gated by ST. No generic guarantee is made that an unknown symbol will always degrade locally instead of failing a larger render.

## Interaction-degraded states

A successfully rendered score can still have a local note interaction result of `null`.

Expected fail-closed examples:

- rest target;
- shared/ambiguous graphical group;
- duplicate exact notehead ownership;
- staff/measure whitespace;
- unmapped SVG element;
- point outside the renderer container.

This does not invalidate the whole rendered score.

Browser-host interaction methods are unavailable when:

- no score has been rendered;
- replacement rendering is in flight;
- the host is disposed;
- the selected renderer lacks the needed interaction capability/method.

## Headless degraded behavior

`@st/score-renderer-osmd-headless` intentionally advertises only:

- `musicxml-render`;
- `svg-export`;
- `tablature`;
- `headless`.

Cursor, note highlight and part visibility fail explicitly as unsupported. Their absence does not mean headless SVG rendering has failed.

Headless execution also fails closed on unavailable Chrome/Chromium, process timeout/error, invalid/oversized output or a fixture that produces no valid SVG payload.

## Accessibility degraded behavior

Accessibility overlay application is transactional:

1. validate all entries;
2. resolve every target;
3. only then mutate DOM attributes.

Missing/duplicate targets, duplicate DOM ownership, unsafe labels or resource limits reject the map before normal application. If DOM mutation throws mid-application, applied attributes are rolled back.

Accessibility failure does not mutate canonical score data.

## Rendering-only vs playback-only

This repository has no playback subsystem, so it cannot implement a `playback-only usable` state itself.

A consumer may independently have states such as:

```text
source loaded
render failed
playback still available
```

or:

```text
score rendered
note interaction unavailable
playback available
```

Those combinations are legal from the renderer's perspective because playback authorization is not a renderer responsibility.

For incomplete OMR, the renderer must not be used as an implicit audio lock. The host's playback subsystem decides whether it has enough event data to play.

## Feature isolation principle

Where the production contracts permit it, failure of a subordinate feature should not be promoted into unrelated application failure:

- a `null` note hit should not invalidate rendering;
- unavailable highlight should not redefine canonical score validity;
- headless lack of cursor should not invalidate SVG output;
- renderer failure should not automatically disable independent playback;
- accessibility overlay failure should not mutate source/canonical data.

The exception is browser-host **replacement rendering**: by design, a failed replacement clears the renderer-owned old presentation to avoid stale/misleading score output.

## Contract evidence

Implementation/tests:

- `packages/renderer-core/src/index.ts`
- `packages/browser-host/src/index.ts`
- `packages/adapter-osmd-headless/src/index.ts`
- `packages/accessibility/src/index.ts`
- `tests/core.test.mjs`
- `tests/browser-host.test.mjs`
- `tests/browser-host-interaction.test.mjs`
- `tests/headless-adapter.test.mjs`
- `tests/accessibility.test.mjs`
