# Versioning

Packages use independent semantic versions but share a contract compatibility policy.

- contracts: breaking interface changes require a major version
- core: must declare the supported contracts major
- adapters: pin and document their renderer-vendor compatibility
- consumers: pin exact ST package versions until the release process is mature

R0–R2 packages remain `private: true` and must not be published.
