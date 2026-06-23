import { createClient } from "@supabase/supabase-js";

// Shared browser Supabase client — currently used for Bhaktigram chat's
// Realtime (websocket) subscriptions. The anon key is public by design (it's
// already embedded for the feed's REST calls); RLS governs what it can do.
//
// auth.persistSession=false: this app has no Supabase Auth login, so there's
// no session to persist — avoids the client writing stray auth state to
// localStorage. realtime.eventsPerSecond caps client→server event rate.
const SUPABASE_URL = "https://etfmndcrchundvgtvmot.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0Zm1uZGNyY2h1bmR2Z3R2bW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2NDE1MTIsImV4cCI6MjA2MzIxNzUxMn0.7GXS820xSFcUy2TRdbspN7s-NP3sgKFFtUP-Zw0Qbrs";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { params: { eventsPerSecond: 10 } },
});
