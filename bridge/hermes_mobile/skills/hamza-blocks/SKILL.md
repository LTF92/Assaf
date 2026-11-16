---
name: hamza-blocks
description: "Rich cards in the Hamza phone app: progress, stats, charts, links, maps, files, media, quick replies, forms, checklists."
version: 1.0.0
author: Hermes Mobile
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [Mobile, Formatting, Hamza]
---

# Hamza blocks

The Hamza app (platform `hermes_mobile`) draws normal Markdown well: headings, lists, quotes,
**tables** (full width, swipe sideways, copy button) and fenced code (highlighted, copy button).
Use those first. When a reply is better as a card, add a fenced block with the language `hamza`
holding JSON: one object, or an array of objects. Text outside the fence stays normal Markdown.
Only use these on the `hermes_mobile` platform; other channels show the raw JSON.

## When to use

- A task with stages → `progress`. A few headline numbers → `stats`. A trend or split → `chart`.
- A URL worth opening → `link`. A place → `location`. Files, images, audio, video you produced → `file`, `images`, `audio`, `video`.
- You need the user to pick or fill something → `choices`, `form`, `checklist`. Their answer comes
  back to you as a normal message.

Keep labels short, in the user's language. Valid JSON only (double quotes, no comments, no trailing commas).

## Block types

```hamza
[
  {"type": "progress", "title": "نشر الإصدار 2.4", "percent": 60,
   "steps": [{"label": "بناء المشروع", "status": "done"}, {"label": "الرفع", "status": "running"},
             {"label": "النشر", "status": "waiting"}]},
  {"type": "stats", "items": [{"label": "مهام منجزة", "value": 42, "note": "+8 عن الأسبوع الماضي", "tone": "good"},
                               {"label": "متأخرة", "value": 2, "note": "تحتاج قرارك", "tone": "bad"}]},
  {"type": "chart", "kind": "bar", "title": "المهام المنجزة", "subtitle": "آخر 6 أسابيع",
   "labels": ["1", "2", "3", "4", "5", "6"], "values": [8, 12, 9, 15, 14, 19]},
  {"type": "chart", "kind": "line", "title": "زمن الاستجابة", "values": [2.1, 1.9, 2.0, 1.6, 1.5, 1.4], "unit": "ث"},
  {"type": "chart", "kind": "pie", "title": "استخدام الأدوات", "labels": ["terminal", "read_file", "web_search"], "values": [50, 30, 20]},
  {"type": "link", "url": "https://example.com/guide", "title": "دليل الإعداد", "description": "سطر واحد", "image": "https://…/cover.png"},
  {"type": "location", "title": "مقر الاجتماع", "address": "حي الملقا، الرياض", "lat": 24.80, "lng": 46.61},
  {"type": "images", "images": ["https://…/1.jpg", "https://…/2.jpg"], "caption": "صور الموقع"},
  {"type": "file", "name": "تقرير.pdf", "url": "https://…/report.pdf", "size": "1.2 MB", "meta": "12 صفحة"},
  {"type": "audio", "url": "https://…/note.m4a", "duration": "1:50"},
  {"type": "video", "url": "https://…/demo.mp4", "poster": "https://…/poster.jpg", "duration": "2:15"},
  {"type": "choices", "question": "أي بيئة أنشر عليها؟",
   "options": ["التجريبية", "الإنتاج", {"label": "لا تنشر الآن", "primary": false}]},
  {"type": "form", "title": "حجز اجتماع المراجعة", "submit": "إرسال للوكيل",
   "fields": [{"name": "title", "label": "العنوان", "type": "text", "value": "مراجعة الإصدار"},
              {"name": "date", "label": "التاريخ", "type": "date", "value": "2026-11-20"},
              {"name": "duration", "label": "المدة", "type": "choice", "options": ["30 د", "45 د", "60 د"], "value": "45 د"}]},
  {"type": "checklist", "title": "قبل الإطلاق", "items": [{"label": "مراجعة التغييرات", "done": true}, {"label": "إبلاغ الفريق"}]}
]
```

Fields:
- `progress.steps[].status`: `done` | `running` | `waiting` | `failed`. `percent` is 0–100.
- `stats.items[].tone`: `good` (green) | `bad` (red) | `neutral`. Two cards per row, so 2 or 4 items read best.
- `chart.kind`: `bar` | `line` | `pie`. Line and pie charts placed next to each other share a row.
- `choices.options`: strings, or `{"label", "value", "primary": false}` for a quieter option.
- `form.fields[].type`: `text` | `date` | `choice` (with `options`).

Images, files and media need URLs the phone can reach. For files on this machine, send them as an
attachment the normal way instead.
