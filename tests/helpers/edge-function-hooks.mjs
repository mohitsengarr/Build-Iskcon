// Node module-resolution hook that lets the tests import a whole edge function
// (supabase/functions/<fn>/index.ts) under `node --experimental-strip-types`:
//   jsr:*                      -> an empty module (type-only imports in Deno)
//   https://esm.sh/@supabase/* -> supabase-js-stub.mjs (delegates to globalThis.__sb)
// The pinned Anthropic SDK is stubbed by npm-stub-hooks.mjs, registered alongside.
// No network: any other remote specifier fails to resolve.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("jsr:")) {
    return { url: new URL("./empty-module.mjs", import.meta.url).href, shortCircuit: true };
  }
  if (specifier.startsWith("https://esm.sh/@supabase/supabase-js")) {
    return { url: new URL("./supabase-js-stub.mjs", import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
