# Mobile / iPhone / Safari Boundary

This document separates production implementation from mobile-browser assumptions.

## Current implementation

There is no iPhone/Safari-specific renderer implementation. Browser note interaction uses the same browser-generic ownership path:

```text
host pointer/touch event
→ host extracts fresh clientX/clientY
→ BrowserScoreHost hit-test
→ OsmdRenderer browser hit-test
→ document.elementFromPoint(clientX, clientY)
→ renderer-owned DOM ancestry map
→ ScoreNoteRef HIT or structured MISS
```

The renderer itself does not register touch/pointer handlers.

## What is renderer-owned

- validation that client coordinates are finite;
- browser `elementFromPoint()` hit resolution;
- deterministic DOM-to-`ScoreNoteRef` ownership index;
- exact notehead ownership;
- unique graphical-note group ownership for wider deterministic touch targets;
- structured ambiguity/no-owner/unmapped/outside/no-element abstention;
- hit-index rebuild after render changes;
- opaque current-render epoch evidence;
- reversible renderer-owned highlight state.

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
- selected-note and canonical mapping state;
- Guitar TAB/Violin tab navigation;
- playback authorization;
- deselection behavior.

## Coordinate behavior

The adapter receives CSS-pixel client coordinates. It does not manually transform for `window.scrollX/Y`, nested scroll offsets, `devicePixelRatio`, browser zoom, pinch zoom, SVG transforms or orientation.

Those transformations are resolved by the browser when `elementFromPoint()` identifies the current DOM element. A consumer must therefore pass coordinates from the **current physical event**, not cached pre-scroll/pre-rerender coordinates.

## Visual vs interaction target

The visible notehead is not the only possible touch owner.

PR #16 widened interaction through the exact OSMD `GraphicalNote` group when that group belongs to exactly one `ScoreNoteRef`. This can make a stem, flag or dot descendant select the same rendered locator without introducing an arbitrary geometric radius.

A chord/shared group remains ambiguous and abstains unless the actual hit descends from a more-specific exact notehead. No nearest-note, pitch or radius fallback exists.

## Render/reflow and stale-evidence boundary

`ScoreRenderOptions.autoResize` is forwarded to OSMD and defaults to `true` in the browser adapter.

There is no ST-owned `ResizeObserver`, `orientationchange` listener, `visualViewport` listener, font/resource-load reflow controller, resize debounce/throttle or canonical selection-restoration hook.

A successful replacement render advances the BrowserScoreHost `renderEpoch`. Old hit evidence is stale even if a later render produces an equal `ScoreNoteRef`. Validation/render failure and dispose also invalidate active evidence.

If a host needs deterministic fixed geometry for a particular surface, it can render with `autoResize: false` and explicitly own replacement/reflow timing. That is a host integration choice and must be validated on the target application.

## Evidence levels

### Automated Chromium evidence

`tests/browser/osmd-note-interaction-fixture.html` proves real OSMD interaction at widths `720px` and `320px`.

`tests/browser/run-osmd-browser-fixture.mjs` executes the full browser fixture suite with Chrome/Chromium.

The interaction fixture covers exact notehead selection, unique graphical-owner descendants, ambiguous shared-group abstention, fresh coordinates after scroll, replacement render/new epoch and fresh re-highlight.

### Automated WebKit-engine evidence

SRL-EB-07 adds `tests/webkit/run-osmd-webkit-fixture.mjs` and `npm run test:webkit` using exact-pinned `playwright: 1.62.1` as development/test tooling.

CI installs the WebKit browser engine and runs bounded baseline rendering plus the interaction fixture over loopback HTTP.

This is **WebKit engine evidence**. It is not proof that Linux Playwright WebKit is identical to shipping Safari on a physical iPhone.

### Real-device acceptance evidence

PR #16 records real iPhone/Safari acceptance that identified exact-notehead-only ownership as too narrow and drove the unique graphical-group widening.

### Still not repository-CI-proven as physical Safari behavior

- orientation transitions involving actual iOS browser chrome;
- iOS visual-viewport resizing and safe-area inset interactions;
- real touch event delivery and passive-listener behavior in a consumer shell;
- pinch-zoom edge cases on physical Safari;
- consumer-specific nested scrollers, overlays and toolbar/modal lifecycle;
- hardware/device-specific rendering differences.

## SesliTab mobile diagnostic handoff

For a mobile note tap, diagnostics should preserve ownership boundaries:

```text
physical event received
→ fresh client coordinates
→ hitTestNoteDetailed
→ renderer HIT/MISS
→ current renderEpoch comparison
→ SesliTab canonical resolver
→ canonical HIT/MISS
→ consumer panel/keypad/tab state
→ renderer highlight
```

A renderer MISS must remain distinguishable from a stale-epoch failure, canonical-map MISS and consumer UI state failure. A renderer HIT plus successful canonical resolution followed by a Guitar TAB/Violin tab-open failure points to consumer navigation/UI unless separate renderer evidence proves otherwise.

Diagnostic telemetry must not include MusicXML, SVG content/DOM paths, pitches, lyrics, `SemanticAddress`, raw filenames/source ids or OMR page contents. See [SESLITAB-DIAGNOSTIC-HANDOFF.md](SESLITAB-DIAGNOSTIC-HANDOFF.md).

## Integration checklist for iPhone/Safari consumers

A consumer should verify on the actual host surface that:

1. the score container remains measurable and visible after initial render;
2. coordinates passed to the renderer are taken from the active event without stale custom offsets;
3. host CSS transforms/scroll containers do not move an invisible overlay over the score;
4. the app does not recreate/remove the renderer container unexpectedly after render;
5. the current successful `renderEpoch` is replaced whenever a deliberate replacement render succeeds;
6. old hit evidence is rejected and current canonical-to-render mapping is used for rebind;
7. renderer MISS, canonical-map MISS and panel/tab state failure are logged as separate classes;
8. playback controls remain governed by the consumer playback subsystem, not renderer interaction readiness;
9. real Safari tests cover tap, chord ambiguity, scrolling, orientation and replacement render behavior.

## Architecture status

Mobile note hit-testing is production-implemented through browser-generic deterministic DOM ownership. Repository automation covers Chromium and an exact-pinned Playwright WebKit engine for bounded renderer interaction evidence. Safari-specific host lifecycle, browser chrome, gesture and safe-area behavior remains a physical-device/consumer integration acceptance concern.
