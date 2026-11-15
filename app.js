'use strict';
/* Growth – Kevins Trainings-App. Alle Nutzerdaten bleiben auf dem Gerät (localStorage + IndexedDB). */
const KEY = 'growth_v1';
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WD = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const WDS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

let PLAN = null, BASEPLAN = null;
let S = load();
let UI = { tab: 'heute', unit: null, tdate: null, essenSeg: 'heute', koerperSeg: 'gewicht', mehrSeg: 'plan', progEx: null };

function load() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { s = {}; }
  return Object.assign({ settings: {}, workouts: {}, startw: {}, food: {}, whoop: {}, body: [], shop: {}, customPlan: null, photosMeta: [] }, s);
}
function save() { localStorage.setItem(KEY, JSON.stringify(S)); }

/* ---------- Datum ---------- */
function todayISO() {
  const q = new URLSearchParams(location.search).get('heute');
  if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  const d = new Date(); return iso(d);
}
function iso(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function pd(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); }
function addDays(s, n) { const d = pd(s); d.setDate(d.getDate() + n); return iso(d); }
function diffDays(a, b) { return Math.round((pd(b) - pd(a)) / 864e5); }
function fmt(s, wd = true) { const d = pd(s); return (wd ? WDS[d.getDay()] + ' ' : '') + String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + (wd ? '' : d.getFullYear()); }
function num(v) { if (v === '' || v == null) return null; const n = parseFloat(String(v).replace(',', '.')); return isNaN(n) ? null : n; }
function de(n, d = 1) { return n == null ? '–' : Number(n).toLocaleString('de-DE', { maximumFractionDigits: d }); }

/* ---------- Plan-Logik ---------- */
function startDate() { return S.settings.start || PLAN.meta.start; }
function weekOf(date) { return Math.floor(diffDays(startDate(), date) / 7) + 1; }
function phaseKey(w) { return w <= 2 ? 'W1-2' : w <= 7 ? 'W3-7' : w === 8 ? 'W8' : 'W9-12'; }
function phaseName(w) { const p = (PLAN.meta.phasen || []).find(p => p.wochen.includes(w)); return p ? p.name : (w > 12 ? 'nach Plan-Ende' : 'vor Planstart'); }
function weekInfo(w) { return (PLAN.meta.wochen || []).find(x => x.woche === w); }
function units() { return PLAN.einheiten || []; }
function unitL(u) { return String(u.einheit).trim()[0]; }
function getUnit(L) { return units().find(u => unitL(u) === L); }
function scheduled(date) {
  const w = weekOf(date), wd = WD[pd(date).getDay()];
  const r = (PLAN.trainingstage.regel || []).find(r => r.wochentag === wd);
  if (!r) return null;
  const L = String(r.einheit).trim()[0];
  const optional = /optional/i.test(r.einheit);
  if (L === 'D' && (w < 3 || w === 8)) return null;
  const hol = (PLAN.trainingstage.feiertagsverschiebungen || []).find(f => f.datum === date);
  return { L, optional, hol };
}
function presc(ex, w) {
  if (ex.phasen) {
    if (ex.ab_woche && w < ex.ab_woche) return null;
    return ex.phasen[phaseKey(Math.max(1, w))] || null;
  }
  return { saetze: ex.saetze, wiederholungen: ex.wiederholungen, rir: ex.rir };
}
function setCount(str, w) {
  str = String(str || '');
  if (str.includes('→')) { const [a, b] = str.split('→').map(x => parseInt(x)); return w <= 1 ? a : b; }
  const ns = (str.match(/\d+/g) || []).map(Number); return ns.length ? Math.max(...ns) : 3;
}
function repRange(str) { const ns = (String(str || '').match(/\d+/g) || []).map(Number); return ns.length ? { lo: Math.min(...ns), hi: Math.max(...ns) } : null; }
function isTrainingDay(date) {
  const f = S.food[date]; if (f && f.typ) return f.typ === 'Trainingstag';
  const s = scheduled(date); if (s && !s.optional) return true;
  return Object.values(S.workouts).some(x => x.date === date && doneSets(x) > 0);
}
function doneSets(wo) { let n = 0; Object.values(wo.ex || {}).forEach(a => a.forEach(s => s && s.done && n++)); return n; }

/* ---------- Training-Daten ---------- */
function woId(date, L) { return date + '_' + L; }
function getWo(date, L, create) {
  const id = woId(date, L);
  if (!S.workouts[id] && create) S.workouts[id] = { date, unit: L, week: weekOf(date), ex: {} };
  return S.workouts[id];
}
function lastSets(name, beforeDate) {
  const list = Object.values(S.workouts).filter(w => w.date < beforeDate && w.ex[name] && w.ex[name].some(s => s && s.done)).sort((a, b) => b.date.localeCompare(a.date));
  return list.length ? { date: list[0].date, sets: list[0].ex[name].filter(s => s && s.done) } : null;
}
function e1rm(kg, reps) { return kg && reps ? kg * (1 + reps / 30) : null; }

/* ---------- Ernährung ---------- */
function food(date) { if (!S.food[date]) S.food[date] = { meals: {}, supp: {}, water: 0, extra: [] }; return S.food[date]; }
function dayMeals(date) { const wd = WD[pd(date).getDay()]; const t = (PLAN.mahlzeiten.beispieltage || []).find(t => t.tag === wd); return t ? t.mahlzeiten : []; }
function targets(date) { return PLAN.makroziele[isTrainingDay(date) ? 'Trainingstag' : 'Ruhetag']; }
function eaten(date) {
  const f = S.food[date] || { meals: {}, extra: [] }; const sum = { kcal: 0, protein_g: 0, kh_g: 0, fett_g: 0 };
  dayMeals(date).forEach((m, i) => { if (f.meals[i]) for (const k in sum) sum[k] += m.makros[k] || 0; });
  (f.extra || []).forEach(e => { for (const k in sum) sum[k] += num(e[k]) || 0; });
  return sum;
}
function rangeOf(z) {
  const m = String(z || '').match(/(\d{4}-\d{2}-\d{2})(?:\s*bis\s*(\d{4}-\d{2}-\d{2}))?/); if (!m) return null;
  return /^ab/i.test(String(z).trim()) ? { von: m[1], bis: '9999-12-31' } : { von: m[1], bis: m[2] || m[1] };
}
function suppsFor(date) {
  // liefert [{key,label,sub,group}] – Basis & bei Bedarf & optional
  const out = [], notes = [];
  (PLAN.supplements || []).forEach((s, si) => {
    const group = /basis/i.test(s.status) ? 'Basis' : /bedarf/i.test(s.status) ? 'Bei Bedarf' : 'Optional';
    if (s.phasen) {
      const ph = s.phasen.find(p => { const r = rangeOf(p.zeitraum); return r && date >= r.von && date <= r.bis; });
      if (!ph) { const r0 = rangeOf(s.phasen[0].zeitraum); if (r0 && date < r0.von) notes.push(s.name + ': startet am ' + fmt(r0.von, false)); return; }
      const m = String(ph.dosis).match(/(\d+)\s*×\s*(\d+\s*g)/);
      if (m) { for (let i = 0; i < +m[1]; i++) out.push({ key: si + '_' + i, label: s.name.split(' (')[0] + ' ' + m[2] + ' (' + (i + 1) + '/' + m[1] + ')', sub: ph.zeitpunkt + ' · ' + ph.zeitraum, group }); }
      else out.push({ key: si + '_0', label: s.name.split(' (')[0] + ' ' + ph.dosis, sub: ph.zeitpunkt, group });
      return;
    }
    if (s.zeitraum) { const r = rangeOf(s.zeitraum); if (r && (date < r.von || date > r.bis)) { notes.push(s.name + ': ' + (date < r.von ? 'startet am ' + fmt(r.von, false) : 'Zeitraum vorbei – ' + (s.danach || ''))); return; } }
    out.push({ key: si + '_0', label: s.name.split(' (')[0] + (s.dosis ? ' · ' + s.dosis : ''), sub: [s.zeitpunkt, s.bedingung].filter(Boolean).join(' · '), group });
  });
  return { list: out, notes };
}

