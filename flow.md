# Execution flow

How code execution moves through Bolo: the entry points, the order things run in, and which file hands off to which.

## Files

| File | Role |
|---|---|
| `index.html` | **Entry point for the product** (`/`). Loads the scripts below in order. |
| `stage.html` | **Entry point for presentation mode** (`/stage`). Same scripts plus `stage.js`. |
| `presets.js` | Four example apps (`window.BOLO_PRESETS`) copied into the launcher on a device's first open. |
| `config.js` | Public Supabase URL and publishable key → `window.BOLO_CONFIG`. |
| `i18n.js` | Bolo's interface text in 11 languages (`t()`), and `langFromScript()` for typed text. |
| `store.js` | `Store`: saves and loads apps (Supabase + browser copy), and opens stage rooms. |
| `app.js` | The product: recording, photos, calling the backend, computing totals, rendering. |
| `stage.js` | Board side of stage mode: QR code, room lock, mirrors the phone's screens in a phone frame. |
| `manifest.webmanifest`, `icon.svg` | Lets people install Bolo to their home screen like an app. |
| `style.css`, `stage.css` | Look of the product and the board. |
| `api/bolo.py` | **Backend entry point.** One Vercel function; routes `?fn=` to a handler that calls Sarvam. |
| `supabase.sql` | One-time database setup (table + `get_app` / `save_app` functions). |
| `vercel.json`, `requirements.txt` | Deployment settings and the Python dependency (`sarvamai`). |
| `chat.py` | The original one-call smoke test; not used by Bolo. |

## Page start-up (`index.html`)

1. Google Fonts (Unbounded + Noto Sans scripts) and `style.css` load.
2. `supabase-js` loads from the CDN, then `config.js` → `i18n.js` → `store.js` → `presets.js` → `app.js`, in that order.
3. `store.js` creates the Supabase client if `BOLO_CONFIG` has a URL and key; otherwise everything stays in the browser.
4. `app.js` runs `seedPresets()`: on a device's first open it copies each preset into a new app (fresh id) via `Store.put`, then sets `bolo.seeded`.
   It then picks the language (saved choice, else the phone's language, else Hindi), calls `route()`, and rejoins a presenting session if one was active.
5. `route()` reads the URL hash:
   - `#/app/<id>` → `Store.get(id)` (Supabase `get_app`, falling back to the browser copy) → `renderApp()`.
   - anything else → `renderHome()`: the launcher (your apps as icons), the big mic, and starter ideas.
6. On screens wider than 760px, `style.css` puts everything inside a phone frame (`.device`).

## Flow 1: speak to create an app (home screen)

```
mic tap → recorder.start()          (app.js, max 29 s, countdown)
mic tap → recorder.stop() → onstop
  → POST /api/bolo?fn=listen        (api/bolo.py h_listen → Saaras v4)  ← text + detected language
  → handleText(text) → create()
  → building() shows the shimmering app outline (#ghost) until the reply arrives
  → POST /api/bolo?fn=build         (h_build → Sarvam-105B JSON → _clean_pieces → localise_spec → Sarvam-Translate)
  → Store.put(app)                   (browser copy now; Supabase save_app 0.4 s later)
  → URL hash = #/app/<id> → render({assemble:true})
  → say(spec.say)
  → POST /api/bolo?fn=speak         (h_speak → Bulbul v4 Flash, or v3 for Malayalam/Odia) → audio plays
```

## Flow 2: speak an entry inside an app

```
mic → listen (as above) → handleText → addEntry()
  → POST ?fn=entry                   (h_entry → Sarvam-105B returns ops: add / update / increment / delete
                                      → Sarvam-Translate for the confirmation sentence)
  → applyOps()                       (app.js: keeps only known fields, converts types; never touches formulas)
  → Store.put → render({flash:true}) → say(confirmation) → speak
```
Totals and formula fields are computed in `app.js` (`computeTotals`, `fieldValue`) every time the app renders. No model ever calculates a number.

## Flow 3: change the app ("Change app" toggle, or any voice input on a generated-code app)

```
listen → handleText → change()
  → POST ?fn=build with existing: compactSpec(app.spec)   (field keys kept, so saved entries still fit)
  → old spec pushed onto app.versions (max 10) → Store.put → render({assemble:true}) → say → speak
Undo: app.versions.shift() becomes app.spec again.
```

## Flow 4: photo

```
photo picked → shrinkPhoto()        (≤1600 px JPEG, keeps the request under Vercel's 4.5 MB limit)
  → showScan()                      (scanning-beam overlay)
  → POST ?fn=see                    (h_see: Sarvam Vision digitise job ∥ Gemma 4 description, in parallel)
  → no app open, or a code app:  create() with the photo contents
    pieces app open:             change() asking to add the photo's records to this app
```

## Flow 5: spoken summary

```
Summary button → computeTotals() in the browser
  → POST ?fn=summary                (h_summary: Sarvam-105B phrases the given numbers → Sarvam-Translate)
  → say → speak
```

## Flow 6: generated-code apps (fallback path)

1. `h_build` returns `mode: "code"` with a full HTML document.
2. `codeFrame()` puts it in a sandboxed `<iframe>` (scripts allowed, no access to Bolo's page, keys or database), with `BRIDGE` injected into its `<head>`.
3. Inside the app, `window.bolo.load()` / `save()` send messages to `app.js`, which answers from `app.state` and saves via `Store.put`.
4. If the app reports an error within 4 seconds of loading, `app.js` calls `POST ?fn=fix` once (`h_fix`) and re-renders with the repaired HTML.

## Flow 7: stage mode (presenting on a big screen)

```
Phone: ⧉ button → startPresenting() (app.js)
  → random 4-character code, saved for this browser tab → Store.room(code) joins the channel
  → sheet shows the code and "Waiting for the screen…"

Board: /stage → stage.html → stage.js
  → "Start the stage" tap (unlocks audio) → presenter types the code (hidden as dots)
  → Store.room(code) → sends {type:"board"} now and every 3 s

Phone: first {type:"board"} → remembers that board → replies {type:"paired", to: board}
  → closes the sheet, ⧉ turns green, render() sends the current screen
Board: {type:"paired"} addressed to itself → that phone becomes the owner; everything else is ignored

From then on, every phone step calls cast(): status, building on/off, heard text, spoken reply, audio,
and on every render either the full app state or "home"
Board: "home" → renderHome(); app state → renderApp(view, app, {readonly:true}), inside the board's phone frame;
  captions in the left column; audio plays on the board (the phone stays silent while presenting)

Phone reload mid-demo: the saved code rejoins the channel; the board's next hello re-pairs it.
```

## Backend (`api/bolo.py`)

`handler.do_POST` → reads `fn` from the query string → `route(fn, body)` → handler function → JSON reply.
Any exception becomes a `502` with a short error; the browser turns it into a message in the user's language (`fail()` in `app.js`).
The Sarvam key is read once from the environment (`.env` locally, Vercel settings when deployed) by `client()`.
