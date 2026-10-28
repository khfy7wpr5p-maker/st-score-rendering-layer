# Rendering Layer Documentation Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile repository documentation with production Rendering Layer behavior at `b6a585ec79581bd99a17e05808462985d33d1751`.

**Architecture:** Apply docs-only edits to the top-level summary and boundary documents whose claims are stale after PRs #38–40. Source exports and tests are authoritative; runtime code, contracts and dependencies remain unchanged.

**Tech Stack:** Markdown, Mermaid, TypeScript API references, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-10-28-rendering-layer-documentation-refresh-design.md`

## Global Constraints

- No production code, package, dependency, runtime asset, test or contract-version changes.
- Preserve contract `0.2.0` and OSMD `2.1.2`.
- Keep canonical identity, playback, edit authority, OMR and consumer-shell state outside the renderer.
- Treat Playwright WebKit as engine evidence, not physical iPhone/Safari acceptance.
- Do not claim automatic redraw preserves measure overlays or consumer canonical selection.

## Review Focus

- Deliberate replacement render vs OSMD automatic redraw.
- Note/TAB highlight restoration vs measure-overlay lifecycle.
- Exact TAB fret ownership without canonical-identity inference.
- Additive measure APIs vs base `ScoreRenderer`.
- Browser-engine coverage vs physical-device acceptance.

---

### Task 1: Update top-level architecture summary

**Files:** `README.md`, `docs/ARCHITECTURE.md`

- [ ] Confirm stale claims against source and tests.
- [ ] Update README capabilities, diagram, interaction and lifecycle summary.
- [ ] Update architecture scope, diagrams, coordinate model, APIs, state, resize, TAB, mobile, tests and invariants.
- [ ] Review for unsupported claims.

### Task 2: Reconcile supporting boundary documents

**Files:** `docs/NOTE-INTERACTION.md`, `docs/BROWSER-HOST.md`, `docs/MOBILE-SAFARI.md`, `docs/DEGRADED-MODES.md`, `docs/TESTING.md`, `docs/PUBLIC-API.md`

- [ ] Separate replacement and automatic-redraw semantics.
- [ ] Document `hitTestMeasureDetailed`, `highlightMeasure` and `clearMeasureHighlights`.
- [ ] Document exact fail-closed TAB fret ownership.
- [ ] Update degraded-mode and test matrices.

### Task 3: Verify integrated documentation

- [ ] Confirm only approved Markdown files changed.
- [ ] Validate links, names, versions and evidence wording against source.
- [ ] Run `npm run check`, `npm run test:browser`, `npm run test:webkit` and `npm run test:headless`.
- [ ] Create a docs-only PR against `main`.
