# Growth – Trainings-App (PWA) für Kevin

Statische PWA, kein Backend, keine API-Keys. Daten nur auf dem Gerät (localStorage, Fotos in IndexedDB).
Plan: plan.json = Kopie von /workspace/health-kb/kevin/plan/Kevin_Growth_Plan.json (Gio, 15.11.2026).
Plan aktualisieren: neue plan.json ersetzen und `growth-v1` in sw.js hochzählen, oder in der App unter Mehr → Plan → „Neuen Plan importieren“ (Logs bleiben).

Lokal testen: `python3 -m http.server 8765` → http://localhost:8765/  (Testdatum per `?heute=2026-12-21`)
Hosting: jeder statische Host über HTTPS (GitHub Pages, Netlify, Cloudflare Pages). Ordner einfach hochladen.
Technik-Tipps: Quelle „Plan“ = Kevin_Growth_12_Wochen Kap. 4.4–4.8; „allgemein“ = Standardhinweise für Übungen ohne Plan-Cues (Einheit D).
Videos: MuscleWiki (de-de, 25 Links am 15.11.2026 geprüft, HTTP 200) + YouTube-Suchlink als Fallback.
