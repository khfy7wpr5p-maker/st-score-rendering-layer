# Versioning

Packages use independent semantic versions and a separate runtime contract compatibility policy.

- contracts: breaking TypeScript package interface changes require a package major version when packages become publishable;
- core: must declare the supported contracts major;
- adapters: pin and document their renderer-vendor compatibility;
- consumers: pin exact ST package versions once a release/distribution process exists;
- runtime integrations: verify `SCORE_RENDERER_CONTRACT_VERSION` independently of package SemVer and fail closed on mismatch.

The runtime protocol version is intentionally not inferred from `packages/contracts/package.json`. For example, the private package metadata may remain `0.1.0` while `SCORE_RENDERER_CONTRACT_VERSION` is `0.2.0` after an internal protocol-capability evolution.

All current workspace packages, including the R8-B1 browser host, remain `private: true` and must not be published until a dedicated release/distribution gate is approved.
