# Vendored deepmerge (4.3.1 + security patch)

`deepmerge` is a transitive dependency of `@expo/config` (used by the Expo CLI
to merge `app.json` modifications). Upstream (TehShrike/deepmerge) has **no
patched release** for [GHSA-gcqx-w48m-w2h4 /
CVE-2026-93753](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)
(prototype poisoning in `mergeObject()`); every published version
`>= 4.2.0 <= 4.3.1` is affected and 4.3.1 is still the newest on npm.

`package.json` wires this folder in with an npm override:

```json
"overrides": {
  "deepmerge": "file:patches/deepmerge"
}
```

`index.js` is upstream 4.3.1 verbatim plus the remediation recommended in the
advisory:

- never merge keys named `__proto__`, `constructor` or `prototype`
- write destination properties via `Object.defineProperty` so the `__proto__`
  setter can never be invoked
- keep the original `propertyIsUnsafe` guard (fail-closed on `in` throwing)

Everything else matches upstream 4.3.1 byte-for-byte in behavior.

`is-mergeable-object@1.0.1` (upstream deepmerge's only dependency) is inlined
verbatim, so this folder is zero-dependency and safe to install as a `file:`
link.

If upstream ever publishes a fixed version, delete this folder and change the
override to the fixed semver range.
