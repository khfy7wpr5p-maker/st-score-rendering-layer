# Adapter Contract

All renderer adapters implement `ScoreRenderer`.

Lifecycle:

1. construct renderer with environment-owned target
2. `load(ScoreSource)`
3. `render(ScoreRenderOptions)`
4. optional capability operations
5. `dispose()`

Rules:

- `load()` validates input before handing it to the vendor.
- `render()` before successful `load()` must fail.
- unsupported capability methods must fail explicitly.
- `dispose()` must release adapter-owned references and clear its target.
- a renderer must not initiate network access on behalf of `ScoreSource`.
