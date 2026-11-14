/* Bierwart · Datensatz-Abgleich (ohne Netzwerk, testbar mit Node).
 * Jeder Eintrag trägt einen Änderungszeitpunkt u (ms). Gelöschte Einträge werden als
 * "Grabstein" mit Zeitpunkt gemerkt. Beim Zusammenführen gewinnt je Eintrag die jüngste
 * Änderung, so gehen parallele Änderungen auf verschiedenen Geräten nicht verloren. */
(function (root) {
  'use strict';
  const LISTS = [['deliveries', 'd'], ['debts', 's']];

  function canon(v) {
    if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
    return JSON.stringify(v ?? null);
  }
  function content(r) { const { u, ...rest } = r; return canon(rest); }
  function emptyRecords() { return { mu: {}, tomb: { d: {}, s: {}, m: {} } }; }
  function cleanRecords(x) {
    const r = emptyRecords();
    if (x && typeof x === 'object') {
      if (x.mu && typeof x.mu === 'object') Object.assign(r.mu, x.mu);
      for (const k of ['d', 's', 'm']) if (x.tomb && x.tomb[k] && typeof x.tomb[k] === 'object') Object.assign(r.tomb[k], x.tomb[k]);
    }
    return r;
  }

  /** Momentaufnahme des Inhalts (ohne Zeitstempel), um Änderungen zu erkennen. */
  function snapshot(state) {
    const s = { m: new Set(state.members) };
    for (const [key] of LISTS) { s[key] = new Map(); for (const r of state[key]) s[key].set(r.id, content(r)); }
    return s;
  }

  /** Versieht geänderte/neue Einträge mit Zeitstempel und merkt Löschungen. Ändert state/rec. */
  function stamp(state, snap, rec, now) {
    for (const [key, t] of LISTS) {
      const seen = new Set();
      for (const r of state[key]) {
        seen.add(r.id);
        if (snap[key].get(r.id) !== content(r)) r.u = now;
      }
      for (const id of snap[key].keys()) if (!seen.has(id)) rec.tomb[t][id] = now;
    }
    const names = new Set(state.members);
    for (const n of names) if (!snap.m.has(n)) rec.mu[n] = now;
    for (const n of snap.m) if (!names.has(n)) rec.tomb.m[n] = now;
    return snapshot(state);
  }

  /** Erstmalige Zeitstempel für Daten, die vor der Sync-Funktion entstanden sind:
   *  Was vom Ursprungsstand abweicht, gilt als jetzt geändert. */
  function initialStamp(state, seedState, rec, now) {
    return stamp(state, snapshot(seedState), rec, now);
  }

  function deleted(tomb, key, u) { return tomb[key] !== undefined && tomb[key] >= (u || 0); }

  function maxMap(a, b) { const r = { ...a }; for (const k in b) if (!(k in r) || b[k] > r[k]) r[k] = b[k]; return r; }

  /** Führt zwei Stände zusammen. Ergebnis ist unabhängig von der Reihenfolge. */
  function merge(a, b) {
    const ra = cleanRecords(a), rb = cleanRecords(b);
    const tomb = { d: maxMap(ra.tomb.d, rb.tomb.d), s: maxMap(ra.tomb.s, rb.tomb.s), m: maxMap(ra.tomb.m, rb.tomb.m) };
    const out = { deliveries: [], debts: [], members: [], mu: maxMap(ra.mu, rb.mu), tomb };
    for (const [key, t] of LISTS) {
      const map = new Map();
      for (const r of [...(a[key] || []), ...(b[key] || [])]) {
        const cur = map.get(r.id);
        if (!cur || (r.u || 0) > (cur.u || 0) || ((r.u || 0) === (cur.u || 0) && canon(r) > canon(cur))) map.set(r.id, r);
      }
      out[key] = [...map.values()].filter(r => !deleted(tomb[t], r.id, r.u)).sort((x, y) => x.id - y.id).map(r => structuredClone(r));
    }
    const names = [...new Set([...(a.members || []), ...(b.members || [])])];
    out.members = names.filter(n => !deleted(tomb.m, n, out.mu[n])).sort((x, y) => x.localeCompare(y, 'de'));
    // Verknüpfungen auf gelöschte Lieferungen bleiben als Hinweis erhalten (wie bisher).
    return out;
  }

  function same(a, b) {
    const norm = s => canon({ deliveries: [...s.deliveries].sort((x, y) => x.id - y.id), debts: [...s.debts].sort((x, y) => x.id - y.id), members: [...s.members].sort(), ...cleanRecords(s) });
    return norm(a) === norm(b);
  }

  function validBody(b) {
    return !!b && Array.isArray(b.deliveries) && Array.isArray(b.debts) && Array.isArray(b.members)
      && b.deliveries.every(x => Number.isSafeInteger(x.id) && typeof x.name === 'string' && typeof x.date === 'string' && ['regular', 'penalty', 'sub'].includes(x.type))
      && b.debts.every(x => Number.isSafeInteger(x.id) && typeof x.name === 'string' && Array.isArray(x.links) && Number.isInteger(x.amount))
      && b.members.every(n => typeof n === 'string');
  }

  const api = { canon, snapshot, stamp, initialStamp, merge, same, validBody, emptyRecords, cleanRecords };
  if (typeof module !== 'undefined') module.exports = api; else root.BierwartSyncCore = api;
})(typeof window === 'undefined' ? globalThis : window);