/* ---------- Fotos (IndexedDB) ---------- */
let dbp = null;
function db() {
  if (!dbp) dbp = new Promise((res, rej) => { const r = indexedDB.open('growth', 1); r.onupgradeneeded = () => r.result.createObjectStore('photos', { keyPath: 'id' }); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  return dbp;
}
async function idb(mode, fn) { const d = await db(); return new Promise((res, rej) => { const tx = d.transaction('photos', mode); const st = tx.objectStore('photos'); const r = fn(st); tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error); }); }
const putPhoto = p => idb('readwrite', st => st.put(p));
const getPhoto = id => idb('readonly', st => st.get(id));
const delPhoto = id => idb('readwrite', st => st.delete(id));
const allPhotos = () => idb('readonly', st => st.getAll());
const urlCache = {};
async function photoURL(id) { if (urlCache[id]) return urlCache[id]; const p = await getPhoto(id); if (!p) return ''; return (urlCache[id] = URL.createObjectURL(p.blob)); }
function resize(file, max = 1400) {
  return new Promise((res, rej) => {
    const img = new Image(); const u = URL.createObjectURL(file);
    img.onload = () => { const sc = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); c.toBlob(b => { URL.revokeObjectURL(u); res(b); }, 'image/jpeg', 0.85); };
    img.onerror = rej; img.src = u;
  });
}
async function hydrateImgs() { for (const el of document.querySelectorAll('img[data-pid]')) { const u = await photoURL(el.dataset.pid); if (u) el.src = u; } }

/* ---------- Pausentimer ---------- */
let T = null, actx = null;
function startTimer(sec, label) {
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { }
  T = { end: Date.now() + sec * 1000, label, beeped: false }; tick();
}
function beep() { if (!actx) return; [0, .25, .5].forEach(t => { const o = actx.createOscillator(), g = actx.createGain(); o.frequency.value = 880; g.gain.value = .2; o.connect(g); g.connect(actx.destination); o.start(actx.currentTime + t); o.stop(actx.currentTime + t + .15); }); if (navigator.vibrate) navigator.vibrate([200, 100, 200]); }
function tick() {
  const el = $('#timer');
  if (!T) { el.hidden = true; return; }
  const left = Math.round((T.end - Date.now()) / 1000);
  if (left <= 0 && !T.beeped) { T.beeped = true; beep(); }
  const a = Math.abs(left);
  el.hidden = false; el.className = left <= 0 ? 'end' : '';
  el.innerHTML = `<div class="grow"><div class="small mut">${left <= 0 ? 'Pause vorbei – nächster Satz' : 'Pause · ' + esc(T.label)}</div><div class="t">${left < 0 ? '+' : ''}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}</div></div>
  <button class="btn sm" data-a="tmr" data-v="-15">−15</button><button class="btn sm" data-a="tmr" data-v="15">+15</button><button class="btn sm" data-a="tmr" data-v="x">✕</button>`;
}
setInterval(() => T && tick(), 500);

