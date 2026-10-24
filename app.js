// Bolo front end: home (speak or photograph to create), the generated app, and the phone side of stage mode.
// Order of work for every voice action: record -> /listen -> /build | /entry -> save -> render -> /speak.

const $ = (sel, el = document) => el.querySelector(sel);
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
  return el;
};
const rupees = (n) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/-/g, "");

const state = {
  lang: pickLang(),
  app: null,         // { id, spec, rows, versions, lang }
  busy: false,
  changeMode: false, // next voice input changes the app instead of adding an entry
  fixedOnce: false,  // generated-code apps get one automatic repair (D8)
};

// ---------- presenting on a big screen (stage mode, D28) ----------
// The phone makes a short code; the presenter types it on the board. Nothing scannable is ever shown to the room.
// The board answers once and then listens only to this phone. Code and id survive a phone reload.
const session = (k, v) => { try { return v === undefined ? sessionStorage.getItem(k) : (v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v)); } catch { return null; } };
const CLIENT = session("bolo.client") || (session("bolo.client", uid().slice(0, 12)), session("bolo.client"));
const present = { code: null, board: null };
let room = null;
const cast = (payload) => room && present.board && room.send({ from: CLIENT, ...payload });

function startPresenting(code) {
  present.code = code || Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => "ABCDEFGHJKMNPQRSTUVWXYZ23456789"[b % 31]).join("");
  session("bolo.present", present.code);
  room = Store.room(present.code, (msg) => {
    // The first board to join with the code is paired; any later board is ignored
    if (msg.type === "board" && !present.board) {
      present.board = msg.from;
      room.send({ from: CLIENT, type: "paired", to: msg.from });
      closeSheet();
      toast("● " + "Connected to the screen");
      render();
    }
  });
  if (!code) showPresentSheet();
}

function stopPresenting() {
  if (room) room.leave();
  room = null;
  Object.assign(present, { code: null, board: null });
  session("bolo.present", null);
  closeSheet();
  render();
}

function showPresentSheet() {
  closeSheet();
  const sheet = h("div", { class: "sheet", id: "present", onclick: (e) => e.target === sheet && closeSheet() },
    h("div", { class: "sheet-card present-card" },
      h("p", { class: "section-title" }, "Present on a screen"),
      h("p", {}, "On the big screen, open ", h("b", {}, location.host + "/stage"), " and type this code:"),
      h("div", { class: "code" }, present.code.split("").map((c) => h("span", {}, c))),
      h("p", { class: "waiting-line" }, "Waiting for the screen…"),
      h("div", { class: "sheet-actions" }, h("button", { class: "chip", onclick: stopPresenting }, "Cancel"))));
  $(".device").append(sheet);
}
const closeSheet = () => { const s = $("#present"); if (s) s.remove(); };

function presentButton() {
  if (window.BOLO_BOARD || !Store.online) return null;
  const live = !!present.board;
  return h("button", {
    class: "icon-btn cast" + (live ? " live" : ""), "aria-label": live ? "Stop presenting" : "Present on a screen",
    onclick: () => (live ? stopPresenting() : present.code ? showPresentSheet() : startPresenting()),
  }, "⧉");
}

function pickLang() {
  try { const saved = localStorage.getItem("bolo.lang"); if (saved) return saved; } catch {}
  const nav = (navigator.language || "").slice(0, 2);
  const match = Object.keys(LANGS).find((code) => code.startsWith(nav) && code !== "en-IN");
  return match || "hi-IN";
}

function setLang(code) {
  if (!code) return;
  state.lang = code;
  document.documentElement.lang = code.slice(0, 2);
  try { localStorage.setItem("bolo.lang", code); } catch {}
}

// ---------- talking to the backend ----------

class BoloError extends Error {
  constructor(kind, detail) { super(detail || kind); this.kind = kind; }
}

async function api(fn, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 65000);
  let res;
  try {
    res = await fetch("/api/bolo?fn=" + fn, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: ctrl.signal,
    });
  } catch {
    throw new BoloError("net");
  } finally {
    clearTimeout(timer);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new BoloError("server", data.detail || data.error);
  return data;
}

