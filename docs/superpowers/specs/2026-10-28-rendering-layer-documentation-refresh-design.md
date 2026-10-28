# Rendering Layer Documentation Refresh Design

**Date:** 2026-10-28

## Intent

Synchronize repository-facing architecture documentation with production `main` at `b6a585ec79581bd99a17e05808462985d33d1751` after PRs #38, #39 and #40.

## Goals

- Make `README.md` accurately summarize deterministic measure hit-testing, reversible measure highlighting, exact TAB fret ownership and automatic OSMD redraw recovery.
- Reconcile the production architecture and supporting boundary documents with implemented browser-host, adapter and generated-runtime APIs.
- Preserve the distinction between pinned Playwright WebKit engine evidence and physical iPhone/Safari acceptance.
- Keep canonical identity, playback, edit authority, OMR and consumer-shell responsibilities outside the renderer.

## Non-goals

- No production code, package, runtime asset, test, dependency or contract-version change.
- No consumer pin, deployment, Render service or physical-device acceptance change.
- No claim that automatic redraw restores consumer canonical selection.
- No claim that automatic redraw preserves measure overlays; current code restores active note/TAB highlights only.

## Approaches considered

1. **README-only update.** Rejected because linked architecture/API documents would remain contradictory.
2. **README plus `docs/ARCHITECTURE.md` only.** Rejected because supporting lifecycle and API documents would remain stale.
3. **Targeted documentation reconciliation.** Selected: update only claims contradicted or made incomplete by production `main`.

## Constraints

- Production code and executable tests are authoritative.
- Contract constant remains `0.2.0`; OSMD remains `2.1.2`.
- Ambiguous or stale note, TAB or measure ownership fails closed.
- WebKit automation is engine evidence, not physical Safari acceptance.

## Acceptance

- README and production architecture describe PR #38–40 without overstating scope.
- Supporting docs expose implemented measure hit/highlight APIs and automatic-redraw lifecycle accurately.
- Deliberate replacement renders are distinguished from OSMD-internal automatic redraws.
- Note/TAB highlights may be restored after automatic redraw; consumer selection and measure-overlay lifecycle remain separately owned.
