"""Bolo backend: one Vercel Python function that routes /api/<name> to a handler.

Every handler takes a JSON body and returns a JSON-serialisable dict.
The Sarvam key is read from the environment and never leaves the server.
"""
import base64
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler
from pathlib import Path

from sarvamai import SarvamAI

# Local development: load .env if present (on Vercel the key comes from project settings)
_env = Path(__file__).resolve().parent.parent / ".env"
if _env.exists():
    for _line in _env.read_text().splitlines():
        if "=" in _line and not _line.lstrip().startswith("#"):
            _k, _v = _line.split("=", 1)
            os.environ.setdefault(_k.strip(), _v.strip())

CHAT_MODEL = "sarvam-105b"
STT_MODEL = "saaras:v4"
TRANSLATE_MODEL = "sarvam-translate:v1"

# Languages Sarvam-105B and Bulbul can speak back in (D13)
VOICE_LANGS = {"hi-IN", "bn-IN", "ta-IN", "te-IN", "gu-IN", "kn-IN", "ml-IN", "mr-IN", "pa-IN", "od-IN", "en-IN"}
# Bulbul v4 Flash doesn't cover these, so they use Bulbul v3 (D16)
V3_ONLY = {"ml-IN", "od-IN"}
V4_SPEAKERS = {
    "hi-IN": "ritu_hi_conversation",
    "bn-IN": "roopa_bn_conversational",
    "ta-IN": "vijay_ta_narration",
    "te-IN": "kavitha_te_conversation",
    "gu-IN": "pooja_gu_conversational",
    "kn-IN": "chaitra_kn_conversation",
    "mr-IN": "ishita_mr_conversational",
    "pa-IN": "anand_pa_conversation",
    "en-IN": "simran_en_conversation",
}
LANG_NAMES = {
    "hi-IN": "Hindi", "bn-IN": "Bengali", "ta-IN": "Tamil", "te-IN": "Telugu", "gu-IN": "Gujarati",
    "kn-IN": "Kannada", "ml-IN": "Malayalam", "mr-IN": "Marathi", "pa-IN": "Punjabi", "od-IN": "Odia",
    "en-IN": "English", "as-IN": "Assamese", "ur-IN": "Urdu", "ne-IN": "Nepali", "kok-IN": "Konkani",
    "ks-IN": "Kashmiri", "sd-IN": "Sindhi", "sa-IN": "Sanskrit", "sat-IN": "Santali", "mni-IN": "Manipuri",
    "brx-IN": "Bodo", "mai-IN": "Maithili", "doi-IN": "Dogri",
}

_client = None


def client():
    global _client
    if _client is None:
        key = os.environ.get("SARVAM_API_KEY")
        if not key:
            raise RuntimeError("SARVAM_API_KEY is not set")
        _client = SarvamAI(api_subscription_key=key, timeout=55)
    return _client


# ---------- model helpers ----------

def parse_json(text):
    """Pull the first JSON object out of a model reply (tolerates code fences and stray prose)."""
    text = re.sub(r"<think>.*?</think>", "", text or "", flags=re.S).strip()
    text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.M).strip()
    try:
        return json.loads(text)
    except ValueError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end > start:
            return json.loads(text[start:end + 1])
        raise


def chat_json(system, user, max_tokens=4000):
    # Thinking off (reasoning_effort=None): measured 2 s per app instead of 24-32 s, with valid JSON either way
    last_error = None
    for _ in range(2):  # one retry if a reply comes back empty or unreadable
        res = client().chat.completions(
            model=CHAT_MODEL,
            messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            temperature=0.2,
            reasoning_effort=None,
            max_tokens=max_tokens,
        )
        try:
            return parse_json(res.choices[0].message.content)
        except ValueError as e:
            last_error = e
    raise last_error