// ---------- recording ----------

const recorder = {
  rec: null, chunks: [], timer: null, startedAt: 0,
  async start(onDone) {
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      throw new BoloError("mic");
    }
    const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || "";
    this.rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop());
      clearInterval(this.timer);
      const type = this.rec.mimeType || mime || "audio/webm";
      onDone(new Blob(this.chunks, { type }), type, Date.now() - this.startedAt);
      this.rec = null;
    };
    this.rec.start();
    this.startedAt = Date.now();
    // Saaras's direct API takes up to 30 seconds of audio (D18), so stop just before
    this.timer = setInterval(() => {
      const left = 29 - Math.floor((Date.now() - this.startedAt) / 1000);
      document.querySelectorAll(".mic .count").forEach((el) => (el.textContent = left));
      if (left <= 0) this.stop();
    }, 250);
  },
  stop() { if (this.rec && this.rec.state !== "inactive") this.rec.stop(); },
  get active() { return !!this.rec; },
};

const toBase64 = (blob) => new Promise((ok, fail) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(",")[1]);
  r.onerror = fail;
  r.readAsDataURL(blob);
});

// Phone photos are often 3-8 MB; Vercel rejects bodies over ~4.5 MB, so shrink first (D18)
async function shrinkPhoto(file) {
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) throw new BoloError("server", "unreadable image");
  const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
  const canvas = h("canvas", { width: Math.round(img.width * scale), height: Math.round(img.height * scale) });
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", 0.82));
  return { b64: await toBase64(blob), url: URL.createObjectURL(blob) };
}

// ---------- the app's numbers: always computed here, never by a model (D18) ----------

function fieldValue(row, f, fields) {
  if (f.type !== "formula") return row[f.key];
  const expr = String(f.formula || "").replace(/[a-z_][a-z0-9_]*/g, (k) => {
    const v = Number(row[k]);
    return Number.isFinite(v) ? `(${v})` : "0";
  });
  if (!/^[\d+\-*/(). ]+$/.test(expr)) return null;
  try {
    const v = Function(`"use strict";return (${expr})`)();
    return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  } catch { return null; }
}

function isMoney(f, fields) {
  if (f.type === "money") return true;
  if (f.type !== "formula") return false;
  const used = String(f.formula || "").match(/[a-z_][a-z0-9_]*/g) || [];
  return used.some((k) => (fields.find((x) => x.key === k) || {}).type === "money") || /rate|price|amount|due|total|fee/.test(f.key);
}

function computeTotals(spec, rows) {
  return (spec.totals || []).map((tot) => {
    const f = spec.fields.find((x) => x.key === tot.field);
    let list = rows;
    if (tot.where && tot.where.field) {
      const wf = spec.fields.find((x) => x.key === tot.where.field);
      list = rows.filter((r) => {
        const v = wf && wf.type === "check" ? !!r[tot.where.field] : r[tot.where.field];
        return v === tot.where.equals || String(v) === String(tot.where.equals);
      });
    }
    let value;
    if (tot.op === "count") value = list.length;
    else {
      const nums = list.map((r) => Number(f ? fieldValue(r, f, spec.fields) : 0)).filter(Number.isFinite);
      const sum = nums.reduce((a, b) => a + b, 0);
      value = tot.op === "avg" ? (nums.length ? sum / nums.length : 0) : sum;
    }
    const money = tot.op !== "count" && f && isMoney(f, spec.fields);
    return { label: tot.label || tot.label_en, value: Math.round(value * 100) / 100, money, label_en: tot.label_en };
  });
}

