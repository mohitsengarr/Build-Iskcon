import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SEOHead } from "@/components/SEOHead";
import { Link } from "wouter";
import { Phone, User, LogIn, LogOut, Pencil, Check, X, RotateCcw, Target, Volume2, VolumeX } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface JapaData {
  id: string;
  phone: string;
  name: string | null;
  lifetime_rounds: number;
  today_rounds: number;
  today_date: string;
  target_rounds: number;
}

type Mode = "onscreen" | "focused";

const BEADS_PER_ROUND = 108;

// ── Supabase direct access (works on both Replit & Vercel static) ───────────
const SUPABASE_URL = "https://etfmndcrchundvgtvmot.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0Zm1uZGNyY2h1bmR2Z3R2bW90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc2NDE1MTIsImV4cCI6MjA2MzIxNzUxMn0.7GXS820xSFcUy2TRdbspN7s-NP3sgKFFtUP-Zw0Qbrs";

function sbFetch(path: string, opts?: RequestInit) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...opts,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(opts?.headers || {}),
    },
  });
}

// ── Haptic / Audio Feedback ──────────────────────────────────────────────────

function vibrate(ms: number = 15) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

let clickAudioCtx: AudioContext | null = null;
function playClick() {
  try {
    if (!clickAudioCtx) clickAudioCtx = new AudioContext();
    const osc = clickAudioCtx.createOscillator();
    const gain = clickAudioCtx.createGain();
    osc.connect(gain);
    gain.connect(clickAudioCtx.destination);
    osc.frequency.value = 800;
    gain.gain.value = 0.08;
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, clickAudioCtx.currentTime + 0.06);
    osc.stop(clickAudioCtx.currentTime + 0.06);
  } catch { /* silent */ }
}

function playRoundComplete() {
  try {
    if (!clickAudioCtx) clickAudioCtx = new AudioContext();
    const osc = clickAudioCtx.createOscillator();
    const gain = clickAudioCtx.createGain();
    osc.connect(gain);
    gain.connect(clickAudioCtx.destination);
    osc.type = "sine";
    osc.frequency.value = 523.25; // C5
    gain.gain.value = 0.15;
    osc.start();
    osc.frequency.exponentialRampToValueAtTime(783.99, clickAudioCtx.currentTime + 0.15); // G5
    gain.gain.exponentialRampToValueAtTime(0.001, clickAudioCtx.currentTime + 0.4);
    osc.stop(clickAudioCtx.currentTime + 0.4);
  } catch { /* silent */ }
}

// ── Main Component ───────────────────────────────────────────────────────────