def translate_lines(lines, lang):
    """Translate a list of short English strings in one Sarvam-Translate call; English on any mismatch."""
    if lang == "en-IN" or not lines:
        return list(lines)
    # Only mostly-English lines go to the translator (an English sentence may contain a Hindi name);
    # a line already mostly in an Indian script is used as it is
    def mostly_english(line):
        return len(re.findall(r"[A-Za-z]", line)) >= len(re.findall(r"[ऀ-෿]", line)) and re.search(r"[A-Za-z]", line)
    todo = [i for i, line in enumerate(lines) if line and mostly_english(line)]
    if not todo:
        return list(lines)
    numbered = "\n".join(f"{n + 1}. {lines[i]}" for n, i in enumerate(todo))
    try:
        res = client().text.translate(
            input=numbered,
            source_language_code="en-IN",
            target_language_code=lang,
            model=TRANSLATE_MODEL,
            numerals_format="international",
        )
        out = {}
        for row in res.translated_text.splitlines():
            m = re.match(r"\s*(\d+)\s*[.)।]\s*(.+)", row)
            if m and 0 < int(m.group(1)) <= len(todo):
                out[todo[int(m.group(1)) - 1]] = m.group(2).strip()
        return [out.get(i, line) for i, line in enumerate(lines)]
    except Exception:
        return list(lines)


def localise_spec(spec, lang):
    """Fill label/title/say in the user's language from their English versions."""
    fields = spec.get("fields", [])
    totals = spec.get("totals", [])
    source = [spec.get("title_en", "Bolo"), spec.get("say_en", "")]
    source += [f.get("label_en", f.get("key", "")) for f in fields]
    source += [t.get("label_en", "") for t in totals]
    done = translate_lines(source, lang)
    spec["title"], spec["say"] = done[0], done[1]
    for i, f in enumerate(fields):
        f["label"] = done[2 + i]
    for i, t in enumerate(totals):
        t["label"] = done[2 + len(fields) + i]
    return spec


# ---------- prompts ----------

BUILD_SYSTEM = """You are Bolo's app designer. A small-business owner or worker in India described, by voice in any Indian language, an app they need. They may also have photographed something (a notebook register, shelf, menu board, receipt). Reply with ONLY one JSON object.

Choose "mode":
- "pieces" whenever the need is record-keeping: a list of people or items with values such as money, quantities, dates, yes/no, phone numbers or choices. This is the default.
- "code" only if it cannot be one table with totals (quiz, timer, game, calculator, flashcards, counter, drawing).

"pieces" schema:
{"mode":"pieces","title_en":"short app name","icon":"one emoji","color":"marigold|chili|leaf|indigo|plum|teal","say_en":"one friendly sentence telling the user what you built and that they can now speak entries",
 "fields":[{"key":"snake_case","label_en":"Label","type":"text|number|money|date|phone|check|choice|formula","options":["for choice only"],"formula":"for formula only, e.g. litres*rate","unit":"optional, e.g. L, kg"}],
 "primary":"key of the field that names each row (usually a name)",
 "totals":[{"label_en":"Total due","field":"key","op":"sum|count|avg","where":{"field":"check_key","equals":false}}],
 "rows":[{"key":"value"}]}

Rules for "pieces":
- Every value ending in "_en" (title_en, say_en, label_en) MUST be written in English, even though the user spoke another language. We translate them ourselves.
- 2 to 8 fields. The primary field comes first and is type text.
- Field keys are short English snake_case words with no suffix (e.g. "customer", "litres", "advance").
- When there is a quantity and a rate or price, add a "formula" field for the amount (e.g. "litres*rate") and use it in totals. When there is a price and an advance or amount paid, add a formula for the balance (e.g. "price-advance"). Use "money" only for amounts the user enters directly.
- formula uses only other number/money field keys, numbers and + - * / ( ). Our code computes it; never compute values yourself.
- 1 to 3 useful totals ("where" is optional). Our code computes totals.
- If an existing app is given, keep every existing field key unchanged so saved data survives; add, remove or relabel fields as asked.
- rows: only records read from the photo contents, values converted to the field types (numbers as plain numbers, check as true/false, unknown as null). Keep names exactly as written. Otherwise [].

"code" schema:
{"mode":"code","title_en":"short app name","icon":"one emoji","color":"marigold|chili|leaf|indigo|plum|teal","say_en":"one friendly sentence","html":"a complete self-contained HTML document"}

Rules for "code":
- Inline CSS and JS only. No external scripts, fonts, images or network requests. No localStorage.
- Mobile-first, big touch targets, warm colours, works at 360px wide.
- All visible text in {LANG}, in its native script.
- Persist state only with: const saved = await window.bolo.load(); window.bolo.save(stateObject);  (load returns null the first time.)
- If an existing app's HTML is given, change it as asked and keep its saved-state shape compatible."""