function coerce(f, v) {
  if (v == null || v === "") return null;
  if (f.type === "number" || f.type === "money") {
    const n = parseFloat(String(v).replace(/[^\d.\-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (f.type === "check") return v === true || /^(true|yes|1|haan|ha)$/i.test(String(v));
  return String(v);
}

function applyOps(ops) {
  const { spec } = state.app;
  const rows = state.app.rows;
  const byKey = Object.fromEntries(spec.fields.map((f) => [f.key, f]));
  const clean = (obj) => {
    const out = {};
    for (const [k, v] of Object.entries(obj || {})) if (byKey[k] && byKey[k].type !== "formula") out[k] = coerce(byKey[k], v);
    return out;
  };
  let changed = 0;
  for (const op of ops || []) {
    const i = Number(op.index);
    const valid = Number.isInteger(i) && i >= 0 && i < rows.length;
    if (op.op === "add" && op.row) { rows.push({ ...clean(op.row), _t: Date.now() }); changed++; }
    else if (op.op === "update" && valid) { Object.assign(rows[i], clean(op.set)); changed++; }
    else if (op.op === "increment" && valid && byKey[op.field]) {
      rows[i][op.field] = Math.round(((Number(rows[i][op.field]) || 0) + (Number(op.by) || 0)) * 100) / 100; changed++;
    } else if (op.op === "delete" && valid) { rows.splice(i, 1); changed++; }
  }
  return changed;
}

// ---------- speaking back ----------

let audioEl = null;
async function say(text, { silent = false } = {}) {
  if (!text) return;
  toast(text, "say");
  cast({ type: "say", text });
  if (silent) return;
  try {
    const { audio, mime } = await api("speak", { text, lang: state.lang });
    if (!audio) return;
    if (present.board) return cast({ type: "audio", audio, mime }); // when presenting, the board plays it for the room
    if (audioEl) audioEl.pause();
    audioEl = new Audio(`data:${mime};base64,${audio}`);
    audioEl.play().catch(() => {});
  } catch {}
}

function fail(err) {
  const kind = err && err.kind;
  const key = kind === "mic" ? "err_mic" : kind === "hear" ? "err_hear" : "err_net";
  console.warn(err);
  toast(t(key, state.lang), "error");
  cast({ type: "status", text: t(key, state.lang), kind: "error" });
  if (kind === "mic") openTypeBox();
}

// ---------- flows ----------

async function withBusy(label, fn) {
  if (state.busy) return;
  state.busy = true;
  setStatus(label);
  cast({ type: "status", text: label });
  try { await fn(); } catch (e) { fail(e); } finally {
    state.busy = false;
    setStatus(null);
    cast({ type: "status", text: null });
  }
}

async function onMic() {
  if (recorder.active) return recorder.stop();
  if (state.busy) return;
  try {
    await recorder.start(async (blob, mime, ms) => {
      setRecording(false);
      if (ms < 700 || blob.size < 2000) return fail(new BoloError("hear"));
      await withBusy(t("writing", state.lang), async () => {
        const { text, lang } = await api("listen", { audio: await toBase64(blob), mime, lang: state.lang });
        if (!text) throw new BoloError("hear");
        setLang(lang);
        showHeard(text);
        await handleText(text);
      });
    });
    setRecording(true);
    cast({ type: "status", text: t("listening", state.lang), kind: "listening" });
  } catch (e) { fail(e); }
}

async function handleText(text) {
  const app = state.app;
  if (!app) return create({ request: text });
  if (state.changeMode || app.spec.mode === "code") return change({ request: text });
  return addEntry(text);
}

// While an app is being built, a shimmering outline of an app fills the screen
async function building(fn) {
  document.body.classList.add("building");
  cast({ type: "building", on: true });
  try { return await fn(); } finally {
    document.body.classList.remove("building");
    cast({ type: "building", on: false });
  }
}

async function create({ request, photo }) {
  setStatus(t("building", state.lang));
  cast({ type: "status", text: t("building", state.lang), kind: "building" });
  const { spec } = await building(() => api("build", { request, photo, lang: state.lang }));
  const rows = spec.rows || [];
  delete spec.rows;
  state.app = { id: uid() + uid().slice(0, 8), spec, rows, versions: [], lang: state.lang, state: null };
  state.fixedOnce = false;
  Store.put(state.app);
  history.replaceState(null, "", location.pathname + location.search + "#/app/" + state.app.id);
  render({ assemble: true });
  say(spec.say);
}

function compactSpec(spec) {
  if (spec.mode === "code") return { mode: "code", title_en: spec.title_en, html: spec.html };
  return {
    mode: "pieces", title_en: spec.title_en, primary: spec.primary,
    fields: spec.fields.map(({ key, label_en, type, options, formula, unit }) => ({ key, label_en, type, options, formula, unit })),
    totals: (spec.totals || []).map(({ label_en, field, op, where }) => ({ label_en, field, op, where })),
  };
}

async function change({ request, photo }) {
  const app = state.app;
  setStatus(t("building", state.lang));
  cast({ type: "status", text: t("building", state.lang), kind: "building" });
  const { spec } = await building(() => api("build", { request, photo, lang: state.lang, existing: compactSpec(app.spec) }));
  const newRows = spec.rows || [];
  delete spec.rows;
  app.versions = [app.spec, ...app.versions].slice(0, 10); // every version kept for undo (D18)
  app.spec = spec;
  if (spec.mode === "pieces" && Array.isArray(app.rows)) app.rows.push(...newRows);
  if (spec.mode === "code" && !app.state) app.state = null;
  state.changeMode = false;
  state.fixedOnce = false;
  Store.put(app);
  render({ assemble: true });
  say(spec.say);
}

async function addEntry(text) {
  const app = state.app;
  const res = await api("entry", { spec: compactSpec(app.spec), rows: app.rows, text, lang: state.lang });
  const changed = applyOps(res.ops);
  if (changed) { Store.put(app); render({ flash: true }); }
  say(res.say);
}

async function onPhoto(file) {
  if (!file || state.busy) return;
  const { b64, url } = await shrinkPhoto(file).catch((e) => (fail(e), {}));
  if (!b64) return;
  showScan(url);
  cast({ type: "photo", url: null, status: t("reading", state.lang) });
  await withBusy(t("reading", state.lang), async () => {
    const photo = await api("see", { image: b64, mime: "image/jpeg" });
    cast({ type: "status", text: t("building", state.lang), kind: "building" });
    if (state.app && state.app.spec.mode === "pieces") {
      await change({ request: "Add every record from this photo to my app. Add fields only if the photo has important columns my app is missing.", photo });
    } else {
      await create({ request: "Build an app for what is in this photo, filled with its records.", photo });
    }
  });
  hideScan();
}

async function onSummary() {
  const app = state.app;
  if (!app || app.spec.mode !== "pieces") return;
  await withBusy(t("writing", state.lang), async () => {
    const { spec, rows } = app;
    const totals = computeTotals(spec, rows).map((x) => ({ label: x.label_en, value: x.money ? rupees(x.value) : x.value }));
    const pf = spec.fields.find((f) => f.key === spec.primary);
    const sample = rows.slice(-25).map((r) => Object.fromEntries(spec.fields.map((f) => [f.label_en, fieldValue(r, f, spec.fields)])));
    const { say: text } = await api("summary", { facts: { app: spec.title_en, entries: rows.length, totals, rows: sample, name_field: pf && pf.label_en }, lang: state.lang });
    say(text);
  });
}

function undo() {
  const app = state.app;
  if (!app || !app.versions.length) return;
  app.spec = app.versions.shift();
  state.fixedOnce = false;
  Store.put(app);
  render();
}

async function share() {
  const url = location.origin + "/#/app/" + state.app.id;
  try {
    if (navigator.share) await navigator.share({ title: state.app.spec.title, url });
    else { await navigator.clipboard.writeText(url); toast(t("copied", state.lang)); }
  } catch {}
}

// ---------- rendering ----------

const view = () => $("#view");

function setStatus(text) {
  const el = $("#status");
  if (!el) return;
  el.textContent = text || "";
  el.classList.toggle("on", !!text);
  document.body.classList.toggle("busy", !!text);
}

function setRecording(on) {
  document.body.classList.toggle("recording", on);
  document.querySelectorAll(".mic .count").forEach((el) => (el.textContent = on ? "29" : ""));
  setStatus(on ? t("listening", state.lang) : null);
}

function showHeard(text) {
  const el = $("#heard");
  if (el) { el.textContent = "“" + text + "”"; el.classList.add("on"); }
  cast({ type: "heard", text });
}

let toastTimer;
function toast(text, kind = "") {
  const el = $("#toast");
  el.textContent = text;
  el.className = "toast on " + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("on"), kind === "say" ? 7000 : 4000);
}

function showScan(url) {
  const el = $("#scan");
  el.innerHTML = "";
  el.append(h("div", { class: "paper" }, h("img", { src: url, alt: "" }), h("div", { class: "beam" })));
  el.classList.add("on");
}
const hideScan = () => $("#scan").classList.remove("on");

const MIC_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>';

function micButton(big) {
  const glyph = h("span", { class: "glyph" });
  glyph.innerHTML = MIC_SVG;
  return h("button", { class: "mic" + (big ? " big" : ""), "aria-label": "Speak", onclick: onMic },
    h("span", { class: "ring" }), h("span", { class: "ring r2" }), glyph, h("span", { class: "count" }));
}

function photoButton(label) {
  const input = h("input", { type: "file", accept: "image/*", capture: "environment", hidden: true, onchange: (e) => onPhoto(e.target.files[0]) });
  return h("label", { class: "chip" }, input, h("span", { class: "ico cam" }), label);
}

function langPicker() {
  const sel = h("select", { class: "lang", "aria-label": "Language", onchange: (e) => { setLang(e.target.value); render(); } },
    Object.entries(LANGS).map(([code, name]) => h("option", { value: code, selected: code === state.lang ? "" : false }, name)));
  return sel;
}

let typeBoxOpen = false;
function openTypeBox() { typeBoxOpen = true; render(); setTimeout(() => $("#typed") && $("#typed").focus(), 50); }

function typeBox() {
  if (!typeBoxOpen) return null;
  const input = h("input", { id: "typed", placeholder: t("type_ph", state.lang), autocomplete: "off" });
  const send = async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    setLang(langFromScript(text, state.lang));
    typeBoxOpen = false;
    showHeard(text);
    await withBusy(t("writing", state.lang), () => handleText(text));
  };
  return h("form", { class: "typebox", onsubmit: send }, input, h("button", { class: "go", type: "submit", "aria-label": "Send" }, "→"));
}

// Starter ideas: tapping one builds that app straight away, in the current language
const IDEAS = [
  { icon: "🥛", en: "Milk delivery register", hi: "दूध का हिसाब", ask: "I deliver milk to houses every day. Track each customer's litres, rate per litre, the amount and whether they have paid." },
  { icon: "📚", en: "Tuition fees", hi: "ट्यूशन फीस", ask: "I teach tuition. Track each student's monthly fees, whether paid, and their parent's phone number." },
  { icon: "🧵", en: "Tailor orders", hi: "दर्ज़ी के ऑर्डर", ask: "I am a tailor. Track orders: customer name, garment, price, advance paid, delivery date and whether it is delivered." },
  { icon: "🛒", en: "Udhaar khata", hi: "उधार खाता", ask: "I run a kirana shop. Track customer credit: name, amount taken on credit, amount repaid and balance due." },
  { icon: "🧠", en: "Quiz for students", hi: "बच्चों के लिए क्विज़", ask: "Make a fun 5-question general knowledge quiz for class 5 students with a score at the end." },
];

const appIcon = (spec) => h("span", { class: "app-icon", style: `--c: var(--c-${spec.color || "marigold"})` }, spec.icon || "✦");

function renderHome() {
  const recent = Store.recent();
  const ideaLabel = (idea) => (state.lang === "hi-IN" ? idea.hi : idea.en);
  view().replaceChildren(...[
    h("header", { class: "top" }, h("div", { class: "brand" }, "bolo", h("span", { class: "dot" })), langPicker(), presentButton()),
    h("section", { class: "hero" },
      h("p", { class: "kicker" }, "Speak it. Snap it. It's an app."),
      h("h1", {}, t("hint", state.lang)),
      micButton(true),
      h("p", { id: "heard", class: "heard" }),
      h("div", { class: "row" }, photoButton(t("photo", state.lang)),
        h("button", { class: "chip", onclick: openTypeBox }, h("span", { class: "ico kb" }), t("type", state.lang))),
      typeBox()),
    recent.length ? h("section", {}, h("h2", { class: "section-title" }, t("my_apps", state.lang)),
      h("div", { class: "launcher" }, recent.map((a) => h("a", { class: "launch", href: "#/app/" + a.id },
        appIcon(a), h("span", {}, a.title))))) : null,
    h("section", {}, h("h2", { class: "section-title" }, "✦ Try"),
      h("div", { class: "ideas" }, IDEAS.map((idea) => h("button", {
        class: "idea", onclick: () => { showHeard(ideaLabel(idea)); withBusy(t("building", state.lang), () => create({ request: idea.ask })); },
      }, h("span", {}, idea.icon), ideaLabel(idea))))),
    present.board ? h("p", { class: "paired" }, "● Connected to the screen") : null].filter(Boolean));
}

function renderApp(container, app, { readonly = false, assemble = false, flash = false } = {}) {
  const { spec } = app;
  const head = h("header", { class: "top app-top" },
    h("a", { class: "back", href: "#/", "aria-label": "Home" }, "←"),
    appIcon(spec),
    h("h1", { class: "app-title" }, spec.title || spec.title_en),
    presentButton(),
    h("button", { class: "icon-btn", onclick: readonly ? null : share, "aria-label": t("share", state.lang) }, "↗"));

  let body;
  if (spec.mode === "code") body = codeFrame(app, readonly);
  else body = piecesView(app, readonly, assemble, flash);

  const parts = [head, body];
  // The board mirrors the phone exactly, so it shows the same controls (they just don't respond there)
  {
    parts.push(h("p", { id: "heard", class: "heard" }));
    parts.push(typeBox());
    parts.push(h("nav", { class: "dock" + (state.changeMode ? " changing" : "") },
      photoButton(t("photo", state.lang)),
      h("div", { class: "dock-mic" }, micButton(false),
        h("small", {}, spec.mode === "code" || state.changeMode ? t("change_hint", state.lang) : t("entry_hint", state.lang))),
      spec.mode === "pieces"
        ? h("button", { class: "chip", onclick: onSummary }, h("span", { class: "ico spk" }), t("summary", state.lang))
        : h("button", { class: "chip", onclick: openTypeBox }, h("span", { class: "ico kb" }), t("type", state.lang))));
    parts.push(h("div", { class: "subdock" },
      spec.mode === "pieces" ? h("button", { class: "link" + (state.changeMode ? " active" : ""), onclick: () => { state.changeMode = !state.changeMode; render(); } }, "✎ " + t("change", state.lang)) : null,
      app.versions.length ? h("button", { class: "link", onclick: undo }, "↶ " + t("undo", state.lang)) : null,
      spec.mode === "pieces" ? h("button", { class: "link", onclick: openTypeBox }, "⌨ " + t("type", state.lang)) : null));
  }
  container.replaceChildren(...parts.filter(Boolean));
}

// Search text and yes/no filter for the open app; reset when another app opens
const view_state = { query: "", filter: null, appId: null };

function piecesView(app, readonly, assemble, flash) {
  const { spec, rows } = app;
  if (view_state.appId !== app.id) Object.assign(view_state, { query: "", filter: null, appId: app.id });
  const totals = computeTotals(spec, rows);
  const wrap = h("div", { class: "pieces" + (assemble ? " assemble" : "") });
  if (totals.length) {
    wrap.append(h("div", { class: "totals" }, totals.map((x, i) => h("div", { class: "total", style: `--i:${i}` },
      h("span", { class: "total-label" }, x.label), h("strong", {}, x.money ? rupees(x.value) : x.value.toLocaleString("en-IN"))))));
  }
  // What this app tracks, shown as labels so people can see the structure they asked for
  wrap.append(h("div", { class: "blueprint" }, spec.fields.map((f, i) =>
    h("span", { class: "field-chip", style: `--i:${i + totals.length}` }, f.label || f.label_en))));

  const pf = spec.fields.find((f) => f.key === spec.primary) || spec.fields[0];
  const checkField = spec.fields.find((f) => f.type === "check");
  if (rows.length > 4 && !readonly) {
    const search = h("input", { class: "search", type: "search", value: view_state.query, "aria-label": "Search",
      oninput: (e) => { view_state.query = e.target.value; drawRows(); } });
    wrap.append(h("div", { class: "tools" }, search));
  }
  if (checkField && rows.length) {
    const label = checkField.label || checkField.label_en;
    const options = [[null, "∗"], [true, "✓ " + label], [false, "✗ " + label]];
    wrap.append(h("div", { class: "filters" }, options.map(([val, text]) => h("button", {
      class: "filter" + (view_state.filter === val ? " on" : ""),
      onclick: () => { if (!readonly) { view_state.filter = val; render(); } },
    }, text))));
  }

  const list = h("div", { class: "rows" });
  wrap.append(list);
  const drawRows = () => {
    list.replaceChildren();
    const q = view_state.query.trim().toLowerCase();
    const shown = [...rows].map((r, i) => [r, i]).filter(([r]) =>
      (!q || Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q))) &&
      (view_state.filter === null || !checkField || !!r[checkField.key] === view_state.filter)).reverse();
    if (!rows.length) list.append(h("p", { class: "empty" }, t("empty", app.lang || state.lang)));
    shown.forEach(([row, i], n) => list.append(rowCard(app, row, i, n, pf, readonly, flash)));
  };
  drawRows();
  return wrap;
}

