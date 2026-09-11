import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async () => {
  try {
    const { data: files, error: listErr } = await supabase.storage.from("instagram-images").list();
    if (listErr) throw listErr;
    if (!files || files.length === 0) {
      return new Response(JSON.stringify({ deleted: 0, message: "Bucket already empty" }), { headers: { "Content-Type": "application/json" } });
    }
    const paths = files.map(f => f.name);
    const { error: delErr } = await supabase.storage.from("instagram-images").remove(paths);
    if (delErr) throw delErr;
    return new Response(JSON.stringify({ deleted: paths.length, files: paths }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
});
