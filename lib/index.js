// Host half: intentionally a no-op.
//
// This package contributes browser-side CSS and behaviour only (see
// lib/client.js). It still needs a host entry point, because the row inserted
// by cordis.patch.yml resolves this package by name and mounts it like any
// other plugin; the client bundle is then discovered from the `dsh.client`
// declaration in package.json and served by the client module registry.
export function apply() {}