ENTRY_SYSTEM = """You update records in a small business's app from a spoken sentence (any Indian language, possibly mixed). Reply with ONLY one JSON object:
{"ops":[...],"say_en":"one short confirmation sentence in English, including the names and amounts you recorded"}

Operations:
- {"op":"add","row":{"field_key":value,...}}
- {"op":"update","index":n,"set":{"field_key":value}}       (replace values in existing row n)
- {"op":"increment","index":n,"field":"key","by":number}   (add to a number/money field of row n, e.g. "took 2 more litres")
- {"op":"delete","index":n}

Rules:
- Convert spoken numbers in any language to digits ("dhai sau" = 250, "sava do" = 2.25). Money is in rupees.
- Use update/increment ONLY when the sentence names a person/item that is clearly the same as an existing row (allowing for spelling, script and honorifics like ji/bhai/didi/amma: "Sharma ji" = "शर्मा"). A different name is a new row: use add. Never change a row's name.
- Write names exactly as the user said them, in the script of the sentence (Hindi stays in Devanagari, etc.). Do not translate or romanise names.
- Only set fields the sentence actually mentions. Never assume yes/no fields (paid, delivered, present): leave them out unless the sentence says so.
- Never fill formula fields; our code computes them.
- Dates as YYYY-MM-DD; today is {TODAY}.
- If the sentence is unclear, return "ops":[] and a say_en asking them to repeat."""

SUMMARY_SYSTEM = """Write a spoken summary for a small-business owner, in plain friendly English, at most 2 short sentences. Use ONLY the numbers given; do not calculate anything new. Mention the most useful totals and, if relevant, who is pending. Reply with ONLY: {"say_en":"..."}"""

FIX_SYSTEM = """You fix a broken self-contained HTML app. Keep its design, language and behaviour; fix only what causes the error. It persists state only via window.bolo.load() / window.bolo.save(obj). Reply with ONLY: {"html":"the full corrected HTML document"}"""

SCENE_PROMPT = """This photo is from a small-business owner in India who wants a simple record-keeping app. In plain English: (1) say what it is (e.g. handwritten milk register, shop shelf, menu board, receipt), (2) list every record you can see as lines like "name | value | value", keeping names in their original script, (3) suggest which columns an app should track. Be concise."""


# ---------- handlers ----------

def h_listen(body):
    """Voice -> text with Saaras v4. Returns the transcript and the detected language."""
    audio = base64.b64decode(body["audio"])
    mime = body.get("mime", "audio/webm").split(";")[0]
    ext = {"audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/ogg": "ogg", "audio/wav": "wav"}.get(mime, "webm")
    res = client().speech_to_text.transcribe(
        file=(f"voice.{ext}", audio, mime),
        model=STT_MODEL,
        mode="transcribe",
        language_code="unknown",
    )
    return {"text": (res.transcript or "").strip(), "lang": res.language_code or body.get("lang") or "hi-IN"}


def _vision_text(image, mime):
    """Sarvam Vision: digitise the photo (handwritten or printed) into Markdown text."""
    c = client()
    job = c.doc_ai.digitise(file=[(f"photo.{mime.split('/')[-1]}", image, mime)], content_type="mixed")
    job_id = job.job_id
    deadline = time.time() + 22  # Gemma usually answers well within this; don't keep the user waiting longer
    while time.time() < deadline:
        status = c.doc_ai.get_status(job_id).status
        if status in ("completed", "partially_completed"):
            # The output is a file (often a zip), so fetch it from its download link and read the HTML inside
            text = _download_text(c.doc_ai.get_download_url(job_id))
            text = re.sub(r"<(style|script|head)[^>]*>.*?</\1>", "", text, flags=re.S | re.I)
            text = re.sub(r"</t[dh]>", " | ", text)
            text = re.sub(r"<br\s*/?>|</(tr|p|div|h\d|li)>", "\n", text)
            text = re.sub(r"<[^>]+>", "", text)
            text = re.sub(r"\n\s*\n+", "\n", text).strip()
            if not text:
                print("vision result had no text:", str(data)[:400], file=sys.stderr)
            return text
        if status in ("failed", "rejected"):
            print("vision job", status, file=sys.stderr)
            return ""
        time.sleep(1.5)
    return ""


