# Decisions

A log of meaningful decisions made while building this project, with the reasoning and the trade-offs accepted. Newest entries at the bottom.

---

## D1. Use the official `sarvamai` Python SDK
**Decision:** Talk to Sarvam through the `sarvamai` package (v0.1.37) instead of raw HTTP requests.
**Why:** It is Sarvam's own client, so request shapes, auth headers and model names (`sarvam-105b-conversations`) are already typed and kept in sync with the API. It also exposes every service we may need later (speech-to-text, text-to-speech, translation, document intelligence) behind one client object.
**Trade-off accepted:** One extra dependency, and we are tied to the SDK's release cadence. Worth it versus hand-writing and maintaining request code during a time-boxed build.

## D2. Read `.env` with a few lines of plain Python, not `python-dotenv`
**Decision:** `chat.py` parses `.env` itself (split each line on the first `=`) and puts values into `os.environ`.
**Why:** The project brief was "no extra dependencies". The file has one key, so a full parser is unnecessary.
**Trade-off accepted:** The mini-parser ignores quoting rules, multi-line values and `export` prefixes that `python-dotenv` would handle. Fine for a single `KEY=value` line; revisit if `.env` grows.
**Detail:** `os.environ.setdefault` is used so a key already set in the real environment wins over the file — standard precedence, and it lets the key be supplied without a file (e.g. on a deployment).

## D3. Keep the API key out of code and out of git
**Decision:** The key lives only in `.env`; `.env` is listed in `.gitignore`; the script never prints the key.
**Why:** Hardcoded or committed keys leak through screenshots, repos and shared folders. A hackathon repo is very likely to be pushed publicly.
**Trade-off accepted:** Anyone cloning the repo must create their own `.env` before anything works.

## D4. Fail fast when the key is missing
**Decision:** If `SARVAM_API_KEY` is empty, `chat.py` exits with a clear message before creating the client.
**Why:** Otherwise the failure shows up later as an opaque 401/403 from the API. An early, plain-English error is quicker to fix.
**Trade-off accepted:** None meaningful.

## D5. Use `sarvam-105b-conversations` for the first call
**Decision:** The smoke-test script uses the `sarvam-105b-conversations` chat model.
**Why:** It was specified in the setup brief, and it is one of the two chat models the SDK lists (`sarvam-105b`, `sarvam-105b-conversations`).
**Trade-off accepted:** Not yet benchmarked against `sarvam-105b` for our use case; to be revisited once the project idea is fixed.

## D6. No calls to the Sarvam API unless explicitly requested
**Decision:** Nothing is sent to the Sarvam API (including running `chat.py`) unless the user explicitly asks for it.
**Why:** User instruction. It keeps API usage and costs under the user's control, and keeps questions to the assistant separate from requests to Sarvam.
**Trade-off accepted:** Code is written against the SDK's signatures (inspected locally) without live verification until the user asks for a run.