function rowCard(app, row, i, n, pf, readonly, flash) {
  const { spec } = app;
  const card = h("article", { class: "card" + (flash && n === 0 ? " fresh" : ""), style: `--i:${Math.min(n, 12) + spec.fields.length}` });
  card.append(h("h3", {}, row[pf.key] == null ? "—" : String(row[pf.key])));
  const meta = h("div", { class: "meta" });
  for (const f of spec.fields) {
    if (f === pf) continue;
    const v = fieldValue(row, f, spec.fields);
    if (f.type === "check") {
      meta.append(h("button", {
        class: "tick" + (v ? " on" : ""), disabled: readonly ? "" : false,
        onclick: (e) => { e.stopPropagation(); row[f.key] = !row[f.key]; Store.put(app); render(); },
      }, (v ? "✓ " : "") + (f.label || f.label_en)));
    } else if (v != null && v !== "") {
      const shown = isMoney(f, spec.fields) ? rupees(v) : (typeof v === "number" ? v.toLocaleString("en-IN") : v) + (f.unit ? " " + f.unit : "");
      meta.append(h("span", { class: "kv" + (f.type === "formula" ? " calc" : "") }, h("small", {}, f.label || f.label_en), h("b", {}, shown)));
    }
  }
  card.append(meta);
  if (!readonly) card.addEventListener("click", () => editRow(i));
  return card;
}