/* ---------- UI-Bausteine ---------- */
function bar(val, goal, label, unit) {
  const p = goal ? Math.min(100, val / goal * 100) : 0;
  return `<div class="macro"><div class="row"><span>${label}</span><span>${de(val, 0)} / ${de(goal, 0)} ${unit}</span></div><div class="bar ${val > goal * 1.1 ? 'over' : ''}"><i style="width:${p}%"></i></div></div>`;
}
function check(on, label, sub, a, attrs = '') { return `<div class="check ${on ? 'on' : ''}" data-a="${a}" ${attrs}><div class="box">${on ? '✓' : ''}</div><div class="lbl">${label}${sub ? `<small>${sub}</small>` : ''}</div></div>`; }
function mwLink(slug) { return 'https://musclewiki.com/de-de/exercise/' + slug; }
function ytLink(name) { return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(name.replace(/\(.*?\)/g, '') + ' Übung Technik'); }
function exInfoHTML(ex) {
  const I = (window.EXERCISES || {})[ex.name] || {};
  return `${I.tips ? `<ul class="small" style="padding-left:18px;margin:6px 0">${I.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul><div class="mut small">Quelle Tipps: ${esc(I.src)}</div>` : ''}
  ${I.setup ? `<div class="note small"><b>Einstellen:</b> ${esc(I.setup)}</div>` : ''}
  ${ex.alternative ? `<div class="note warn small"><b>Alternative:</b> ${esc(ex.alternative)}</div>` : ''}
  <div class="links">${I.mw ? `<a class="btn sm blue" target="_blank" rel="noopener" href="${mwLink(I.mw)}">▶ Animation (MuscleWiki)</a>` : ''}${I.mw2 ? `<a class="btn sm" target="_blank" rel="noopener" href="${mwLink(I.mw2)}">▶ Variante</a>` : ''}<a class="btn sm" target="_blank" rel="noopener" href="${ytLink(ex.name)}">▶ YouTube-Videos</a></div>`;
}
function weekLabel(date) { const w = weekOf(date); return w < 1 ? `Start in ${diffDays(date, startDate())} Tagen (${fmt(startDate(), false)})` : w > 12 ? `Plan seit ${fmt(addDays(startDate(), 84), false)} abgeschlossen` : `Woche ${w} von 12 · ${phaseName(w)}`; }

/* ---------- Banner ---------- */
function banners(date) {
  const w = weekOf(date), out = [];
  if (w > 12) out.push(`<div class="note bad"><b>12 Wochen vorbei – Zeit fürs Plan-Update.</b><br>Schick Manfred im Grok-Bot-Chat deine Werte (oder exportiere ein Backup). Den neuen Plan importierst du unter Mehr → Plan; deine Logs bleiben erhalten.</div>`);
  else if (w >= 12) out.push(`<div class="note warn">Letzte Planwoche. Plan-Update in ${diffDays(date, addDays(startDate(), 84))} Tagen.</div>`);
  if (w < 1) out.push(`<div class="note">Planstart am <b>${fmt(startDate(), false)}</b>. Bis dahin kannst du alles ausprobieren (Vorschau Woche 1).</div>`);
  const wi = weekInfo(w); if (wi) out.push(`<div class="note"><b>W${w}:</b> ${esc(wi.hinweis)}</div>`);
  const s = scheduled(date); if (s && s.hol) out.push(`<div class="note warn"><b>Feiertag:</b> Einheit ${s.hol.einheit} verschieben – ${esc(s.hol.verschiebung)}</div>`);
  if ([4, 8, 12].includes(w) && pd(date).getDay() === 0) out.push(`<div class="note warn"><b>Gewichts-Check (Ende W${w}):</b> ${esc(PLAN.makroziele.anpassung)}</div>`);
  const lastW = S.body.slice().sort((a, b) => b.date.localeCompare(a.date))[0];
  if (w >= 1 && (!lastW || diffDays(lastW.date, date) >= 7)) out.push(`<div class="note">Wöchentliches Wiegen fällig → <a href="#" data-a="go" data-v="koerper">Gewicht eintragen</a></div>`);
  const reds = [1, 2].map(i => S.whoop[addDays(date, -i + 1)]); if (reds[0] === 'Rot' && reds[1] === 'Rot') out.push(`<div class="note bad">${esc((PLAN.whoop_ampel.find(x => x.stufe === 'Muster') || {}).training || '')}</div>`);
  return out.join('');
}

/* ---------- Views ---------- */
function vHeute() {
  const d = todayISO(), s = scheduled(d), wh = S.whoop[d];
  const amp = PLAN.whoop_ampel.filter(x => ['Grün', 'Gelb', 'Rot', 'Krank/Fieber'].includes(x.stufe));
  const cls = { 'Grün': 'gr', 'Gelb': 'ge', 'Rot': 'ro', 'Krank/Fieber': 'kr' };
  const whTxt = wh ? (amp.find(x => x.stufe === wh) || {}).training : 'Wie ist deine WHOOP-Erholung heute?';
  let tr;
  if (s) {
    const u = getUnit(s.L), wo = getWo(d, s.L), w = weekOf(d);
    const total = u.uebungen.reduce((n, ex) => { const p = presc(ex, w); return n + (p ? adjSets(setCount(p.saetze, w), d) : 0); }, 0);
    const done = wo ? doneSets(wo) : 0;
    tr = `<h2>Training: Einheit ${s.L}${s.optional ? ' (optional)' : ''}</h2>
      ${s.optional ? `<div class="mut small">${esc(getUnit('D').bedingung || '')}</div>` : ''}
      <div class="row" style="margin:8px 0"><div class="grow">${bar(done, total, 'Sätze', '')}</div></div>
      <button class="btn pri full" data-a="startUnit" data-v="${s.L}">${done ? 'Weiter trainieren' : 'Training starten'}</button>`;
  } else tr = `<h2>Ruhetag</h2><div class="mut">Ziel: ${esc(PLAN.alltag.schritte_pro_tag)} Schritte, ${esc(PLAN.alltag.schlaf_ziel_h)} h Schlaf.</div><button class="btn full" style="margin-top:10px" data-a="go" data-v="training">Trotzdem Training öffnen</button>`;
  const f = food(d), t = targets(d), e = eaten(d), meals = dayMeals(d), sp = suppsFor(d).list.filter(x => x.group === 'Basis');
  const mealsDone = meals.filter((m, i) => f.meals[i]).length, suppDone = sp.filter(x => f.supp[x.key]).length;
  const items = [mealsDone / Math.max(1, meals.length), sp.length ? suppDone / sp.length : 1, Math.min(1, (f.water || 0) / 2.5)];
  if (s && !s.optional) { const wo = getWo(d, s.L); const u = getUnit(s.L); const w = weekOf(d); const total = u.uebungen.reduce((n, ex) => { const p = presc(ex, w); return n + (p ? adjSets(setCount(p.saetze, w), d) : 0); }, 0); items.push(wo ? Math.min(1, doneSets(wo) / total) : 0); }
  const pct = Math.round(items.reduce((a, b) => a + b, 0) / items.length * 100);
  return `${banners(d)}
  <div class="card"><div class="row"><div class="grow"><div class="mut small">Tagesfortschritt</div><div class="big">${pct} %</div></div><div class="mut small" style="text-align:right">${fmt(d, false)}<br>${isTrainingDay(d) ? 'Trainingstag' : 'Ruhetag'}</div></div><div class="bar"><i style="width:${pct}%"></i></div></div>
  <div class="card"><h2>WHOOP-Ampel</h2><div class="ampel">${amp.map(x => `<button class="${cls[x.stufe]} ${wh === x.stufe ? 'on' : ''}" data-a="whoop" data-v="${x.stufe}">${x.stufe === 'Krank/Fieber' ? 'Krank' : x.stufe}</button>`).join('')}</div><div class="note ${wh === 'Rot' || wh === 'Krank/Fieber' ? 'bad' : wh === 'Gelb' ? 'warn' : wh ? 'ok' : ''}">${esc(whTxt)}</div></div>
  <div class="card">${tr}</div>
  <div class="card"><h2>Ernährung</h2>${bar(e.kcal, t.kcal, 'Kalorien', 'kcal')}${bar(e.protein_g, t.protein_g, 'Eiweiß', 'g')}
   <div class="mut small">Mahlzeiten ${mealsDone}/${meals.length} · Supplements ${suppDone}/${sp.length} · Wasser ${de(f.water || 0)} l</div>
   ${sp.map(x => check(f.supp[x.key], esc(x.label), esc(x.sub), 'supp', `data-v="${x.key}"`)).join('')}
   <div class="row" style="margin-top:8px"><button class="btn grow" data-a="water" data-v="0.25">+ 0,25 l Wasser</button><button class="btn grow pri" data-a="go" data-v="essen">Ernährung öffnen</button></div>
   <div class="mut small" style="margin-top:8px">☕ ${esc(PLAN.koffein_regel)}</div></div>`;
}
function adjSets(n, date) { return S.whoop[date] === 'Rot' ? Math.max(1, n - 1) : n; }

function vTraining() {
  const d = UI.tdate || todayISO(), w = weekOf(d), sch = scheduled(d);
  const L = UI.unit || (sch ? sch.L : 'A'); UI.unit = L;
  const u = getUnit(L); const wo = getWo(d, L) || { ex: {} };
  const reg = PLAN.progressionsregeln.find(r => r.phase.startsWith(phaseKey(Math.max(1, w)).replace('-', '–'))) || PLAN.progressionsregeln[0];
  const wh = S.whoop[d];
  let h = `<div class="seg">${units().map(x => `<button class="${unitL(x) === L ? 'on' : ''}" data-a="unit" data-v="${unitL(x)}">${unitL(x)} · ${x.wochentag.slice(0, 2)}</button>`).join('')}</div>
  <div class="card"><div class="row"><div class="grow"><b>Einheit ${esc(u.einheit)}</b><div class="mut small">${weekLabel(d)}</div></div><input type="date" value="${d}" data-a="tdate" style="width:auto"></div>
  ${u.bedingung ? `<div class="note warn small">${esc(u.bedingung)}</div>` : ''}
  ${L === 'D' && (w < 3 || w === 8) ? `<div class="note bad small">Laut Plan in dieser Woche keine Einheit D.</div>` : ''}
  ${wh ? `<div class="note ${wh === 'Grün' ? 'ok' : wh === 'Gelb' ? 'warn' : 'bad'} small"><b>WHOOP ${esc(wh)}:</b> ${esc((PLAN.whoop_ampel.find(x => x.stufe === wh) || {}).training)}</div>` : ''}
  <details><summary>Progressionsregel ${esc(reg.phase)}</summary><div class="small">${esc(reg.regel)}<br><span class="mut">Sätze ${esc(reg.saetze)} · Wdh ${esc(reg.wiederholungen)} · RIR ${esc(reg.rir)} · Pause ${esc(reg.pause)} · Tempo ${esc(reg.tempo)}</span></div></details>
  <div class="mut small">Aufwärmen: ${PLAN.trainingstage.aufwaermen_min} min · Minimum-Regel: lieber 30 min als ausfallen lassen.</div></div>`;
  u.uebungen.forEach((ex, xi) => {
    const p = presc(ex, w);
    if (!p) { h += `<div class="ex"><div class="hd"><div class="grow"><div class="n mut">${esc(ex.name)}</div><div class="small mut">neu ab Woche ${ex.ab_woche}</div></div></div></div>`; return; }
    const n0 = setCount(p.saetze, w), n = adjSets(n0, d), sets = wo.ex[ex.name] || [], last = lastSets(ex.name, d), sw = S.startw[ex.name] || {};
    const rr = repRange(p.wiederholungen);
    let sugg = '';
    if (last && rr && w >= 3 && w !== 8 && last.sets.length && last.sets.every(s => (num(s.reps) || 0) >= rr.hi)) sugg = `<div class="note ok small">Letztes Mal überall ${rr.hi}+ Wdh → heute kleinste Stufe mehr (Double Progression).</div>`;
    const doneN = sets.filter(s => s && s.done).length;
    h += `<div class="ex" id="ex${xi}"><div class="hd"><div class="grow"><div class="n">${xi + 1}. ${esc(ex.name)}</div>
      <div class="small"><span class="chip g">${n}${n !== n0 ? ' (Rot −1)' : ''} × ${esc(p.wiederholungen)}</span>${p.rir ? `<span class="chip">RIR ${esc(p.rir)}</span>` : ''}<span class="chip">Pause ${esc(ex.pause_text)}</span>${p.hinweis ? `<span class="chip">${esc(p.hinweis)}</span>` : ''}</div>
      <div class="small mut">${last ? `Letztes Mal (${fmt(last.date)}): ${last.sets.map(s => `${de(num(s.kg))} kg × ${esc(s.reps || '–')}`).join(' · ')}` : 'Noch keine Werte'}</div></div><div class="mut small">${doneN}/${n}</div></div>
      <div class="bd">${sugg}
      ${w <= 2 || !last ? `<div class="grid2"><div><label class="f">Startgewicht / Stufe</label><input type="text" inputmode="decimal" placeholder="z. B. 40 kg / Stufe 5" value="${esc(sw.kg || '')}" data-a="sw" data-ex="${esc(ex.name)}" data-k="kg"></div><div><label class="f">Maschineneinstellung</label><input type="text" placeholder="Sitz 4, Lehne 2" value="${esc(sw.set || '')}" data-a="sw" data-ex="${esc(ex.name)}" data-k="set"></div></div><div class="mut small" style="margin-top:4px">Startgewicht: 12 saubere Wdh. mit 3–4 RIR (in W1 selbst finden, im Zweifel leichter).</div>`
        : (sw.kg || sw.set) ? `<div class="mut small">Start: ${esc(sw.kg || '–')} · Einstellung: ${esc(sw.set || '–')}</div>` : ''}
      <div class="lbls" style="margin-top:8px"><span>Satz</span><span>kg</span><span>Wdh</span><span></span></div>
      ${Array.from({ length: Math.max(n, sets.length) }, (_, i) => { const s = sets[i] || {}; const ls = last && last.sets[i] ? last.sets[i] : (last ? last.sets[last.sets.length - 1] : null); return `<div class="set ${s.done ? 'done' : ''} ${i >= n ? 'skip' : ''}"><div class="no">${i + 1}</div>
        <input inputmode="decimal" placeholder="${ls ? esc(ls.kg ?? '') : (sw.kg && num(sw.kg) != null ? num(sw.kg) : 'kg')}" value="${esc(s.kg ?? '')}" data-a="kg" data-ex="${esc(ex.name)}" data-i="${i}">
        <input inputmode="numeric" placeholder="${esc(ls ? ls.reps : (rr ? rr.lo + '–' + rr.hi : 'Wdh'))}" value="${esc(s.reps ?? '')}" data-a="reps" data-ex="${esc(ex.name)}" data-i="${i}">
        <button class="ok" data-a="set" data-ex="${esc(ex.name)}" data-i="${i}" data-p="${ex.pause_sek ? ex.pause_sek[0] : 90}" data-pt="${esc(ex.pause_text)}">${s.done ? '✓' : ''}</button></div>`; }).join('')}
      <div class="row"><button class="btn sm" data-a="addset" data-ex="${esc(ex.name)}">+ Satz</button></div>
      <details><summary>So geht's · Video · Alternative</summary>${exInfoHTML(ex)}</details></div></div>`;
  });
  h += `<div class="card"><label class="f">Notiz zur Einheit</label><textarea rows="2" data-a="wonote" placeholder="z. B. Schulter gezogen, Studio voll …">${esc(wo.note || '')}</textarea></div>
  <div class="card mut small">${esc(PLAN.meta.hinweis)}</div>`;
  return h;
}

function vEssen() {
  const d = todayISO(), seg = UI.essenSeg;
  let h = `<div class="seg">${[['heute', 'Heute'], ['foto', 'Mahlzeit-Foto'], ['einkauf', 'Einkauf'], ['info', 'Infos']].map(([k, l]) => `<button class="${seg === k ? 'on' : ''}" data-a="eseg" data-v="${k}">${l}</button>`).join('')}</div>`;
  const ex = `<div class="note bad small"><b>Nie:</b> ${PLAN.ausschluesse.map(a => esc(a.gruppe)).join(' · ')}</div>`;
  if (seg === 'heute') {
    const f = food(d), t = targets(d), e = eaten(d), meals = dayMeals(d), sp = suppsFor(d), td = isTrainingDay(d);
    h += `<div class="card"><div class="row"><h2 class="grow" style="margin:0">${fmt(d)}</h2></div>
     <div class="seg" style="margin:10px 0"><button class="${td ? 'on' : ''}" data-a="daytype" data-v="Trainingstag">Trainingstag</button><button class="${!td ? 'on' : ''}" data-a="daytype" data-v="Ruhetag">Ruhetag</button></div>
     ${bar(e.kcal, t.kcal, 'Kalorien', 'kcal')}${bar(e.protein_g, t.protein_g, 'Eiweiß', 'g')}${bar(e.kh_g, t.kh_g, 'Kohlenhydrate', 'g')}${bar(e.fett_g, t.fett_g, 'Fett', 'g')}
     <div class="mut small">Ballaststoffe: ${esc(t.ballaststoffe_g_min)} g · ${esc(PLAN.makroziele.hinweis)}</div>${ex}</div>
     <div class="card"><h2>Mahlzeiten (Beispieltag ${WD[pd(d).getDay()]})</h2><div class="mut small">Keine festen Uhrzeiten. ${esc(PLAN.mahlzeiten.hinweis.replace(/^.*?Timing:/, 'Timing:'))}</div>
     ${meals.map((m, i) => check(f.meals[i], `<b>${esc(m.mahlzeit)}</b> · ${esc(m.gericht)}`, `${m.makros.kcal} kcal · ${m.makros.protein_g} g E · ${m.makros.kh_g} g KH · ${m.makros.fett_g} g F${m.timing ? ' · ⏱ ' + esc(m.timing) : ''}`, 'meal', `data-v="${i}"`) + `<details style="margin:-4px 0 4px 46px"><summary class="small">Zutaten</summary><div class="small mut">${m.zutaten.map(z => `${esc(z.lebensmittel)} ${z.menge_g} g`).join(' · ')}</div></details>`).join('')}
     ${(f.extra || []).length ? `<h3>Zusätzlich / Foto-Schätzung</h3>${f.extra.map((x, i) => `<div class="row check" style="cursor:default">${x.photo ? `<img data-pid="${x.photo}" style="width:48px;height:48px;object-fit:cover;border-radius:8px">` : ''}<div class="lbl">${esc(x.name || 'Mahlzeit')}<small>${de(num(x.kcal), 0)} kcal · ${de(num(x.protein_g), 0)} g E · ${de(num(x.kh_g), 0)} g KH · ${de(num(x.fett_g), 0)} g F</small></div><button class="btn sm danger" data-a="delextra" data-v="${i}">✕</button></div>`).join('')}` : ''}
     <button class="btn full" style="margin-top:8px" data-a="eseg" data-v="foto">+ Mahlzeit per Foto / manuell</button></div>
     <div class="card"><h2>Supplements</h2>${sp.notes.map(n => `<div class="note small">${esc(n)}</div>`).join('')}
     ${['Basis', 'Bei Bedarf', 'Optional'].map(g => { const l = sp.list.filter(x => x.group === g); return l.length ? `<h3>${g}</h3>` + l.map(x => check(f.supp[x.key], esc(x.label), esc(x.sub), 'supp', `data-v="${x.key}"`)).join('') : ''; }).join('')}
     <div class="mut small" style="margin-top:6px">☕ ${esc(PLAN.koffein_regel)}</div></div>
     <div class="card"><h2>Wasser</h2><div class="row"><button class="btn" data-a="water" data-v="-0.25">−</button><div class="grow" style="text-align:center"><div class="big">${de(f.water || 0, 2)} l</div><div class="mut small">Ziel 2,5–3 l (Wasser oder ungesüßter Tee)</div></div><button class="btn pri" data-a="water" data-v="0.25">+ 0,25</button></div><div class="bar" style="margin-top:8px"><i style="width:${Math.min(100, (f.water || 0) / 3 * 100)}%"></i></div></div>`;
  } else if (seg === 'foto') {
    const f = food(d);
    h += `<div class="card"><h2>Mahlzeit-Foto</h2>
      <div class="row"><button class="btn pri grow" data-a="mealcam">📷 Foto aufnehmen</button><button class="btn grow" data-a="meallib">Aus Fotos wählen</button></div>
      <div class="note"><b>Auswertung:</b> Foto an <b>Manfred im Grok-Bot-Chat</b> schicken (Button „Teilen“ unten oder im Chat anhängen). Manfred schätzt kcal, Eiweiß, KH und Fett – das sind Schätzwerte. Die Werte trägst du dann hier ein.</div>
      <div id="mealprev">${UI.mealPhoto ? `<img data-pid="${UI.mealPhoto}" style="width:100%;border-radius:12px;margin-top:6px"><button class="btn full blue" style="margin-top:6px" data-a="share" data-v="${UI.mealPhoto}">Teilen …</button>` : ''}</div>
      <label class="f">Bezeichnung</label><input type="text" id="mx_name" placeholder="z. B. Hähnchen-Reis-Bowl">
      <div class="grid4"><div><label class="f">kcal</label><input type="number" inputmode="decimal" id="mx_kcal"></div><div><label class="f">Eiweiß g</label><input type="number" inputmode="decimal" id="mx_p"></div><div><label class="f">KH g</label><input type="number" inputmode="decimal" id="mx_kh"></div><div><label class="f">Fett g</label><input type="number" inputmode="decimal" id="mx_f"></div></div>
      <button class="btn pri full" style="margin-top:10px" data-a="addextra">Zum Tag hinzufügen</button>
      <div class="mut small" style="margin-top:6px">Wird mit dem Tagesziel (${isTrainingDay(d) ? 'Trainingstag' : 'Ruhetag'}) verrechnet.</div></div>
      ${(f.extra || []).length ? `<div class="card"><h3>Heute eingetragen</h3>${f.extra.map(x => `<div class="small">${esc(x.name || 'Mahlzeit')}: ${de(num(x.kcal), 0)} kcal · ${de(num(x.protein_g), 0)} g E</div>`).join('')}</div>` : ''}${ex}`;
  } else if (seg === 'einkauf') {
    const groups = [...new Set(PLAN.einkaufsliste_7_tage.map(x => x.gruppe))];
    h += `<div class="card"><div class="row"><h2 class="grow" style="margin:0">Einkaufsliste 7 Tage</h2><button class="btn sm" data-a="shopreset">Zurücksetzen</button></div>${ex}
    ${groups.map(g => `<h3>${esc(g)}</h3>` + PLAN.einkaufsliste_7_tage.map((x, i) => x.gruppe === g ? check(S.shop[i], `${esc(x.lebensmittel)} · <b>${esc(x.menge_7_tage)}</b>`, esc(x.hinweis || ''), 'shop', `data-v="${i}"`) : '').join('')).join('')}</div>`;
  } else {
    const mz = PLAN.makroziele;
    h += `<div class="card"><h2>Makroziele</h2><table class="t"><tr><th></th><th>kcal</th><th>Eiweiß</th><th>KH</th><th>Fett</th></tr>${['Trainingstag', 'Ruhetag'].map(k => `<tr><td>${k}</td><td>${mz[k].kcal}</td><td>${mz[k].protein_g} g</td><td>${mz[k].kh_g} g</td><td>${mz[k].fett_g} g</td></tr>`).join('')}</table>
    <div class="small mut" style="margin-top:6px">${esc(mz.hinweis)}<br><b>Anpassung:</b> ${esc(mz.anpassung)}<br>Zunahme-Ziel: ${esc(mz.zunahme_ziel_kg_pro_monat)} kg/Monat</div></div>
    ${PLAN.akne_hinweise && PLAN.akne_hinweise.length ? `<div class="card"><h2>Haut / Akne</h2><ul class="small">${PLAN.akne_hinweise.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    <div class="card"><h2>Ausschlüsse</h2>${PLAN.ausschluesse.map(a => `<div class="note bad small"><b>${esc(a.gruppe)}</b>${a.umfasst ? ': ' + a.umfasst.map(esc).join(', ') : ''}${a.hinweis ? '<br>' + esc(a.hinweis) : ''}</div>`).join('')}</div>
    <div class="card"><h2>Supplements laut Plan</h2>${PLAN.supplements.map(s => `<details><summary>${esc(s.name)} <span class="chip">${esc(s.status)}</span></summary><div class="small">${s.phasen ? s.phasen.map(p => `${esc(p.zeitraum)}: <b>${esc(p.dosis)}</b> – ${esc(p.zeitpunkt)}`).join('<br>') : `<b>${esc(s.dosis)}</b> – ${esc(s.zeitpunkt || '')}`}${['zeitraum', 'bedingung', 'danach', 'optional', 'grenze'].filter(k => s[k]).map(k => `<br>${k[0].toUpperCase() + k.slice(1)}: ${esc(s[k])}`).join('')}${s.hinweise ? `<ul>${s.hinweise.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div></details>`).join('')}
    <h3>Nicht nehmen</h3><div class="small">${PLAN.supplements_nicht.map(esc).join(' · ')}</div></div>`;
  }
  return h;
}

function vKoerper() {
  const seg = UI.koerperSeg, d = todayISO();
  let h = `<div class="seg">${[['gewicht', 'Gewicht'], ['fotos', 'Fotos'], ['fortschritt', 'Fortschritt']].map(([k, l]) => `<button class="${seg === k ? 'on' : ''}" data-a="kseg" data-v="${k}">${l}</button>`).join('')}</div>`;
  if (seg === 'gewicht') {
    const list = S.body.slice().sort((a, b) => b.date.localeCompare(a.date));
    h += `<div class="card"><h2>Wöchentlich wiegen</h2><div class="mut small">Morgens, nüchtern, nach dem WC. Startwert laut Plan: ${PLAN.meta.koerper.gewicht_kg} kg.</div>
      <div class="grid2"><div><label class="f">Datum</label><input type="date" id="b_date" value="${d}"></div><div><label class="f">Gewicht kg</label><input type="number" inputmode="decimal" step="0.1" id="b_kg"></div></div>
      <label class="f">Taille / Bauchumfang cm (optional)</label><input type="number" inputmode="decimal" step="0.5" id="b_waist">
      <button class="btn pri full" style="margin-top:10px" data-a="addbody">Speichern</button></div>
      <div class="card"><h2>Verlauf</h2>${list.length ? `<table class="t"><tr><th>Datum</th><th>kg</th><th>Taille</th><th></th></tr>${list.map(b => `<tr><td>${fmt(b.date)} ${fmt(b.date, false).slice(-4)}</td><td>${de(b.kg)}</td><td>${b.waist ? de(b.waist) : '–'}</td><td><button class="btn sm danger" data-a="delbody" data-v="${b.date}">✕</button></td></tr>`).join('')}</table>` : '<div class="mut">Noch keine Einträge.</div>'}</div>`;
  } else if (seg === 'fotos') {
    const ph = S.photosMeta.filter(p => p.kind === 'body').sort((a, b) => a.date.localeCompare(b.date));
    const a = UI.cmpA || (ph[0] && ph[0].id), b = UI.cmpB || (ph[ph.length - 1] && ph[ph.length - 1].id);
    h += `<div class="card"><h2>Fortschrittsfotos</h2><div class="mut small">Laut Plan in W1, W5, W9 und am 28.02. Gleiches Licht, gleiche Pose. Fotos bleiben nur auf diesem Handy.</div>
      <button class="btn pri full" style="margin-top:8px" data-a="bodyphoto">📷 Foto hinzufügen</button></div>
      ${ph.length >= 1 ? `<div class="card"><h2>Vorher – Nachher</h2><div class="grid2"><select data-a="cmp" data-v="A">${ph.map(p => `<option value="${p.id}" ${p.id === a ? 'selected' : ''}>${fmt(p.date)} ${fmt(p.date, false).slice(-4)}</option>`).join('')}</select><select data-a="cmp" data-v="B">${ph.map(p => `<option value="${p.id}" ${p.id === b ? 'selected' : ''}>${fmt(p.date)} ${fmt(p.date, false).slice(-4)}</option>`).join('')}</select></div>
      <div class="cmp" style="margin-top:8px"><img data-pid="${a}"><img data-pid="${b}"></div></div>
      <div class="card"><h2>Alle Fotos</h2><div class="thumbs">${ph.map(p => `<div><img data-pid="${p.id}"><div class="row small mut"><span class="grow">${fmt(p.date)}</span><button class="btn sm" data-a="share" data-v="${p.id}">↗</button><button class="btn sm danger" data-a="delphoto" data-v="${p.id}">✕</button></div></div>`).join('')}</div>
      <div class="mut small" style="margin-top:6px">Zum Auswerten: Foto mit ↗ an Manfred im Grok-Bot-Chat teilen.</div></div>` : ''}`;
  } else {
    const names = [...new Set(units().flatMap(u => u.uebungen.map(e => e.name)))];
    const ex = UI.progEx || names[0];
    const wts = S.body.slice().sort((a, b) => a.date.localeCompare(b.date)).map(b => ({ x: b.date, y: num(b.kg) })).filter(p => p.y);
    const wos = Object.values(S.workouts).filter(w => w.ex[ex] && w.ex[ex].some(s => s.done)).sort((a, b) => a.date.localeCompare(b.date));
    const top = wos.map(w => { const ss = w.ex[ex].filter(s => s.done && num(s.kg) != null); if (!ss.length) return null; const best = ss.reduce((m, s) => (e1rm(num(s.kg), num(s.reps)) || 0) > (e1rm(num(m.kg), num(m.reps)) || 0) ? s : m, ss[0]); return { x: w.date, y: num(best.kg), y2: e1rm(num(best.kg), num(best.reps)) }; }).filter(Boolean);
    const per = []; for (let i = 0; i < 12; i++) { const a = addDays(startDate(), i * 7), b = addDays(a, 6); per.push({ l: 'W' + (i + 1), v: new Set(Object.values(S.workouts).filter(w => w.date >= a && w.date <= b && doneSets(w) > 0).map(w => w.date)).size }); }
    h += `<div class="card"><h2>Gewicht</h2>${lineChart(wts, 'kg')}</div>
     <div class="card"><h2>Kraft pro Übung</h2><select data-a="progex">${names.map(n => `<option ${n === ex ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select>
     <div class="mut small" style="margin:6px 0">Linie: schwerster Satz (kg) · gestrichelt: geschätztes 1RM (Epley)</div>${lineChart(top, 'kg', true)}</div>
     <div class="card"><h2>Trainings pro Woche</h2>${barChart(per, 4)}<div class="mut small">Ziel W1–4: 3 Termine pro Woche (12 von 12).</div></div>`;
  }
  return h;
}
function lineChart(pts, unit, dual) {
  if (!pts.length) return '<div class="mut">Noch keine Daten – trag ein paar Werte ein.</div>';
  const W = 340, H = 170, P = 30; const ys = pts.flatMap(p => [p.y, dual ? p.y2 : null]).filter(v => v != null);
  let lo = Math.min(...ys), hi = Math.max(...ys); if (hi - lo < 1) { hi += 1; lo -= 1; }
  const n = pts.length, X = i => P + (n === 1 ? (W - P - 10) / 2 : i * (W - P - 10) / (n - 1)), Y = v => H - 22 - (v - lo) / (hi - lo) * (H - 40);
  const path = k => pts.map((p, i) => p[k] == null ? '' : `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p[k]).toFixed(1)}`).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}"><g fill="#9aa3b2" font-size="10"><text x="0" y="${Y(hi) + 4}">${de(hi)}</text><text x="0" y="${Y(lo) + 4}">${de(lo)}</text><text x="${P}" y="${H - 4}">${fmt(pts[0].x)}</text><text x="${W - 10}" y="${H - 4}" text-anchor="end">${fmt(pts[n - 1].x)}</text></g>
  <line x1="${P}" x2="${W - 10}" y1="${Y(lo)}" y2="${Y(lo)}" stroke="#2a2f3a"/><line x1="${P}" x2="${W - 10}" y1="${Y(hi)}" y2="${Y(hi)}" stroke="#2a2f3a"/>
  ${dual ? `<path d="${path('y2')}" fill="none" stroke="#3b82f6" stroke-width="2" stroke-dasharray="5 4"/>` : ''}<path d="${path('y')}" fill="none" stroke="#4fd1a5" stroke-width="3"/>${pts.map((p, i) => `<circle cx="${X(i)}" cy="${Y(p.y)}" r="3.5" fill="#4fd1a5"/>`).join('')}
  <text x="${W - 10}" y="12" fill="#e9ecf1" font-size="12" text-anchor="end">zuletzt ${de(pts[n - 1].y)} ${unit}</text></svg>`;
}
function barChart(items, max) {
  const W = 340, H = 140, bw = (W - 20) / items.length; max = Math.max(max, ...items.map(i => i.v));
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${items.map((it, i) => { const h = it.v / max * (H - 40); return `<rect x="${10 + i * bw + 3}" y="${H - 22 - h}" width="${bw - 6}" height="${h}" rx="4" fill="${it.v >= 3 ? '#4fd1a5' : '#3b82f6'}"/><text x="${10 + i * bw + bw / 2}" y="${H - 8}" fill="#9aa3b2" font-size="10" text-anchor="middle">${it.l}</text>${it.v ? `<text x="${10 + i * bw + bw / 2}" y="${H - 26 - h}" fill="#e9ecf1" font-size="11" text-anchor="middle">${it.v}</text>` : ''}`; }).join('')}</svg>`;
}

function vMehr() {
  const seg = UI.mehrSeg, d = todayISO(), w = weekOf(d);
  let h = `<div class="seg">${[['plan', 'Plan'], ['uebungen', 'Übungen'], ['daten', 'Backup']].map(([k, l]) => `<button class="${seg === k ? 'on' : ''}" data-a="mseg" data-v="${k}">${l}</button>`).join('')}</div>`;
  if (seg === 'plan') {
    const end = addDays(startDate(), 83);
    h += `<div class="card"><h2>${esc(PLAN.meta.plan)}</h2><div class="mut small">${esc(PLAN.meta.person)} · Ziele: ${PLAN.meta.ziele.map(esc).join(', ')}</div>
      <label class="f">Startdatum (Montag der Woche 1)</label><input type="date" value="${startDate()}" data-a="start">
      <div class="mut small" style="margin-top:4px">Ende nach 12 Wochen: ${fmt(end, false)} · Plan-Update-Banner ab ${fmt(addDays(end, 1), false)}. Heute: ${weekLabel(d)}</div></div>
      <div class="card"><h2>Wochen</h2><table class="t">${(PLAN.meta.wochen || []).map(x => `<tr style="${x.woche === w ? 'background:#1d2b25' : ''}"><td><b>W${x.woche}</b></td><td class="small">${esc(x.phase)}<br><span class="mut">${esc(x.hinweis)}</span></td></tr>`).join('')}</table></div>
      <div class="card"><h2>Trainingstage</h2>${PLAN.trainingstage.regel.map(r => `<div class="small">${esc(r.wochentag)}: <b>${esc(r.einheit)}</b></div>`).join('')}<ul class="small">${PLAN.trainingstage.regeln.map(r => `<li>${esc(r)}</li>`).join('')}</ul></div>
      <div class="card"><h2>WHOOP-Ampel</h2>${PLAN.whoop_ampel.map(x => `<div class="small" style="margin:6px 0"><b>${esc(x.stufe)}</b>${x.erholung_prozent ? ' (' + esc(x.erholung_prozent) + ' %)' : ''}: ${esc(x.training)}</div>`).join('')}</div>
      <div class="card"><h2>Alltag</h2><div class="small">Schritte: ${esc(PLAN.alltag.schritte_pro_tag)} · Schlaf: ${esc(PLAN.alltag.schlaf_ziel_h)} h · Einschlafen: ${esc(PLAN.alltag.einschlafen_ziel)} · Aufstehen: ${esc(PLAN.alltag.aufstehen)}</div></div>
      <div class="card"><h2>Plan-Update</h2><div class="small">Nach 12 Wochen erstellen Manfred und Gio einen neuen Plan (Training + Makros). Den bekommst du als JSON-Datei – hier importieren. <b>Deine Trainings-, Ernährungs- und Körperdaten bleiben erhalten.</b></div>
      <div class="mut small" style="margin-top:6px">Aktiv: ${S.customPlan ? 'importierter Plan' : 'Standardplan (Gio, 15.11.2026)'}</div>
      <div class="row wrap" style="margin-top:8px"><button class="btn pri grow" data-a="planimport">Neuen Plan importieren</button>${S.customPlan ? '<button class="btn grow" data-a="planreset">Standardplan</button>' : ''}</div></div>
      <div class="card mut small">${esc(PLAN.meta.hinweis)}</div>`;
  } else if (seg === 'uebungen') {
    units().forEach(u => { h += `<div class="card"><h2>Einheit ${esc(u.einheit)} · ${esc(u.wochentag)}</h2>${u.uebungen.map(ex => `<details><summary>${esc(ex.name)}</summary>${exInfoHTML(ex)}</details>`).join('')}</div>`; });
  } else {
    h += `<div class="card"><h2>Backup</h2><div class="small">Alle Daten liegen nur auf diesem Gerät. Exportiere regelmäßig ein Backup (z. B. in iCloud Drive / Dateien sichern).</div>
      <button class="btn pri full" style="margin-top:10px" data-a="export" data-v="1">Backup exportieren (mit Fotos)</button>
      <button class="btn full" style="margin-top:8px" data-a="export" data-v="0">Backup ohne Fotos (klein)</button>
      <button class="btn full" style="margin-top:8px" data-a="import">Backup importieren …</button>
      <div class="mut small" style="margin-top:8px">Import ersetzt alle Daten auf diesem Gerät.</div></div>
      <div class="card"><h2>Zum Home-Bildschirm</h2><div class="small">iPhone: In Safari öffnen → Teilen-Symbol → „Zum Home-Bildschirm“. Danach funktioniert die App auch offline.</div></div>
      <div class="card"><h2>Speicher</h2><div class="small mut">${Object.keys(S.workouts).length} Trainings · ${S.body.length} Gewichtseinträge · ${S.photosMeta.length} Fotos</div><button class="btn danger full" style="margin-top:8px" data-a="wipe">Alle Daten löschen</button></div>`;
  }
  return h;
}

/* ---------- Render ---------- */
function render(keepScroll) {
  const y = window.scrollY;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === UI.tab));
  $('#sub').textContent = weekLabel(todayISO());
  $('#view').innerHTML = ({ heute: vHeute, training: vTraining, essen: vEssen, koerper: vKoerper, mehr: vMehr })[UI.tab]();
  hydrateImgs();
  window.scrollTo(0, keepScroll ? y : 0);
}
function go(tab) { UI.tab = tab; if (location.hash.slice(1) !== tab) history.replaceState(null, '', '#' + tab); render(); }
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (PLAN && ['heute', 'training', 'essen', 'koerper', 'mehr'].includes(h) && h !== UI.tab) { UI.tab = h; render(); } });

/* ---------- Aktionen ---------- */
document.addEventListener('click', async ev => {
  const tb = ev.target.closest('#tabs button'); if (tb) { if (tb.dataset.tab === 'training') { UI.tdate = null; UI.unit = null; } go(tb.dataset.tab); return; }
  const el = ev.target.closest('[data-a]'); if (!el || el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return;
  const a = el.dataset.a, v = el.dataset.v, d = todayISO();
  if (el.tagName === 'A') ev.preventDefault();
  switch (a) {
    case 'go': go(v); break;
    case 'whoop': S.whoop[d] = S.whoop[d] === v ? undefined : v; save(); render(true); break;
    case 'startUnit': UI.unit = v; UI.tdate = d; go('training'); break;
    case 'unit': UI.unit = v; render(); break;
    case 'set': {
      const wo = getWo(UI.tdate || d, UI.unit, true), arr = wo.ex[el.dataset.ex] = wo.ex[el.dataset.ex] || [], i = +el.dataset.i;
      const s = arr[i] = arr[i] || {}; s.done = !s.done;
      if (s.done) { const row = el.closest('.set'); const [ik, ir] = row.querySelectorAll('input'); if (s.kg == null || s.kg === '') s.kg = ik.value || (num(ik.placeholder) != null ? ik.placeholder : ''); if (s.reps == null || s.reps === '') s.reps = ir.value || (/^\d+$/.test(ir.placeholder) ? ir.placeholder : ''); startTimer(+el.dataset.p, el.dataset.pt); }
      save(); render(true); break;
    }
    case 'addset': { const wo = getWo(UI.tdate || d, UI.unit, true); const arr = wo.ex[el.dataset.ex] = wo.ex[el.dataset.ex] || []; const ex = getUnit(UI.unit).uebungen.find(e => e.name === el.dataset.ex); const p = presc(ex, weekOf(UI.tdate || d)); const n = Math.max(adjSets(setCount(p.saetze, weekOf(UI.tdate || d)), UI.tdate || d), arr.length); arr[n] = {}; for (let i = 0; i < n; i++) arr[i] = arr[i] || {}; save(); render(true); break; }
    case 'tmr': if (v === 'x') T = null; else if (T) T.end += (+v) * 1000; tick(); break;
    case 'supp': { const f = food(d); f.supp[v] = !f.supp[v]; save(); render(true); break; }
    case 'meal': { const f = food(d); f.meals[v] = !f.meals[v]; save(); render(true); break; }
    case 'water': { const f = food(d); f.water = Math.max(0, Math.round(((f.water || 0) + +v) * 100) / 100); save(); render(true); break; }
    case 'daytype': food(d).typ = v; save(); render(true); break;
    case 'eseg': UI.essenSeg = v; render(); break;
    case 'kseg': UI.koerperSeg = v; render(); break;
    case 'mseg': UI.mehrSeg = v; render(); break;
    case 'shop': S.shop[v] = !S.shop[v]; save(); render(true); break;
    case 'shopreset': S.shop = {}; save(); render(true); break;
    case 'delextra': if (confirm('Eintrag löschen?')) { food(d).extra.splice(+v, 1); save(); render(true); } break;
    case 'mealcam': $('#fileMeal').click(); break;
    case 'meallib': $('#fileMealLib').click(); break;
    case 'bodyphoto': $('#fileBody').click(); break;
    case 'addextra': {
      const g = id => $('#' + id).value; const x = { name: g('mx_name'), kcal: num(g('mx_kcal')), protein_g: num(g('mx_p')), kh_g: num(g('mx_kh')), fett_g: num(g('mx_f')), photo: UI.mealPhoto || null };
      if (x.kcal == null && x.protein_g == null) { alert('Bitte mindestens kcal oder Eiweiß eintragen.'); return; }
      food(d).extra.push(x); UI.mealPhoto = null; save(); UI.essenSeg = 'heute'; render(); break;
    }
    case 'share': { const p = await getPhoto(v); if (!p) return; const file = new File([p.blob], 'mahlzeit-' + p.date + '.jpg', { type: 'image/jpeg' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], text: 'Für Manfred: bitte Makros schätzen (kcal, Eiweiß, KH, Fett).' }); } catch (e) { } }
      else alert('Teilen wird hier nicht unterstützt. Bitte das Foto direkt im Grok-Bot-Chat an Manfred anhängen.'); break; }
    case 'addbody': { const date = $('#b_date').value, kg = num($('#b_kg').value), waist = num($('#b_waist').value); if (!date || kg == null) { alert('Bitte Datum und Gewicht eintragen.'); return; } S.body = S.body.filter(b => b.date !== date); S.body.push({ date, kg, waist }); save(); render(true); break; }
    case 'delbody': if (confirm('Eintrag löschen?')) { S.body = S.body.filter(b => b.date !== v); save(); render(true); } break;
    case 'delphoto': if (confirm('Foto löschen?')) { await delPhoto(v); S.photosMeta = S.photosMeta.filter(p => p.id !== v); save(); render(true); } break;
    case 'planimport': $('#filePlan').click(); break;
    case 'planreset': if (confirm('Zurück zum Standardplan? Deine Daten bleiben erhalten.')) { S.customPlan = null; PLAN = BASEPLAN; save(); render(); } break;
    case 'export': exportData(v === '1'); break;
    case 'import': $('#fileImport').click(); break;
    case 'wipe': if (confirm('Wirklich ALLE Daten löschen? Vorher Backup exportieren!') && confirm('Sicher?')) { localStorage.removeItem(KEY); (await allPhotos()).forEach(p => delPhoto(p.id)); S = load(); render(); } break;
  }
});
document.addEventListener('input', ev => {
  const el = ev.target, a = el.dataset.a; if (!a) return; const d = UI.tdate || todayISO();
  if (a === 'kg' || a === 'reps') { const wo = getWo(d, UI.unit, true); const arr = wo.ex[el.dataset.ex] = wo.ex[el.dataset.ex] || []; const s = arr[+el.dataset.i] = arr[+el.dataset.i] || {}; s[a] = el.value; for (let i = 0; i < arr.length; i++) arr[i] = arr[i] || {}; save(); }
  if (a === 'sw') { const o = S.startw[el.dataset.ex] = S.startw[el.dataset.ex] || {}; o[el.dataset.k] = el.value; save(); }
  if (a === 'wonote') { getWo(d, UI.unit, true).note = el.value; save(); }
});
document.addEventListener('change', ev => {
  const el = ev.target, a = el.dataset.a;
  if (a === 'tdate' && el.value) { UI.tdate = el.value; render(); }
  if (a === 'start' && el.value) { S.settings.start = el.value; save(); render(true); }
  if (a === 'progex') { UI.progEx = el.value; render(true); }
  if (a === 'cmp') { UI['cmp' + el.dataset.v] = el.value; render(true); }
});
async function addPhoto(file, kind) {
  const blob = await resize(file); const id = kind + '_' + Date.now(); const date = todayISO();
  await putPhoto({ id, date, kind, blob }); S.photosMeta.push({ id, date, kind }); save(); return id;
}
$('#fileMeal').onchange = $('#fileMealLib').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; UI.mealPhoto = await addPhoto(f, 'meal'); render(true); };
$('#fileBody').onchange = async e => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; await addPhoto(f, 'body'); UI.cmpB = null; render(true); };
$('#filePlan').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const p = JSON.parse(await f.text()); const miss = ['meta', 'einheiten', 'trainingstage', 'makroziele', 'mahlzeiten', 'supplements', 'whoop_ampel', 'progressionsregeln', 'einkaufsliste_7_tage', 'ausschluesse'].filter(k => !(k in p));
    if (miss.length) { alert('Kein gültiger Plan. Es fehlt: ' + miss.join(', ')); return; }
    S.customPlan = p; PLAN = p;
    if (p.meta.start && p.meta.start !== startDate() && confirm('Neues Startdatum aus dem Plan übernehmen: ' + fmt(p.meta.start, false) + '?')) S.settings.start = p.meta.start;
    save(); alert('Neuer Plan aktiv. Deine bisherigen Daten sind erhalten.'); render();
  } catch (err) { alert('Datei konnte nicht gelesen werden: ' + err.message); }
};
async function exportData(withPhotos) {
  const out = { app: 'growth-training', version: 1, exportiert: new Date().toISOString(), state: S, photos: [] };
  if (withPhotos) for (const p of await allPhotos()) out.photos.push({ id: p.id, date: p.date, kind: p.kind, dataUrl: await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(p.blob); }) });
  const blob = new Blob([JSON.stringify(out)], { type: 'application/json' }); const name = `growth-backup-${todayISO()}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file] }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove();
}
$('#fileImport').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try { const o = JSON.parse(await f.text()); if (o.app !== 'growth-training' || !o.state) throw new Error('Kein Growth-Backup');
    if (!confirm('Backup vom ' + (o.exportiert || '?').slice(0, 10) + ' importieren? Aktuelle Daten werden ersetzt.')) return;
    S = Object.assign(load(), o.state); if (S.customPlan) PLAN = S.customPlan; else PLAN = BASEPLAN;
    if (o.photos && o.photos.length) { for (const p of await allPhotos()) await delPhoto(p.id); for (const p of o.photos) { const b = await (await fetch(p.dataUrl)).blob(); await putPhoto({ id: p.id, date: p.date, kind: p.kind, blob: b }); } }
    save(); alert('Backup importiert.'); render();
  } catch (err) { alert('Import fehlgeschlagen: ' + err.message); }
};

/* ---------- Start ---------- */
(async function init() {
  try { BASEPLAN = await (await fetch('plan.json', { cache: 'no-cache' })).json(); } catch (e) { BASEPLAN = null; }
  PLAN = S.customPlan || BASEPLAN;
  if (!PLAN) { $('#view').innerHTML = '<div class="card">Plan konnte nicht geladen werden. Bitte einmal mit Internet öffnen.</div>'; return; }
  const h = location.hash.slice(1); if (['heute', 'training', 'essen', 'koerper', 'mehr'].includes(h)) UI.tab = h;
  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => { });
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
})();
