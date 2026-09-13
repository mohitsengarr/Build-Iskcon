// Test stand-in for https://esm.sh/@supabase/supabase-js@2. The client a function
// creates at import time delegates every call to globalThis.__sb, so each test
// can install its own fake database and storage.
export function createClient() {
  return {
    from: (table) => globalThis.__sb.from(table),
    storage: { from: (bucket) => globalThis.__sb.storage.from(bucket) },
  };
}