function editRow(index) {
  const app = state.app;
  const row = app.rows[index];
  const fields = app.spec.fields.filter((f) => f.type !== "formula");
  const inputs = fields.map((f) => {
    const type = { number: "number", money: "number", date: "date", phone: "tel" }[f.type] || "text";
    const input = f.type === "check" ? h("input", { type: "checkbox", checked: row[f.key] ? "" : false })
      : f.type === "choice" && f.options ? h("select", {}, h("option", { value: "" }, "—"), f.options.map((o) => h("option", { value: o, selected: row[f.key] === o ? "" : false }, o)))
      : h("input", { type, step: "any", value: row[f.key] ?? "" });
    return [f, input];
  });
  const close = () => sheet.remove();
  const sheet = h("div", { class: "sheet", onclick: (e) => e.target === sheet && close() },
    h("form", { class: "sheet-card", onsubmit: (e) => {
      e.preventDefault();
      for (const [f, input] of inputs) row[f.key] = coerce(f, f.type === "check" ? input.checked : input.value);
      Store.put(app); close(); render();
    } },
      inputs.map(([f, input]) => h("label", { class: "field" }, h("span", {}, f.label || f.label_en), input)),
      h("div", { class: "sheet-actions" },
        h("button", { type: "button", class: "chip danger", onclick: () => { app.rows.splice(index, 1); Store.put(app); close(); render(); }, "aria-label": "Delete" }, "🗑"),
        h("button", { type: "button", class: "chip", onclick: close, "aria-label": "Cancel" }, "✕"),
        h("button", { type: "submit", class: "chip primary", "aria-label": "Save" }, "✓"))));
  document.body.append(sheet);
}

