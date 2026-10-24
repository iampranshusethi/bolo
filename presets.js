// Apps built while testing Bolo, copied into a new device's launcher on first open so there are ready examples to show (D32).
window.BOLO_PRESETS = [
  {
    "lang": "hi-IN",
    "spec": {
      "mode": "pieces",
      "title_en": "Milk Register",
      "icon": "🥛",
      "color": "marigold",
      "say_en": "I've built your Milk Register app. You can now speak the entries to add or update records.",
      "fields": [
        {
          "key": "customer",
          "label_en": "Customer Name",
          "type": "text",
          "label": "ग्राहक का नाम"
        },
        {
          "key": "litres",
          "label_en": "Quantity (Liters)",
          "type": "number",
          "unit": "L",
          "label": "मात्रा (लीटर में)"
        },
        {
          "key": "rate",
          "label_en": "Rate per Liter",
          "type": "money",
          "label": "प्रति लीटर दर"
        },
        {
          "key": "total",
          "label_en": "Total Amount",
          "type": "formula",
          "formula": "litres*rate",
          "label": "कुल राशि"
        },
        {
          "key": "paid",
          "label_en": "Payment Status",
          "type": "check",
          "label": "भुगतान की स्थिति"
        }
      ],
      "primary": "customer",
      "totals": [
        {
          "label_en": "Total Unpaid",
          "field": "total",
          "op": "sum",
          "where": {
            "field": "paid",
            "equals": false
          },
          "label": "कुल बकाया"
        }
      ],
      "title": "दूध रजिस्टर",
      "say": "मैंने आपका दूध रजिस्टर ऐप बना दिया है। अब आप बोलकर एंट्री जोड़ सकते हैं।"
    },
    "rows": [
      {
        "customer": "शर्मा जी",
        "litres": 30,
        "rate": 60,
        "paid": true
      },
      {
        "customer": "गुप्ता आंटी",
        "litres": 45,
        "rate": 60,
        "paid": false
      },
      {
        "customer": "रमेश",
        "litres": 12,
        "rate": 62,
        "paid": false
      },
      {
        "customer": "वर्मा जी",
        "litres": 20,
        "rate": 60,
        "paid": true
      },
      {
        "customer": "पिंकी दीदी",
        "litres": 8,
        "rate": 62,
        "paid": false
      }
    ],
    "state": null
  },
  {
    "lang": "hi-IN",
    "spec": {
      "mode": "pieces",
      "title_en": "Tuition Tracker",
      "icon": "📚",
      "color": "indigo",
      "say_en": "I built a Tuition Tracker for you to record monthly fees and track whether they have been received.",
      "fields": [
        {
          "key": "student_name",
          "type": "text",
          "label": "छात्र का नाम",
          "label_en": "Student Name"
        },
        {
          "key": "monthly_fee",
          "type": "money",
          "label": "मासिक शुल्क",
          "label_en": "Monthly Fee"
        },
        {
          "key": "received",
          "type": "check",
          "label": "फीस मिली",
          "label_en": "Received"
        }
      ],
      "primary": "student_name",
      "totals": [
        {
          "op": "sum",
          "field": "monthly_fee",
          "label": "कुल बकाया",
          "where": {
            "field": "received",
            "equals": false
          },
          "label_en": "Total Due"
        },
        {
          "op": "count",
          "field": "student_name",
          "label": "कुल छात्र",
          "label_en": "Students"
        }
      ],
      "title": "ट्यूशन ट्रैकर",
      "say": "मैंने आपके लिए ट्यूशन ट्रैकर बना दिया है।"
    },
    "rows": [
      {
        "student_name": "आरव",
        "monthly_fee": 1500,
        "received": true
      },
      {
        "student_name": "सिया",
        "monthly_fee": 1200,
        "received": true
      },
      {
        "student_name": "कबीर",
        "monthly_fee": 2000
      },
      {
        "student_name": "मीरा",
        "monthly_fee": 1800
      }
    ],
    "state": null
  },
  {
    "lang": "kn-IN",
    "spec": {
      "mode": "pieces",
      "title_en": "Tailor Orders",
      "icon": "🧵",
      "color": "chili",
      "say_en": "Here is your tailor order book. You can now speak each entry to add it.",
      "fields": [
        {
          "key": "customer",
          "label_en": "Customer Name",
          "type": "text",
          "label": "ಗ್ರಾಹಕರ ಹೆಸರು"
        },
        {
          "key": "garment",
          "label_en": "Garment",
          "type": "text",
          "label": "ಉಡುಪು"
        },
        {
          "key": "price",
          "label_en": "Price",
          "type": "money",
          "label": "ಬೆಲೆ"
        },
        {
          "key": "advance",
          "label_en": "Advance",
          "type": "money",
          "label": "ಮುಂಗಡ"
        },
        {
          "key": "balance",
          "label_en": "Balance",
          "type": "formula",
          "formula": "price-advance",
          "label": "ಬಾಕಿ ಮೊತ್ತ"
        },
        {
          "key": "delivery_date",
          "label_en": "Delivery Date",
          "type": "date",
          "label": "ವಿತರಣಾ ದಿನಾಂಕ"
        },
        {
          "key": "status",
          "label_en": "Status",
          "type": "choice",
          "options": [
            "ಬಾಕಿ",
            "ಸಿದ್ಧ",
            "ತಲುಪಿಸಲಾಗಿದೆ"
          ],
          "label": "ಸ್ಥಿತಿ"
        }
      ],
      "primary": "customer",
      "totals": [
        {
          "label_en": "Total Balance",
          "field": "balance",
          "op": "sum",
          "label": "ಒಟ್ಟು ಬಾಕಿ"
        },
        {
          "label_en": "Orders",
          "field": "customer",
          "op": "count",
          "label": "ಒಟ್ಟು ಆರ್ಡರ್‌ಗಳು"
        }
      ],
      "title": "ಟೈಲರ್ ಆರ್ಡರ್‌ಗಳು",
      "say": "ನಿಮ್ಮ ಟೈಲರ್ ಆರ್ಡರ್ ಪುಸ್ತಕ ಇಲ್ಲಿದೆ. ನೀವು ಈಗ ಮಾತನಾಡಿ ನಮೂದುಗಳನ್ನು ಸೇರಿಸಬಹುದು."
    },
    "rows": [
      {
        "customer": "ರಮೇಶ್ ಕುಮಾರ್",
        "garment": "ಶರ್ಟ್",
        "price": 1200,
        "advance": 500,
        "delivery_date": "2026-10-28",
        "status": "ಬಾಕಿ"
      },
      {
        "customer": "ಲಕ್ಷ್ಮಿ",
        "garment": "ಬ್ಲೌಸ್",
        "price": 800,
        "advance": 800,
        "delivery_date": "2026-10-25",
        "status": "ಸಿದ್ಧ"
      },
      {
        "customer": "ಸುರೇಶ್",
        "garment": "ಸೂಟ್",
        "price": 2500,
        "advance": 1000,
        "delivery_date": "2026-10-30",
        "status": "ಬಾಕಿ"
      }
    ],
    "state": null
  },
  {
    "lang": "hi-IN",
    "spec": {
      "mode": "code",
      "title_en": "GK Quiz",
      "icon": "🧠",
      "color": "plum",
      "say_en": "Here is your fun 5-question general knowledge quiz.",
      "title": "सामान्य ज्ञान प्रश्नोत्तरी",
      "say": "यह रही आपकी 5 सवालों वाली सामान्य ज्ञान क्विज़।",
      "html": "<!DOCTYPE html><html lang=\"hi\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"><title>GK Quiz</title><style>*{box-sizing:border-box;margin:0;padding:0;font-family:'Segoe UI',Roboto,sans-serif}body{background:#fff3cd;padding:1rem;text-align:center;color:#553300}h1{font-size:1.5rem;color:#b8860b;margin:.5rem 0}#progress{font-size:.95rem;margin-bottom:1rem}#question{font-size:1.25rem;font-weight:700;margin:1rem 0 1.2rem;line-height:1.4}.opt{display:block;width:100%;font-size:1.1rem;padding:.9rem 1rem;margin:.55rem 0;border:none;border-radius:12px;background:#ffd700;color:#553300;font-weight:700;box-shadow:0 4px 0 #b8860b;cursor:pointer}.opt:active{transform:translateY(3px);box-shadow:0 1px 0 #b8860b}.opt.right{background:#2e6b4a;color:#fff;box-shadow:0 4px 0 #1d4630}.opt.wrong{background:#d2462f;color:#fff;box-shadow:0 4px 0 #8e2c1c}#result{display:none}#result h2{font-size:1.6rem;color:#b8860b;margin:1rem 0 .5rem}#score{font-size:1.3rem;margin-bottom:.4rem}#best{font-size:1rem;margin-bottom:1rem}.again{font-size:1.1rem;padding:.9rem 2rem;border:none;border-radius:12px;background:#553300;color:#fff3cd;font-weight:700}</style></head><body><h1>🧠 सामान्य ज्ञान क्विज़</h1><div id=\"quiz\"><div id=\"progress\"></div><div id=\"question\"></div><div id=\"options\"></div></div><div id=\"result\"><h2>🎉 क्विज़ पूरा!</h2><p id=\"score\"></p><p id=\"best\"></p><button class=\"again\" onclick=\"start()\">फिर से खेलें</button></div><script>\nconst QUESTIONS = [\n  { q: \"भारत की राजधानी क्या है?\", options: [\"मुंबई\", \"नई दिल्ली\", \"कोलकाता\", \"चेन्नई\"], answer: 1 },\n  { q: \"इंद्रधनुष में कितने रंग होते हैं?\", options: [\"पाँच\", \"छह\", \"सात\", \"आठ\"], answer: 2 },\n  { q: \"पृथ्वी का सबसे बड़ा महासागर कौन सा है?\", options: [\"हिंद महासागर\", \"अटलांटिक महासागर\", \"आर्कटिक महासागर\", \"प्रशांत महासागर\"], answer: 3 },\n  { q: \"भारत का राष्ट्रीय पशु कौन सा है?\", options: [\"बाघ\", \"शेर\", \"हाथी\", \"मोर\"], answer: 0 },\n  { q: \"5 + 5 + 5 + 5 + 5 कितना होता है?\", options: [\"20\", \"25\", \"30\", \"55\"], answer: 1 }\n];\nlet current = 0, score = 0, best = 0, locked = false;\nasync function load() {\n  const saved = window.bolo ? await window.bolo.load() : null;\n  best = (saved && saved.best) || 0;\n  start();\n}\nfunction start() {\n  current = 0; score = 0;\n  document.getElementById('quiz').style.display = 'block';\n  document.getElementById('result').style.display = 'none';\n  show();\n}\nfunction show() {\n  locked = false;\n  const item = QUESTIONS[current];\n  document.getElementById('progress').textContent = 'प्रश्न ' + (current + 1) + ' / ' + QUESTIONS.length;\n  document.getElementById('question').textContent = item.q;\n  const box = document.getElementById('options');\n  box.innerHTML = '';\n  item.options.forEach((text, i) => {\n    const b = document.createElement('button');\n    b.className = 'opt';\n    b.textContent = text;\n    b.onclick = () => choose(i, b);\n    box.appendChild(b);\n  });\n}\nfunction choose(i, button) {\n  if (locked) return;\n  locked = true;\n  const item = QUESTIONS[current];\n  const buttons = document.querySelectorAll('.opt');\n  if (i === item.answer) { score++; button.classList.add('right'); }\n  else { button.classList.add('wrong'); buttons[item.answer].classList.add('right'); }\n  setTimeout(() => { current++; current < QUESTIONS.length ? show() : finish(); }, 900);\n}\nfunction finish() {\n  best = Math.max(best, score);\n  if (window.bolo) window.bolo.save({ best: best });\n  document.getElementById('quiz').style.display = 'none';\n  document.getElementById('result').style.display = 'block';\n  document.getElementById('score').textContent = 'आपका स्कोर: ' + score + ' / ' + QUESTIONS.length;\n  document.getElementById('best').textContent = 'सबसे अच्छा स्कोर: ' + best + ' / ' + QUESTIONS.length;\n}\nload();\n</script></body></html>\n"
    },
    "rows": [],
    "state": null
  }
];
