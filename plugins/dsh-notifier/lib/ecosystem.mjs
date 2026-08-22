// Declaration-only dsh ecosystem facet (Community v0.15 / tui-admission profile).
//
// The native Cordis runtime (lib/index.js apply) owns all notifier effects;
// this module exists so dsh-ecosystem-spec tooling can discover the plugin's
// declaration without double-registering behavior. Shape-compatible with
// @dsh-std/sdk's defineFacet output, inlined to keep the zero-dependency
// constraint (defineFacet is just argument checks + Object.freeze).

const ECOSYSTEM_SNAPSHOT = Object.freeze({
  state: 'degraded',
  message: 'Native Cordis runtime owns all notifier effects; this facet publishes declarations only.',
  extensions: Object.freeze([]),
});

async function activate() {
  // Intentionally empty: declarations only, no commands/UI/storage/network effects.
}

function snapshot() {
  return ECOSYSTEM_SNAPSHOT;
}

export const ecosystemFacet = Object.freeze({ activate, snapshot });
export default ecosystemFacet;