// ---------- generated-code apps: sandboxed, no access to our keys or database (D8, D18) ----------

const BRIDGE = `<script>
(function(){
  var n=0, wait={};
  addEventListener('message', function(e){ var d=e.data||{}; if(d.boloReply!=null && wait[d.boloReply]){ wait[d.boloReply](d.value); delete wait[d.boloReply]; } });
  window.bolo = {
    load: function(){ return new Promise(function(ok){ var id=++n; wait[id]=ok; parent.postMessage({bolo:'load', id:id}, '*'); }); },
    save: function(v){ parent.postMessage({bolo:'save', value: JSON.parse(JSON.stringify(v))}, '*'); }
  };
  window.onerror = function(m, s, l){ parent.postMessage({bolo:'error', message: String(m) + ' (line ' + l + ')'}, '*'); };
  window.addEventListener('unhandledrejection', function(e){ parent.postMessage({bolo:'error', message: String(e.reason)}, '*'); });
})();
<\/script>`;

function withBridge(html) {
  return /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (m) => m + BRIDGE) : BRIDGE + html;
}

let frameWindow = null;
let frameLoadedAt = 0;
let frameReadonly = false;
function codeFrame(app, readonly) {
  const frame = h("iframe", { class: "codeapp", sandbox: "allow-scripts allow-forms allow-modals", title: app.spec.title || "app" });
  frame.srcdoc = withBridge(app.spec.html);
  frame.addEventListener("load", () => { frameWindow = frame.contentWindow; frameLoadedAt = Date.now(); });
  frameReadonly = readonly;
  return h("div", { class: "codewrap" }, frame);
}

