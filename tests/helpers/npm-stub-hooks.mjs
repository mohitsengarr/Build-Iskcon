// Node module-resolution hook for the IO tests: the Deno-only specifier
// npm:@anthropic-ai/sdk@0.125.0 resolves to a local stub, so sceneResearch.ts
// can be imported under `node --experimental-strip-types` without the network.
// Only the exact pinned specifier is stubbed: an unpinned or differently pinned
// import fails to resolve here, so the tests catch it.
export const PINNED_SDK_SPECIFIER = "npm:@anthropic-ai/sdk@0.125.0";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === PINNED_SDK_SPECIFIER) {
    return { url: new URL("./anthropic-stub.mjs", import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
