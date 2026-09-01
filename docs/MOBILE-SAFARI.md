# Mobile / iPhone / Safari Boundary

This document separates production implementation from mobile-browser assumptions.

## Current implementation

There is no iPhone/Safari-specific renderer implementation. Browser note interaction uses the same code path everywhere:

```text
host pointer/touch event
→ host extracts clientX/clientY
→ BrowserScoreHost.hitTestNote
→ OsmdRenderer.resolveNoteAtClientPoint
→ document.elementFromPoint(clientX, clientY)
→ renderer-owned DOM ancestry map
→ ScoreNoteRef or null
```

The renderer itself does not register touch/pointer handlers.

## What is renderer-owned

- validation that `clientX` and `clientY` are finite;
- browser `elementFromPoint()` hit resolution;
- deterministic DOM-to-`ScoreNoteRef` ownership index;
- exact notehead ownership;
- unique graphical-note group ownership for wider deterministic touch targets;
- ambiguity abstention (`null`);
- hit-index rebuild after render changes.

## What is not renderer-owned

The host/application owns:

- `pointerdown`, `click`, `touchstart` listener selection;
- passive/non-passive listener policy;
- `touch-action` CSS policy;
- tap vs drag/pinch gesture discrimination;
- browser page zoom policy;
- nested scroll behavior;
- safe-area layout;
- toolbar/modal/panel layout effects;
- selected-note state;
- deselection behavior.

## Coordinate behavior

The adapter receives CSS pixel client coordinates. It does not manually transform for:

- `window.scrollX/Y`;
- nested scroll offsets;
- `devicePixelRatio`;
- browser zoom;
- pinch zoom;
- SVG transforms;
- orientation.

Those transformations are resolved by the browser when `elementFromPoint()` identifies the current DOM element.

This architecture avoids maintaining a second score-space coordinate system, but it also means host/browser layout behavior must keep the rendered DOM in the expected location.

## Visual vs interaction target

The visible notehead is not the only possible touch owner.

For real-mobile usability, PR #16 widened interaction through the exact OSMD `GraphicalNote` group when that group belongs to exactly one `ScoreNoteRef`. This can make a stem, flag or dot descendant select the same note without introducing an arbitrary geometric radius.

A chord/shared group remains ambiguous and returns `null` unless the actual hit descends from a more-specific exact notehead.

## Render/reflow boundary

`ScoreRenderOptions.autoResize` is forwarded to OSMD and defaults to `true` in the browser adapter.

There is no ST-owned:

- `ResizeObserver`;
- `orientationchange` listener;
- `visualViewport` listener;
- font/resource-load reflow controller;
- resize debounce/throttle;
- selection-restoration hook.

Therefore a notation view that changes after initial display because of parent/container resize or OSMD's internal auto-resize behavior is not controlled by a separate ST lifecycle subsystem in this repository.

If a host needs deterministic fixed geometry for a particular surface, it can render with `autoResize: false` and explicitly own when replacement/reflow occurs. That choice is a host integration decision and must be validated on the actual target application.

## Evidence levels

### Automated repository evidence

`tests/browser/osmd-note-interaction-fixture.html` proves real OSMD interaction at widths `720px` and `320px`.

`tests/browser/run-osmd-browser-fixture.mjs` executes browser fixtures with Chrome/Chromium.

### Real-device acceptance evidence

PR #16 records that real iPhone/Safari acceptance identified exact-notehead-only touch ownership as too narrow and drove the unique graphical-group widening.

### Not automated here

The repository has no WebKit/Safari CI gate. The following are therefore **UNVERIFIED by repository automation**:

- orientation transition behavior;
- iOS browser-chrome/visual-viewport resize behavior;
- safe-area inset interactions;
- pinch-zoom edge cases;
- host passive-listener policy;
- nested-scroller behavior specific to a consumer shell.

## Integration checklist for iPhone/Safari consumers

A consumer should verify on the actual host surface that:

1. the score container remains measurable and visible after initial render;
2. `clientX/clientY` passed to the renderer are taken from the active pointer/touch event without custom stale offsets;
3. host CSS transforms/scroll containers do not move an invisible overlay over the score;
4. the app does not recreate/remove the renderer container unexpectedly after render;
5. selection state is restored by the consumer when a deliberate rerender occurs;
6. playback controls remain governed by the consumer playback subsystem, not renderer interaction readiness;
7. real Safari tests cover tap, chord ambiguity, scrolling, orientation and replacement render behavior.

## Architecture status

Mobile note hit-testing is production-implemented through browser-generic DOM ownership. Safari-specific lifecycle/gesture behavior remains a host integration concern with real-device acceptance evidence but without a repository-owned automated WebKit gate.