window.addEventListener("message", async (e) => {
  const d = e.data || {};
  if (!d.bolo || !state.app || e.source !== frameWindow) return;
  if (d.bolo === "load") e.source.postMessage({ boloReply: d.id, value: state.app.state ?? null }, "*");
  else if (d.bolo === "save" && !frameReadonly) { state.app.state = d.value; Store.put(state.app); }
  else if (d.bolo === "error" && !frameReadonly) {
    // One automatic repair if the generated app breaks while starting up
    if (state.fixedOnce || Date.now() - frameLoadedAt > 4000) return console.warn("app error:", d.message);
    state.fixedOnce = true;
    await withBusy(t("building", state.lang), async () => {
      const { html } = await api("fix", { html: state.app.spec.html, error: d.message });
      state.app.spec.html = html;
      Store.put(state.app);
      render();
    });
  }
});

// ---------- routing ----------

function render(opts = {}) {
  if (state.app) renderApp(view(), state.app, opts);
  else renderHome();
  if (state.app) cast({ type: "app", app: { ...state.app, versions: [] }, assemble: !!opts.assemble, flash: !!opts.flash });
  else cast({ type: "home", lang: state.lang });
}

async function route() {
  const m = location.hash.match(/^#\/app\/([a-z0-9]+)/i);
  if (m) {
    const app = state.app && state.app.id === m[1] ? state.app : await Store.get(m[1]);
    if (app) {
      state.app = app;
      if (app.spec.mode === "pieces" && !Array.isArray(app.rows)) app.rows = [];
      setLang(app.lang || state.lang);
      state.fixedOnce = false;
      return render();
    }
  }
  state.app = null;
  state.changeMode = false;
  render();
}

if (!window.BOLO_BOARD) {
  window.addEventListener("hashchange", route);
  setLang(state.lang);
  route();
  if (session("bolo.present")) startPresenting(session("bolo.present")); // reconnect after a reload mid-demo
}
