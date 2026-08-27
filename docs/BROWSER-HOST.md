# Browser Host Boundary — R8-B1

Status: consumer-facing browser-host foundation. This stage does not claim that ST Music Workstation already contains or displays a browser score view.

## Purpose

`@st/score-renderer-browser-host` is the ST-owned browser presentation boundary used to turn bounded in-memory MusicXML into a rendered score without exposing OpenSheetMusicDisplay to consumer applications.

```text
Consumer application / UI shell
        |
        | ST-owned request + runtime contract version
        v
@st/score-renderer-browser-host
        |
        v
@st/score-renderer-osmd
        |
        v
OpenSheetMusicDisplay
        |
        v
owned presentation container / SVG
```

The package remains `private: true`. R8-B1 does not publish renderer packages or define the final native/WebView delivery mechanism for Workstation.

## Compatibility handshake

The browser host validates the exported ST runtime contract, currently `0.2.0`, before it creates a renderer. This value is intentionally distinct from private workspace package SemVer such as `0.1.0`.

A mismatch fails closed with `ScoreRendererContractVersionMismatchError`. After a render, the returned renderer contract is checked again so an incompatible adapter result cannot be accepted silently.

## Input and authority boundary

The host accepts only in-memory MusicXML passed as text. Validation is delegated to `@st/score-renderer-core`, preserving the shared rules:

- empty input rejected;
- NUL bytes rejected;
- default maximum MusicXML size 5 MiB;
- no URL/network loader contract.

The host grants no filesystem, shell, network, plugin, AI, MIDI-device, audio-device, Project mutation, Transport, Mixer, DSP, or realtime authority. It registers no automatic global message listener and exposes no `postMessage` transport.

Consumer code must never import `opensheetmusicdisplay`. Vendor ownership terminates inside `@st/score-renderer-osmd`.

## Fail-closed replacement policy

A browser score is presentation state, not authoritative musical state. To avoid displaying stale notation after a failed replacement request, the host:

1. validates the new in-memory source;
2. disposes the previous renderer before accepting replacement output;
3. clears the owned presentation container;
4. creates a fresh renderer only for valid work;
5. clears the renderer/container again if load, render, capability, or contract validation fails.

A failed replacement therefore leaves an empty presentation surface rather than a misleading old score.

## Browser evidence

`tests/browser/osmd-browser-host-fixture.html` exercises the real chain in Chrome/Chromium:

- consumer-facing code constructs `BrowserScoreHost` rather than OSMD;
- mismatched runtime contract is rejected before rendering;
- valid MusicXML renders through browser host → ST OSMD adapter → real OSMD;
- exported/runtime contract is `0.2.0`;
- invalid replacement input removes the previously rendered SVG;
- a later valid request can recover and render again.

The fixture's OSMD global/module shim is renderer-internal test plumbing only. It is not part of the consumer API.

## Workstation integration gate

ST Music Workstation already has an ST-owned non-realtime `ScoreRenderingPort` application boundary. Its runtime contract alignment to `0.2.0` is tracked separately in Workstation PR #164.

End-to-end Workstation display remains gated on selecting and reviewing the actual native/browser UI shell and delivery mechanism. That later binding must not move Node, browser, renderer, or OSMD work into the realtime audio callback, DSP graph, or AI/provider paths.
