import { Router } from "express";

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || "";

function sbHeaders() {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  };
}

// GET /api/japa?phone=+91...
router.get("/japa", async (req, res) => {
  const phone = req.query.phone as string;
  if (!phone) { res.status(400).json({ error: "phone required" }); return; }
  try {
    const url = `${SUPABASE_URL}/rest/v1/japa_counter?phone=eq.${encodeURIComponent(phone)}`;
    const r = await fetch(url, { headers: sbHeaders() });
    const data = await r.json();
    if (Array.isArray(data) && data.length > 0) {
      const row = data[0];
      // If today_date is not today, reset today_rounds
      const today = new Date().toISOString().slice(0, 10);
      if (row.today_date !== today) {
        row.today_rounds = 0;
        row.today_date = today;
      }
      res.json(row);
    } else {
      res.json(null);
    }
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch japa data" });
  }
});

// POST /api/japa — register or login with phone
router.post("/japa", async (req, res) => {
  const { phone, name } = req.body;
  if (!phone) { res.status(400).json({ error: "phone required" }); return; }
  try {
    // Upsert — create if not exists, return existing if exists
    const url = `${SUPABASE_URL}/rest/v1/japa_counter`;
    const headers = { ...sbHeaders(), Prefer: "return=representation,resolution=merge-duplicates" };
    const today = new Date().toISOString().slice(0, 10);

    // Check if exists first
    const checkUrl = `${SUPABASE_URL}/rest/v1/japa_counter?phone=eq.${encodeURIComponent(phone)}`;
    const checkR = await fetch(checkUrl, { headers: sbHeaders() });
    const existing = await checkR.json();

    if (Array.isArray(existing) && existing.length > 0) {
      const row = existing[0];
      if (row.today_date !== today) {
        row.today_rounds = 0;
        row.today_date = today;
      }
      // Update name if provided and different
      if (name && name !== row.name) {
        const patchUrl = `${SUPABASE_URL}/rest/v1/japa_counter?phone=eq.${encodeURIComponent(phone)}`;
        await fetch(patchUrl, {
          method: "PATCH",
          headers: sbHeaders(),
          body: JSON.stringify({ name, updated_at: new Date().toISOString() }),
        });
        row.name = name;
      }
      res.json(row);
    } else {
      // Create new
      const r = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          phone,
          name: name || null,
          lifetime_rounds: 0,
          today_rounds: 0,
          today_date: today,
          target_rounds: 16,
        }),
      });
      const data = await r.json();
      res.json(Array.isArray(data) ? data[0] : data);
    }
  } catch (err) {
    res.status(500).json({ error: "Failed to register" });
  }
});

// PUT /api/japa — update rounds
router.put("/japa", async (req, res) => {
  const { phone, today_rounds, lifetime_rounds, target_rounds, name } = req.body;
  if (!phone) { res.status(400).json({ error: "phone required" }); return; }
  try {
    const today = new Date().toISOString().slice(0, 10);
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      today_date: today,
    };
    if (today_rounds !== undefined) updates.today_rounds = today_rounds;
    if (lifetime_rounds !== undefined) updates.lifetime_rounds = lifetime_rounds;
    if (target_rounds !== undefined) updates.target_rounds = target_rounds;
    if (name !== undefined) updates.name = name;

    const url = `${SUPABASE_URL}/rest/v1/japa_counter?phone=eq.${encodeURIComponent(phone)}`;
    const r = await fetch(url, {
      method: "PATCH",
      headers: sbHeaders(),
      body: JSON.stringify(updates),
    });
    const data = await r.json();
    res.json(Array.isArray(data) ? data[0] : data);
  } catch (err) {
    res.status(500).json({ error: "Failed to update" });
  }
});

export default router;