export default function JapaCounter() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<Mode>("onscreen");
  const [count, setCount] = useState(0); // current bead in this round (0-107)
  const [todayRounds, setTodayRounds] = useState(0);
  const [lifetimeRounds, setLifetimeRounds] = useState(0);
  const [targetRounds, setTargetRounds] = useState(16);
  const [soundOn, setSoundOn] = useState(true);

  // Auth
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [loggedIn, setLoggedIn] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [loginPhone, setLoginPhone] = useState("");
  const [loginName, setLoginName] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [editToday, setEditToday] = useState(0);
  const [editLifetime, setEditLifetime] = useState(0);
  const [editTarget, setEditTarget] = useState(16);

  // Sync
  const syncTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSyncedRef = useRef({ today: 0, lifetime: 0 });

  // ── Load from localStorage on mount ────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = localStorage.getItem("japa_local");
      if (saved) {
        const d = JSON.parse(saved);
        const today = new Date().toISOString().slice(0, 10);
        if (d.today_date === today) {
          setTodayRounds(d.today_rounds || 0);
          setCount(d.current_count || 0);
        }
        setLifetimeRounds(d.lifetime_rounds || 0);
        setTargetRounds(d.target_rounds || 16);
      }
      const auth = localStorage.getItem("japa_auth");
      if (auth) {
        const a = JSON.parse(auth);
        const normalizedPhone = (a.phone || "").toLowerCase();
        setPhone(normalizedPhone);
        setName(a.name || "");
        setLoggedIn(true);
        // Fetch latest from server
        fetchFromServer(normalizedPhone);
      }
    } catch { /* ignore */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save to localStorage whenever state changes ────────────────────────────
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem("japa_local", JSON.stringify({
      today_rounds: todayRounds,
      lifetime_rounds: lifetimeRounds,
      target_rounds: targetRounds,
      current_count: count,
      today_date: today,
    }));
  }, [todayRounds, lifetimeRounds, targetRounds, count]);

  // ── Server sync (debounced) ────────────────────────────────────────────────
  const syncToServer = useCallback(() => {
    if (!loggedIn || !phone) return;
    if (syncTimeout.current) clearTimeout(syncTimeout.current);
    syncTimeout.current = setTimeout(async () => {
      if (lastSyncedRef.current.today === todayRounds && lastSyncedRef.current.lifetime === lifetimeRounds) return;
      try {
        const today = new Date().toISOString().slice(0, 10);
        await sbFetch(`japa_counter?phone=eq.${encodeURIComponent(phone)}`, {
          method: "PATCH",
          body: JSON.stringify({
            today_rounds: todayRounds,
            lifetime_rounds: lifetimeRounds,
            target_rounds: targetRounds,
            today_date: today,
            updated_at: new Date().toISOString(),
          }),
        });
        lastSyncedRef.current = { today: todayRounds, lifetime: lifetimeRounds };
      } catch { /* silent */ }
    }, 2000);
  }, [loggedIn, phone, todayRounds, lifetimeRounds, targetRounds]);

  useEffect(() => { syncToServer(); }, [todayRounds, lifetimeRounds, syncToServer]);

  const fetchFromServer = async (ph: string) => {
    try {
      const r = await sbFetch(`japa_counter?phone=eq.${encodeURIComponent(ph)}`);
      const rows = await r.json();
      if (Array.isArray(rows) && rows.length > 0) {
        const data = rows[0];
        const today = new Date().toISOString().slice(0, 10);
        const todayR = data.today_date === today ? (data.today_rounds || 0) : 0;
        setTodayRounds(todayR);
        setLifetimeRounds(data.lifetime_rounds || 0);
        setTargetRounds(data.target_rounds || 16);
        if (data.name) setName(data.name);
        lastSyncedRef.current = { today: todayR, lifetime: data.lifetime_rounds || 0 };
      }
    } catch { /* ignore */ }
  };

  // ── Login / Register ──────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!loginPhone.trim()) return;
    setLoginLoading(true);
    try {
      const ph = loginPhone.trim().toLowerCase();
      const nm = loginName.trim() || null;
      const today = new Date().toISOString().slice(0, 10);

      // Check if user exists
      const checkR = await sbFetch(`japa_counter?phone=eq.${encodeURIComponent(ph)}`);
      const existing = await checkR.json();

      let data: Record<string, unknown>;

      if (Array.isArray(existing) && existing.length > 0) {
        data = existing[0];
        if (data.today_date !== today) {
          data.today_rounds = 0;
          data.today_date = today;
        }
        if (nm && nm !== data.name) {
          await sbFetch(`japa_counter?phone=eq.${encodeURIComponent(ph)}`, {
            method: "PATCH",
            body: JSON.stringify({ name: nm, updated_at: new Date().toISOString() }),
          });
          data.name = nm;
        }
      } else {
        const createR = await sbFetch("japa_counter", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({
            phone: ph, name: nm,
            lifetime_rounds: 0, today_rounds: 0,
            today_date: today, target_rounds: 16,
          }),
        });
        const created = await createR.json();
        data = Array.isArray(created) ? created[0] : created;
      }

      if (data && data.phone) {
        setPhone(data.phone as string);
        setName((data.name as string) || loginPhone.trim());
        setLoggedIn(true);
        const serverToday = (data.today_rounds as number) || 0;
        const serverLifetime = (data.lifetime_rounds as number) || 0;
        if (serverLifetime > lifetimeRounds) setLifetimeRounds(serverLifetime);
        if (serverToday > todayRounds) setTodayRounds(serverToday);
        if (data.target_rounds) setTargetRounds(data.target_rounds as number);
        localStorage.setItem("japa_auth", JSON.stringify({ phone: data.phone, name: data.name || loginPhone.trim() }));
        lastSyncedRef.current = { today: serverToday, lifetime: serverLifetime };
        setShowLogin(false);
      }
    } catch { /* ignore */ }
    setLoginLoading(false);
  };

  const handleLogout = () => {
    setLoggedIn(false);
    setPhone("");
    setName("");
    localStorage.removeItem("japa_auth");
  };

  // ── Count tap ──────────────────────────────────────────────────────────────
  const handleTap = useCallback(() => {
    vibrate();
    if (soundOn) playClick();
    setCount(prev => {
      const next = prev + 1;
      if (next >= BEADS_PER_ROUND) {
        // Round complete
        setTimeout(() => {
          vibrate(100);
          if (soundOn) playRoundComplete();
        }, 50);
        setTodayRounds(t => t + 1);
        setLifetimeRounds(l => l + 1);
        return 0;
      }
      return next;
    });
  }, [soundOn]);

  const handleDecrement = useCallback(() => {
    vibrate();
    setCount(prev => {
      if (prev > 0) return prev - 1;
      // If at 0 and we have completed rounds, undo last round completion
      if (todayRounds > 0) {
        setTodayRounds(t => t - 1);
        setLifetimeRounds(l => l - 1);
        return BEADS_PER_ROUND - 1;
      }
      return 0;
    });
  }, [todayRounds]);

  // ── Reset today ────────────────────────────────────────────────────────────
  const handleResetToday = () => {
    setCount(0);
    setTodayRounds(0);
  };

  // ── Edit save ──────────────────────────────────────────────────────────────
  const handleEditSave = async () => {
    setTodayRounds(editToday);
    setLifetimeRounds(editLifetime);
    setTargetRounds(editTarget);
    setEditing(false);
    if (loggedIn && phone) {
      try {
        const today = new Date().toISOString().slice(0, 10);
        await sbFetch(`japa_counter?phone=eq.${encodeURIComponent(phone)}`, {
          method: "PATCH",
          body: JSON.stringify({
            today_rounds: editToday, lifetime_rounds: editLifetime,
            target_rounds: editTarget, today_date: today,
            updated_at: new Date().toISOString(),
          }),
        });
        lastSyncedRef.current = { today: editToday, lifetime: editLifetime };
      } catch { /* ignore */ }
    }
  };

  const openEdit = () => {
    setEditToday(todayRounds);
    setEditLifetime(lifetimeRounds);
    setEditTarget(targetRounds);
    setEditing(true);
  };

  // ── Computed values ────────────────────────────────────────────────────────
  const todayTotal = todayRounds * BEADS_PER_ROUND + count;
  const lifetimeTotal = lifetimeRounds * BEADS_PER_ROUND;
  const progress = targetRounds > 0 ? Math.min((todayRounds / targetRounds) * 100, 100) : 0;
  const todayStr = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

  // ── Focused mode: full screen tap ──────────────────────────────────────────
  if (mode === "focused") {
    return (
      <>
        <SEOHead title="Japa Counter — Build ISKCON" description="Hare Krishna Maha Mantra Japa Counter" />
        <div
          className="fixed inset-0 bg-[#1a1108] flex flex-col items-center justify-center select-none touch-manipulation"
          onClick={handleTap}
          style={{ WebkitTapHighlightColor: "transparent", userSelect: "none" }}
        >
          {/* Top bar */}
          <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Link href="/">
                <span className="font-serif text-xs font-black text-amber-500 uppercase tracking-wider cursor-pointer">Build Iskcon</span>
              </Link>
              <button onClick={() => setMode("onscreen")} className="text-amber-400/70 text-xs font-medium px-2 py-1 rounded-lg bg-amber-900/20">
                Back
              </button>
            </div>
            <span className="text-amber-400/50 text-xs">{todayRounds} rounds</span>
            <button onClick={() => setSoundOn(!soundOn)} className="text-amber-400/70 p-1.5 rounded-lg bg-amber-900/20">
              {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
          </div>

          {/* Big counter */}
          <motion.div
            key={count}
            initial={{ scale: 1.15, opacity: 0.7 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.15 }}
            className="text-[120px] sm:text-[160px] font-bold text-amber-100 leading-none tabular-nums"
          >
            {count}
          </motion.div>

          <p className="text-amber-400/40 text-sm mt-2">{BEADS_PER_ROUND - count} remaining</p>

          {/* Progress ring */}
          <div className="mt-8">
            <svg width="60" height="60" viewBox="0 0 60 60">
              <circle cx="30" cy="30" r="26" fill="none" stroke="#3d2b0a" strokeWidth="4" />
              <circle
                cx="30" cy="30" r="26" fill="none" stroke="#d97706" strokeWidth="4"
                strokeDasharray={`${(count / BEADS_PER_ROUND) * 163.36} 163.36`}
                strokeLinecap="round"
                transform="rotate(-90 30 30)"
              />
            </svg>
          </div>

          <p className="text-amber-500/30 text-xs mt-8">Tap anywhere</p>
        </div>
      </>
    );
  }

  // ── On-screen mode ─────────────────────────────────────────────────────────
  return (
    <>
      <SEOHead title="Japa Counter — Build ISKCON" description="Hare Krishna Maha Mantra Japa Counter" />

      <div className="min-h-screen bg-[#111] text-white select-none" style={{ WebkitTapHighlightColor: "transparent" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-3">
            <Link href="/">
              <span className="font-serif text-sm font-black text-amber-500 uppercase tracking-wider cursor-pointer">Build Iskcon</span>
            </Link>
            <span className="text-white/10">|</span>
            <h1 className="text-lg font-bold text-amber-100 tracking-wide" style={{ fontFamily: "var(--font-devanagari, serif)" }}>
              हरे कृष्ण
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {loggedIn ? (
              <button onClick={handleLogout} className="flex items-center gap-1 text-amber-400/60 px-2 py-1.5 rounded-lg hover:bg-white/5 text-xs" title="Log out">
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden xs:inline">{name || "Logout"}</span>
              </button>
            ) : (
              <button onClick={() => setShowLogin(true)} className="flex items-center gap-1 text-amber-400 px-2.5 py-1.5 rounded-lg bg-amber-900/30 hover:bg-amber-900/50 text-xs font-medium" title="Log in">
                <LogIn className="w-3.5 h-3.5" />
                <span>Login</span>
              </button>
            )}
            <button onClick={openEdit} className="text-amber-400/60 p-1.5 rounded-lg hover:bg-white/5" title="Edit">
              <Pencil className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Session date */}
        <p className="text-center text-amber-400/40 text-xs py-2">
          {loggedIn && name ? `${name} — ` : ""}Session: {todayStr}
        </p>

        {/* Mode toggle */}
        <div className="flex justify-center gap-0 mb-4">
          <button
            onClick={() => setMode("onscreen")}
            className={`px-4 py-1.5 text-xs font-bold tracking-wider transition-colors ${mode === "onscreen" ? "text-white border-b-2 border-amber-500" : "text-white/30"}`}
          >
            ON-SCREEN
          </button>
          <button
            onClick={() => setMode("focused")}
            className={`px-4 py-1.5 text-xs font-bold tracking-wider transition-colors text-white/30`}
          >
            FOCUSED
          </button>
        </div>

        {/* Counter display */}
        <div className="text-center px-4">
          <motion.div
            key={count}
            initial={{ scale: 1.08, opacity: 0.8 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.12 }}
            className="text-[80px] sm:text-[100px] font-bold text-white leading-none tabular-nums"
          >
            {count}
          </motion.div>

          {/* Progress ring around count */}
          <div className="flex justify-center mt-1 mb-3">
            <div className="w-32 h-1.5 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                className="h-full bg-amber-600 rounded-full"
                animate={{ width: `${(count / BEADS_PER_ROUND) * 100}%` }}
                transition={{ duration: 0.15 }}
              />
            </div>
          </div>

          {/* Today stats */}
          <p className="text-white/40 text-sm">Today</p>
          <p className="text-white/70 text-sm">
            {BEADS_PER_ROUND} &times; <span className="font-bold text-white">{todayRounds}</span>
            {targetRounds > 0 && (
              <span className="text-amber-500/50 ml-2">/ {targetRounds} target</span>
            )}
          </p>

          {/* Today progress bar */}
          {targetRounds > 0 && (
            <div className="flex justify-center mt-2 mb-3">
              <div className="w-48 h-1 rounded-full bg-white/5 overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: progress >= 100 ? "#16a34a" : "#d97706" }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          )}

        </div>

        {/* Tap buttons */}
        <div className="flex flex-col items-center gap-4 pb-4">
          {/* Small bead — decrement */}
          <motion.button
            whileTap={{ scale: 0.90 }}
            onClick={handleDecrement}
            className="w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-gradient-to-b from-amber-700 to-amber-900 shadow-lg shadow-amber-900/40 active:shadow-inner touch-manipulation"
            style={{ WebkitTapHighlightColor: "transparent" }}
          />

          {/* Large bead — increment (bigger) */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleTap}
            className="w-64 h-64 sm:w-80 sm:h-80 rounded-full bg-gradient-to-b from-amber-600 to-amber-800 shadow-xl shadow-amber-900/50 active:shadow-inner touch-manipulation"
            style={{ WebkitTapHighlightColor: "transparent" }}
          />
        </div>

        {/* Lifetime stats — below the beads */}
        <div className="text-center px-4 mt-2">
          <div className="w-24 h-px bg-white/10 mx-auto mb-3" />
          <p className="text-white/40 text-sm">Lifetime</p>
          <p className="text-white text-lg font-bold tabular-nums">{lifetimeTotal.toLocaleString("en-IN")}</p>
          <p className="text-white/50 text-sm">
            {BEADS_PER_ROUND} &times; <span className="font-bold text-white/80">{lifetimeRounds.toLocaleString("en-IN")}</span>
          </p>
        </div>

        {/* Bottom controls */}
        <div className="flex items-center justify-center gap-6 mt-4 mb-6">
          <button
            onClick={handleResetToday}
            className="flex items-center gap-1.5 text-amber-400/80 text-sm px-4 py-2 rounded-xl bg-white/5 active:bg-white/10 transition-colors"
          >
            <RotateCcw className="w-4 h-4" /> Reset
          </button>
          <button
            onClick={() => setSoundOn(!soundOn)}
            className="flex items-center gap-1.5 text-amber-400/80 text-sm px-4 py-2 rounded-xl bg-white/5 active:bg-white/10 transition-colors"
          >
            {soundOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            {soundOn ? "Sound" : "Mute"}
          </button>
        </div>

        {/* Sync indicator */}
        {loggedIn && (
          <p className="text-center text-amber-400/20 text-[10px] pb-4">
            <Phone className="w-3 h-3 inline mr-1" />{phone} — Synced
          </p>
        )}
      </div>

      {/* ── Login Modal ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showLogin && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center"
            onClick={() => setShowLogin(false)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              onClick={e => e.stopPropagation()}
              className="bg-[#1a1a1a] rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6 space-y-4"
            >
              <h3 className="text-lg font-bold text-amber-100">Save your progress</h3>
              <p className="text-white/40 text-sm">Log in with your phone number or email to keep your japa progress safe.</p>

              <div className="space-y-3">
                <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2.5">
                  <Phone className="w-4 h-4 text-amber-500/50" />
                  <input
                    type="text"
                    value={loginPhone}
                    onChange={e => setLoginPhone(e.target.value)}
                    placeholder="Phone or Email"
                    className="bg-transparent flex-1 text-white outline-none text-sm placeholder-white/20"
                    autoFocus
                  />
                </div>
                <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2.5">
                  <User className="w-4 h-4 text-amber-500/50" />
                  <input
                    type="text"
                    value={loginName}
                    onChange={e => setLoginName(e.target.value)}
                    placeholder="Your name (optional)"
                    className="bg-transparent flex-1 text-white outline-none text-sm placeholder-white/20"
                  />
                </div>
              </div>

              <button
                onClick={handleLogin}
                disabled={loginLoading || !loginPhone.trim()}
                className="w-full py-3 bg-amber-600 text-white font-bold rounded-xl hover:bg-amber-700 disabled:opacity-40 transition-colors text-sm"
              >
                {loginLoading ? "..." : "Save & Continue"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Edit Modal ──────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center"
            onClick={() => setEditing(false)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              onClick={e => e.stopPropagation()}
              className="bg-[#1a1a1a] rounded-t-2xl sm:rounded-2xl w-full max-w-sm p-6 space-y-4"
            >
              <h3 className="text-lg font-bold text-amber-100">Edit</h3>

              <div className="space-y-3">
                <label className="block">
                  <span className="text-white/40 text-xs">Today's rounds</span>
                  <input
                    type="number"
                    min={0}
                    value={editToday}
                    onChange={e => setEditToday(Math.max(0, parseInt(e.target.value) || 0))}
                    className="mt-1 w-full bg-white/5 rounded-xl px-3 py-2.5 text-white outline-none text-sm focus:ring-1 focus:ring-amber-600"
                  />
                </label>
                <label className="block">
                  <span className="text-white/40 text-xs">Lifetime rounds</span>
                  <input
                    type="number"
                    min={0}
                    value={editLifetime}
                    onChange={e => setEditLifetime(Math.max(0, parseInt(e.target.value) || 0))}
                    className="mt-1 w-full bg-white/5 rounded-xl px-3 py-2.5 text-white outline-none text-sm focus:ring-1 focus:ring-amber-600"
                  />
                </label>
                <label className="block">
                  <span className="text-white/40 text-xs flex items-center gap-1"><Target className="w-3 h-3" /> Daily target (rounds)</span>
                  <input
                    type="number"
                    min={0}
                    value={editTarget}
                    onChange={e => setEditTarget(Math.max(0, parseInt(e.target.value) || 0))}
                    className="mt-1 w-full bg-white/5 rounded-xl px-3 py-2.5 text-white outline-none text-sm focus:ring-1 focus:ring-amber-600"
                  />
                </label>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setEditing(false)}
                  className="flex-1 py-2.5 bg-white/5 text-white/60 font-medium rounded-xl text-sm hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditSave}
                  className="flex-1 py-2.5 bg-amber-600 text-white font-bold rounded-xl text-sm hover:bg-amber-700 transition-colors"
                >
                  Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