## D7. Project: "Bolo", speak an app into existence
**Decision:** Build Bolo: a small-business owner (milkman, tutor, tailor, kirana) describes the app they need by voice in their own language, or photographs their notebook, and gets a working app with labels in their own script.
**Why:** Hackathon judging rewards a story that feels revolutionary and a live "that just happened" moment. Pitch line: "No-code tools were built for people who can't code. We built for people who can't type." A wrong AI output is cheap here: the user says "change it" and it is rebuilt. Nobody is harmed.
**Trade-off accepted:** Rejected a 112 emergency-dispatcher co-pilot (user's call): putting a model in a life-or-death loop is unsafe, slow and has no clear accountability. Rejected "Awaaz Wiki" and "Dukaan in 60 seconds" as less striking live.

## D8. Hybrid app generation ("Option C")
**Decision:** The model first tries to describe the app as JSON built from ready-made pieces (lists, forms, money totals, tick-boxes, spoken summary). If the request doesn't fit those pieces, it writes a complete small web app as code instead, run in a sandboxed frame. If that code errors, the error is sent back to the model for one automatic fix before anything is shown.
**Why:** Pieces alone are reliable but fail on unexpected judge requests. Code alone is flexible but slow and can break live. Hybrid gives a reliable rehearsed demo and still answers anything.
**Trade-off accepted:** Two generation paths to build and test. The code path is slower (tens of seconds) and less predictable, so the rehearsed demo stays on the pieces path. Sarvam-105B is used for both paths; switching code-writing to an open model on Sarvam's platform (e.g. GLM-5.3) is the fallback if it struggles in testing.

## D9. One web app, two links
**Decision:** One codebase on Vercel. `/` is the real product, all on one phone: mic, camera, generated app. `/stage` is presentation mode: the smart board shows a QR code and live output, and the presenter's phone is the mic and camera.
**Why:** A real user (e.g. a milkman) needs one end-to-end screen, not two paired devices. Stage mode exists only so the room can watch. One codebase means one backend and no drift between versions.
**Trade-off accepted:** Stage mode adds a sync layer that the product doesn't need. Build order is product first, stage mode last, so if time runs out the product can be shown on a laptop connected to the board.

## D10. Python serverless backend on Vercel, plain front end
**Decision:** Backend is small Python functions on Vercel using the `sarvamai` SDK already in use. Front end is a plain web page without a heavy framework. The Sarvam API key lives only in Vercel's environment settings.
**Why:** Reuses the SDK we already installed and inspected; no framework means fast loads and fewer moving parts in a one-hour build. Keeping the key server-side stops anyone reading it from the page.
**Trade-off accepted:** Vercel functions have request-size and time limits, so photos must be shrunk in the browser before upload and long generations must stay within the function time limit.

## D11. Supabase for stage sync and shareable app links
**Decision:** Use Supabase (free tier) for live phone-to-board sync in `/stage` and for saving generated apps so each gets its own link.
**Why:** Vercel functions can't hold live connections, so phone and board need a shared "room". Supabase gives instant updates and storage, and is already connected in this environment, so setup is ~10–15 minutes.
**Trade-off accepted:** One more external service. Alternatives rejected: Upstash Redis with polling (laggy, more code), direct WebRTC (often blocked on venue Wi-Fi), screen casting (depends on the board's hardware).

## D12. Photograph anything to start an app (image option A)
**Decision:** Photos can start or fill an app: a handwritten notebook, a shop shelf, a menu board, a receipt. Sarvam Vision reads text and handwriting; Gemma 4 on Sarvam's platform handles scenes with little text.
**Why:** Turning a familiar physical object into a live app is the demo's strongest moment, and it stays on Sarvam's platform.
**Trade-off accepted:** Rejected AI-generated pictures (option C): Sarvam has no image-generation model, so it would need another provider. Photos inside generated apps (option B) are not in scope.

## D13. Multilingual by design
**Decision:** Users can speak in any of the 22 Indian languages plus English (Saaras v4 detects the language and returns it). App labels are translated into the user's language and script, and the font stack uses Noto Sans for each Indian script.
**Why:** The whole pitch is software for people who don't work in English. Many display fonts can't render Indian scripts, which would show broken characters on the board.
**Trade-off accepted:** Coverage differs by model. Speech input and translation cover 22 languages, but Sarvam-105B and spoken replies (Bulbul) cover 11 (10 Indian + English). Outside those 11, the app still works but without spoken replies.

## D14. Voice entry inside every generated app
**Decision:** Each generated app has its own mic. A spoken entry ("Sharma ji ne 2 litre liya") is transcribed by Saaras v4 and mapped onto the app's fields by Sarvam-105B.
**Why:** Daily use is adding entries, not building apps. Without this, users would have to type every day, breaking the "people who can't type" promise.
**Trade-off accepted:** One more model round-trip per entry, and one more feature in the one-hour build.

## D15. App entries stored in Supabase
**Decision:** Each app's definition and its entries are saved in Supabase, keyed by the app's link.
**Why:** Data survives cleared browsers and phone changes, and a shared link shows the real app with real data, which matters for the judge-opens-it-on-their-phone moment.
**Trade-off accepted:** No login, so anyone holding an app's link can see and edit it. The links are long and unguessable, which is acceptable for a prototype; real accounts would come in production.

## D16. Mix Bulbul models for spoken replies
**Decision:** Use Bulbul v4 Flash (`bulbul:v4-flash`) where it supports the language, and Bulbul v3 (`bulbul:v3`) for Malayalam and Odia, which v4 Flash lacks.
**Why:** Newest voices where possible, while still covering all 11 languages Sarvam-105B supports.
**Trade-off accepted:** Two code paths for speech output and slightly different voice styles across languages.

## D17. No per-device usage limit
**Decision:** No rate limiting on the deployed app (user's call).
**Why:** Less to build in a one-hour slot, and no risk of a judge hitting a limit mid-demo.
**Trade-off accepted:** Anyone with the public link can spend Sarvam credits. Mitigation if needed: take the deployment down or rotate the key after the hackathon.

## D18. Built-in safeguards
**Decision:** Standard in every flow:
- Totals and dues are calculated by our code; the model only interprets what was said ("dhai sau" → 250).
- Photos are shrunk in the browser before upload (Vercel rejects request bodies over ~4.5 MB).
- Recording is capped at 30 seconds with a visible countdown (the Saaras REST limit).
- Every app version is kept, with an undo button; changing an app's fields keeps existing entries.
- Generated-code apps run in a sandboxed frame with no access to our keys or database, and save data through the same channel as piece-built apps.
- A type-it-instead box is always available (noisy hall, denied mic permission).
- Only the first phone to scan the stage QR controls the board.
- Errors are shown and spoken in the user's language, never a blank screen.
**Why:** End-to-end reliability: each item closes a gap found when walking through the full user journey.
**Trade-off accepted:** More small pieces of code. Each is short, and they are what keep a live demo from failing.

## D19. One backend function, routed by `?fn=`
**Decision:** All seven endpoints (`listen`, `see`, `build`, `entry`, `summary`, `fix`, `speak`) live in `api/bolo.py`. The browser calls `/api/bolo?fn=<name>`.
**Why:** Vercel turns each file in `api/` into its own function, and sharing code between them needs extra bundling settings. One file avoids that, and one warm function serves every step of a demo faster than seven cold ones. The `?fn=` parameter means routing doesn't depend on Vercel rewrites.
**Trade-off accepted:** One larger file instead of one file per endpoint. `maxDuration` is set to 60 seconds for all of it, because code generation is the slowest step.

## D20. Photos go to Sarvam Vision and Gemma 4 at the same time
**Decision:** `/see` runs Sarvam Vision (digitise, handwritten or printed) and Gemma 4 (scene description) in parallel threads and passes both to the app builder. Either one succeeding is enough.
**Why:** Vision is best at reading handwriting and tables; Gemma understands photos with little text (a shelf, a shop). Running both in parallel costs no extra waiting time and covers every kind of photo (D12).
**Trade-off accepted:** Two API calls per photo instead of one. Vision is a job (start, then check status), so it is given 35 seconds before we carry on with whatever Gemma found.

## D21. The model writes English; Sarvam-Translate localises
**Decision:** Sarvam-105B designs the app with English labels (`label_en`, `title_en`, `say_en`). One Sarvam-Translate call then translates all of them into the user's language as a numbered list. Any line that doesn't come back keeps its English text. Generated-code apps are the exception: the model writes their text directly in the user's language.
**Why:** The model's JSON output is more reliable in English, and stable English keys make later changes ("add phone numbers") safe. It gives Sarvam-Translate a real job, and covers all 22 languages, not only the 11 the chat model speaks.
**Trade-off accepted:** One extra round-trip (about a second) per build. Translating an HTML app would risk breaking it, so code apps don't get this step.

## D22. Supabase table locked; access only through two functions
**Decision:** The `apps` table has row-level security on and no direct access for the public key. The browser can only call `get_app(id)` and `save_app(...)`, which work on one app at a time and reject ids shorter than 20 characters. Setup is in `supabase.sql`.
**Why:** The publishable key is public by design. With a normal "allow read" rule, anyone could list everyone's apps. With this setup an app can only be opened by someone who has its secret link (D15). Verified: a direct table read with the public key returns "permission denied".
**Trade-off accepted:** Slightly more SQL than a plain table. Anyone who has a link can still overwrite that app; acceptable without logins.

## D23. Stage sync over Supabase Realtime broadcast
**Decision:** The phone and board join a broadcast channel named after a random 6-character room code. The phone sends events (status, what was heard, spoken reply, audio, full app state); the board only displays them and plays the audio. Messages sent before the channel is joined are queued.
**Why:** Broadcast needs no table and no extra setup. Sending the whole app state each time means the board never drifts out of sync. Verified locally: ticking "paid" on the phone updated the board's total within a second.
**Trade-off accepted:** Board audio arrives as base64 in a broadcast message, so very long spoken replies could hit the message size limit; replies are kept to one or two sentences.

## D24. Visual design: the shop register (bahi-khata)
**Decision:** Ruled-paper background, a red margin line on every record card, marigold mic, ink-black and chilli-red total cards. Unbounded for the brand and numbers, Noto Sans for each Indian script. Apps "assemble" on screen (totals, then field blocks, then rows, one after another). Photos get a scanning-beam animation while they are read.
**Why:** The judges said creativity decides the top three. The look ties the product to the notebook it replaces, and the assemble animation makes "speak, and an app appears" visible.
**Trade-off accepted:** More CSS than a plain layout. Animations are switched off for people who set "reduce motion".

## D25. Bolo's own interface text written by hand in 11 languages
**Decision:** Bolo's buttons and messages (`i18n.js`) are pre-written in the 11 voice languages; apps' labels still come from Sarvam-Translate.
**Why:** The interface appears instantly with no API call, and still works when the network is down (error messages must not depend on the network).
**Trade-off accepted:** The hand-written translations haven't been checked by native speakers. Other languages fall back to English for Bolo's own buttons.

## D26. Smaller reliability choices
**Decision:**
- Every save also goes to the browser's own storage, so apps still open if Supabase is unreachable.
- Board shows a "Start the stage" button first, because browsers block sound until someone taps the page.
- Board also shows the join link as text under the QR code, in case glare stops a phone camera reading it.
- If a Bulbul v4 Flash voice is rejected for a language, speech is retried with Bulbul v3's default voice.
- Recordings shorter than 0.7 seconds are treated as "didn't hear" without calling the API.
**Why:** Each removes a way the live demo could fail.
**Trade-off accepted:** None meaningful.

## D27. Always phone-sized, and a launcher home screen
**Decision:** On any screen wider than 760px, Bolo runs inside a phone frame; on a phone it fills the screen. The board in stage mode mirrors the presenter's phone screen by screen (home, building preview, app) inside a large phone frame, with live captions beside it. The ruled-paper background is gone. The home screen is a launcher: every app the user has spoken appears as its own icon (the model picks an emoji and a colour). Added tappable starter ideas, a shimmering "building" preview, search and a yes/no filter inside apps, and an installable web-app manifest.
**Why:** User feedback: the ruled lines looked unfinished, the product needed to feel complete end to end, and the board should show a mobile instance, because Bolo is a phone product. A launcher full of your own spoken apps makes "you build your own software" visible at a glance.
**Trade-off accepted:** The frame uses `transform` on the phone container so the dock, toasts and overlays stay inside it; fixed-position elements therefore behave like absolute ones on wide screens. The starter ideas are written in English and Hindi only; other languages see the English labels (the app built from them is still in the user's language).

## D28. Pair the board by typing a code from the phone (replaces the QR code)
**Decision:** The phone's "Present on a screen" button (⧉) makes a 4-character code. On the board, the presenter opens `/stage` and types it into a password-style box. The board keeps announcing itself; the phone answers "paired" to the first board only, and the board then listens only to that phone. If the phone reloads mid-demo, it rejoins the same code and re-pairs with the same board automatically.
**Why:** A QR code on stage invites anyone in the audience to scan it and take over the demo (user's concern). With this, nothing scannable or readable is ever shown to the room. Verified locally: a second screen typing the same code was refused, the paired board kept updating live, and a phone reload reconnected on its own.
**Trade-off accepted:** The presenter types four characters on the board instead of scanning. The board sends a small "hello" every 3 seconds so a reloaded phone can find it again.

## D29. Fixes from testing against the real Sarvam API
**Decision:**
- Sarvam-105B runs with thinking off (`reasoning_effort=None`), with one automatic retry if a reply can't be read as JSON.
- Only mostly-English lines are sent to Sarvam-Translate; lines already mostly in an Indian script are kept as they are.
- Stronger prompt rules: `_en` values must be English; field keys are plain English words; quantity × rate and price − advance get formula fields; entries only set fields the sentence mentions; a different name always means a new row; names stay in the script they were spoken in.
- Sarvam Vision's result is fetched from its download link (it arrives as a zip of HTML), and styling and layout metadata are stripped out. It is given 22 seconds before Bolo carries on with Gemma's reading.
- Photo-reader failures are written to the server log instead of disappearing.
**Why:** Measured with real calls: building an app took 24–32 s with thinking on and 2–5 s with it off, with valid output either way. Without thinking, the model sometimes wrote "English" labels in Hindi, which the translator then turned into English, skipped formulas, marked people paid unprompted, and once overwrote one student's row with another's. Each rule above fixed a case seen in testing; all were re-tested afterwards (Hindi, Kannada and Tamil apps; four voice entries; a change by voice; the summary; undo; the quiz; the photo).
**Trade-off accepted:** Without thinking, quality depends more on the prompt rules, so unusual requests may need a "change it". Speech-to-text latency varies on Sarvam's side (2–17 s measured).

## D30. Backend file renamed to `api/bolo.py`; deployed to Vercel
**Decision:** The backend lives in `api/bolo.py` (called at `/api/bolo?fn=...`), and `vercel.json` sets `"framework": null`. The Vercel project is `bolo`; the Sarvam key is a hidden production environment variable. `.vercelignore` keeps `.env`, docs and local tooling out of the deployment.
**Why:** With the file named `api/index.py`, Vercel treated the whole project as a Python web app and sent every page, including the home page, to the backend.
**Trade-off accepted:** None meaningful.

## D31. The live link is kept out of the repository
**Decision:** The GitHub repository and README don't contain the deployed address.
**Why:** User's call: there are limited Sarvam credits and no usage limit (D17), so the live app shouldn't be advertised publicly.
**Trade-off accepted:** Anyone reviewing the code has to run it themselves or be given the link directly.

## D32. Example apps preloaded on first open
**Decision:** `presets.js` holds four example apps: the milk register built from the notebook photo, the tuition tracker built by voice (Aarav, Siya, Kabir, Meera), a Kannada tailor order book, and the Hindi GK quiz. The first time Bolo opens on a device (no `bolo.seeded` flag in the browser), `seedPresets()` in `app.js` copies each one into the launcher as a new app with a fresh id, then sets the flag. The board never seeds.
**Why:** The presenter can show finished apps straight away, in two languages and both build paths (record-keeping and code), without depending on live API calls for every example. Fresh ids per device mean two phones never edit the same saved app.
**Trade-off accepted:** Every new visitor gets the same four examples, which they can ignore or keep. The quiz preset is a corrected version of the one generated in testing: the generated one marked every answer wrong (it read the wrong value and compared Hindi answers with English ones). The tailor preset uses the tested Kannada labels with cleaned field keys, a balance formula and three sample orders.

## D33. Two bugs found while preparing presets
**Decision:**
- Supabase saves are now debounced per app, not with one shared timer.
- Messages from a generated-code app are matched against the frame currently on screen, not a reference captured when the frame finished loading.
**Why:** With one shared timer, saving several apps quickly (as seeding does) sent only the last one to Supabase. Code apps that call `window.bolo.load()` while starting up (the quiz does) never got an answer and showed a blank screen. Both verified fixed: all four presets reach Supabase, and the quiz renders and scores.
**Trade-off accepted:** None meaningful.