def _download_text(link):
    import io
    import zipfile

    import httpx

    res = httpx.request(link.method or "GET", link.url, headers=link.headers or {}, timeout=20)
    res.raise_for_status()
    data = res.content
    if data[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            names = [n for n in z.namelist() if n.endswith((".html", ".md", ".txt"))]  # .json is layout metadata
            return "\n\n".join(z.read(n).decode("utf-8", "ignore") for n in names)
    return data.decode("utf-8", "ignore")


def _collect_text(obj):
    """Gather every string that looks like document content out of a nested result."""
    found = []

    def walk(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if isinstance(v, str) and k in ("content", "markdown", "md", "text", "html") and v.strip():
                    found.append(v)
                else:
                    walk(v)
        elif isinstance(o, list):
            for v in o:
                walk(v)

    walk(obj)
    return "\n\n".join(found)


def _scene(image, mime):
    """Gemma 4 on Sarvam's platform: understand photos that are scenes rather than documents."""
    data_url = f"data:{mime};base64,{base64.b64encode(image).decode()}"
    res = client().responses.create(
        model="gemma4",
        input=[{"role": "user", "content": [
            {"type": "input_text", "text": SCENE_PROMPT},
            {"type": "input_image", "image_url": data_url},
        ]}],
        max_output_tokens=1200,
    )
    return _response_text(res)


def _response_text(res):
    text = getattr(res, "output_text", None)
    if text:
        return text
    data = res.dict() if hasattr(res, "dict") else res
    parts = []
    for item in data.get("output", []) or []:
        for c in item.get("content", []) or []:
            if c.get("type") in ("output_text", "text") and c.get("text"):
                parts.append(c["text"])
    return "\n".join(parts)


def h_see(body):
    """Photo -> what's in it. Sarvam Vision and Gemma 4 run in parallel; either one is enough."""
    image = base64.b64decode(body["image"])
    mime = body.get("mime", "image/jpeg")
    with ThreadPoolExecutor(max_workers=2) as pool:
        doc = pool.submit(_vision_text, image, mime)
        scene = pool.submit(_scene, image, mime)
        text = _safe(doc)
        description = _safe(scene)
    if not text and not description:
        raise RuntimeError("could not read the photo")
    return {"text": text[:6000], "scene": description[:3000]}


def _safe(future):
    try:
        return future.result() or ""
    except Exception as e:  # one reader failing is fine; leave a trace in the server log
        print("photo reader failed:", type(e).__name__, getattr(e, "body", None) or str(e)[:300], file=sys.stderr)
        return ""


def h_build(body):
    """Request (+ optional photo contents, + optional existing app) -> app spec, localised."""
    lang = body.get("lang") or "hi-IN"
    parts = [f"User's language: {LANG_NAMES.get(lang, lang)} ({lang})"]
    if body.get("request"):
        parts.append(f"What they said: {body['request']}")
    if body.get("photo"):
        photo = body["photo"]
        parts.append("Photo contents (document reading):\n" + (photo.get("text") or "(none)"))
        parts.append("Photo contents (scene description):\n" + (photo.get("scene") or "(none)"))
    existing = body.get("existing")
    if existing:
        parts.append("Existing app (change it as asked):\n" + json.dumps(existing, ensure_ascii=False)[:12000])
    system = BUILD_SYSTEM.replace("{LANG}", LANG_NAMES.get(lang, "Hindi"))
    spec = chat_json(system, "\n\n".join(parts), max_tokens=12000)
    if spec.get("mode") == "code":
        if not isinstance(spec.get("html"), str) or "<" not in spec["html"]:
            raise RuntimeError("model returned no HTML")
        spec["title"], spec["say"] = translate_lines([spec.get("title_en", "Bolo"), spec.get("say_en", "")], lang)
        return {"spec": spec}
    spec["mode"] = "pieces"
    spec = _clean_pieces(spec)
    return {"spec": localise_spec(spec, lang)}


FIELD_TYPES = {"text", "number", "money", "date", "phone", "check", "choice", "formula"}


def _clean_pieces(spec):
    """Make the model's spec safe to render: valid keys, types and formulas only."""
    fields, keys = [], set()
    for f in spec.get("fields", [])[:8]:
        key = re.sub(r"[^a-z0-9_]", "_", str(f.get("key", "")).lower()).strip("_")
        if not key or key in keys:
            continue
        f["key"] = key
        if f.get("type") not in FIELD_TYPES:
            f["type"] = "text"
        if f["type"] == "formula" and not re.fullmatch(r"[a-z0-9_+\-*/(). ]+", str(f.get("formula", ""))):
            f["type"] = "number"
        keys.add(key)
        fields.append(f)
    if not fields:
        fields = [{"key": "name", "label_en": "Name", "type": "text"}]
    spec["fields"] = fields
    if spec.get("primary") not in keys:
        spec["primary"] = fields[0]["key"]
    spec["totals"] = [t for t in spec.get("totals", [])[:3] if t.get("field") in keys or t.get("op") == "count"]
    spec["rows"] = [r for r in spec.get("rows", []) if isinstance(r, dict)][:200]
    return spec


def h_entry(body):
    """Spoken sentence -> add/update/increment operations on the app's rows."""
    spec, rows = body["spec"], body.get("rows", [])
    primary = spec.get("primary")
    fields = [{k: f.get(k) for k in ("key", "label_en", "type", "options", "unit")} for f in spec["fields"]]
    existing = [{"index": i, primary: r.get(primary)} for i, r in enumerate(rows)][:300]
    user = json.dumps({"fields": fields, "existing_rows": existing, "sentence": body["text"]}, ensure_ascii=False)
    system = ENTRY_SYSTEM.replace("{TODAY}", time.strftime("%Y-%m-%d"))
    out = chat_json(system, user, max_tokens=2000)
    say = translate_lines([out.get("say_en", "")], body.get("lang", "hi-IN"))[0]
    return {"ops": out.get("ops", []), "say": say}


def h_summary(body):
    """Totals computed by the browser -> one or two spoken sentences (numbers are never recomputed)."""
    out = chat_json(SUMMARY_SYSTEM, json.dumps(body["facts"], ensure_ascii=False), max_tokens=600)
    return {"say": translate_lines([out.get("say_en", "")], body.get("lang", "hi-IN"))[0]}


def h_fix(body):
    """One automatic repair pass for a generated app that threw an error."""
    user = f"Error: {body['error']}\n\nHTML:\n{body['html'][:30000]}"
    out = chat_json(FIX_SYSTEM, user, max_tokens=12000)
    if "<" not in out.get("html", ""):
        raise RuntimeError("no HTML in fix")
    return {"html": out["html"]}


def h_speak(body):
    """Text -> speech in the user's language. Bulbul v4 Flash where possible, v3 for Malayalam/Odia."""
    lang = body.get("lang", "hi-IN")
    text = (body.get("text") or "").strip()[:1500]
    if not text or lang not in VOICE_LANGS:
        return {"audio": None}
    tts = client().text_to_speech
    try:
        if lang in V3_ONLY:
            res = tts.convert(text=text, language_code=lang, model="bulbul:v3", output_audio_codec="mp3")
        else:
            res = tts.convert(text=text, language_code=lang, model="bulbul:v4-flash",
                              speaker=V4_SPEAKERS.get(lang), output_audio_codec="mp3")
    except Exception:
        # A speaker/language mismatch shouldn't cost the user their audio: retry with the stable default
        res = tts.convert(text=text, language_code=lang, model="bulbul:v3", output_audio_codec="mp3")
    return {"audio": "".join(res.audios), "mime": "audio/mpeg"}


ROUTES = {
    "listen": h_listen, "see": h_see, "build": h_build, "entry": h_entry,
    "summary": h_summary, "fix": h_fix, "speak": h_speak,
}


def route(name, body):
    fn = ROUTES.get(name)
    if not fn:
        return 404, {"error": "not found"}
    try:
        return 200, fn(body)
    except Exception as e:  # errors go back as JSON; the browser shows them in the user's language
        return 502, {"error": type(e).__name__, "detail": str(e)[:300]}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        # The browser calls /api/bolo?fn=<name>, so routing doesn't depend on Vercel rewrites
        query = dict(p.split("=", 1) for p in self.path.partition("?")[2].split("&") if "=" in p)
        name = query.get("fn") or self.path.split("?")[0].rstrip("/").split("/")[-1]
        length = int(self.headers.get("content-length") or 0)
        try:
            body = json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            body = {}
        status, payload = route(name, body)
        data = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)
