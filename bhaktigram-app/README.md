# Bhaktigram — Android app (Expo / React Native)

A native Android app for the **Bhaktigram** surface of Build Iskcon:

- **Posts** — the devotional feed (approved Instagram artworks) with anonymous likes
- **Chat** — real-time community *sangha* rooms over Supabase Realtime websockets

It talks to the **same live Supabase backend** as the website, so messages,
likes and posts are shared between the web app and the phone app. No login —
identity is an anonymous device id + a display name you pick on first message
(exactly like the website).

This project is **standalone** — it is intentionally outside the repo's pnpm
workspace. Use plain `npm` here, not the workspace `pnpm`.

---

## Get a testable APK (Expo EAS cloud build — no Android Studio needed)

You need **Node ≥ 18** and a **free Expo account** (https://expo.dev/signup).

```bash
cd bhaktigram-app

# 1. Install dependencies
npm install

# 2. Align native module versions to the Expo SDK (important — fixes any
#    version drift so the build doesn't fail)
npx expo install --fix

# 3. Log in to Expo (one time)
npx eas-cli login

# 4. Build the APK in Expo's cloud. First run will offer to create the
#    project + generate an Android keystore for you — say yes to both.
npx eas-cli build --platform android --profile preview
```

When it finishes (~10–20 min), EAS prints a **download URL** and shows a QR
code. Open the URL on your Android phone (or `adb install` the file) to
install and test. The `preview` profile is configured to output a **`.apk`**
(see `eas.json`), which installs directly — unlike the Play-Store `.aab`.

### Rebuild after changes
Just re-run step 4. Bump `expo.version` / `android.versionCode` in `app.json`
for a versioned build.

---

## Run on a device/emulator without a cloud build (optional)

If you have Android Studio + a JDK locally:

```bash
cd bhaktigram-app
npm install
npx expo run:android            # debug build on a connected device/emulator
```

Or live-reload in **Expo Go** (scan the QR, no build):

```bash
npx expo start
```

> Note: Expo Go runs the JS but uses Expo's prebuilt native shell. The EAS
> `preview` build above is the real standalone APK for distribution/testing.

---

## What's inside

| File | Purpose |
|------|---------|
| `App.tsx` | Root — Posts/Chat tab switch (no nav lib; state-based) |
| `src/supabase.ts` | Supabase client (Realtime) + REST helper; public anon key |
| `src/lib.ts` | Anonymous identity (AsyncStorage), room list, formatting |
| `src/screens/Feed.tsx` | Approved-IG feed + anonymous likes (`bhaktigram_likes`) |
| `src/screens/ChatList.tsx` | Sangha room list with live last-message previews |
| `src/screens/ChatRoom.tsx` | Realtime conversation (`postgres_changes` on `bhaktigram_chat_messages`) |
| `eas.json` | `preview` = APK, `production` = AAB |
| `app.json` | Expo config (package `com.buildiskcon.bhaktigram`) |

## Backend notes
- Realtime requires `bhaktigram_chat_messages` to be in the `supabase_realtime`
  publication — **already enabled** on the project.
- RLS allows public read + bounded insert on chat/likes; messages are immutable.
- React Native provides a native `WebSocket`, so no `ws` shim is needed
  (that requirement is Node-only).
