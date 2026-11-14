// Aufruf: node tests/sync-core.test.js
const assert = require('assert');
const core = require('../sync-core.js');
const base = () => ({ deliveries: [{ id: 1, date: '2026-11-01', name: 'Paul', type: 'regular', note: '', confirmed: false }, { id: 2, date: '2026-11-02', name: 'Nico', type: 'regular', note: '', confirmed: false }], debts: [{ id: 1, date: '2026-11-01', name: 'Nico', reason: 'x', amount: 1, links: [] }], members: ['Nico', 'Paul'] });
function device(state) { const s = structuredClone(state), rec = core.emptyRecords(); let snap = core.snapshot(s); return { s, rec, save(t) { snap = core.stamp(s, snap, rec, t); }, body() { return { ...structuredClone(s), ...structuredClone(rec) }; } }; }

// parallele Änderungen an verschiedenen Einträgen bleiben beide erhalten
let a = device(base()), b = device(base());
a.s.deliveries[0].confirmed = true; a.save(100);
b.s.deliveries.push({ id: 99, date: '2026-11-20', name: 'Böhm', type: 'regular', note: '', confirmed: false }); b.save(110);
b.s.members.push('Böhm'); b.save(111);
let m = core.merge(a.body(), b.body());
assert.strictEqual(m.deliveries.find(x => x.id === 1).confirmed, true);
assert.ok(m.deliveries.some(x => x.id === 99));
assert.deepStrictEqual(m.members, ['Böhm', 'Nico', 'Paul']);
assert.ok(core.same(m, core.merge(b.body(), a.body())), 'Reihenfolge egal');

// gleicher Eintrag: jüngste Änderung gewinnt
a = device(base()); b = device(base());
a.s.deliveries[1].note = 'alt'; a.save(100);
b.s.deliveries[1].note = 'neu'; b.save(200);
assert.strictEqual(core.merge(a.body(), b.body()).deliveries.find(x => x.id === 2).note, 'neu');

// Löschen schlägt ältere Änderung, neuere Änderung schlägt Löschen
a = device(base()); b = device(base());
a.s.deliveries = a.s.deliveries.filter(x => x.id !== 2); a.save(300);
b.s.deliveries[1].note = 'vorher'; b.save(200);
assert.ok(!core.merge(a.body(), b.body()).deliveries.some(x => x.id === 2));
b.s.deliveries[1].note = 'nachher'; b.save(400);
assert.ok(core.merge(a.body(), b.body()).deliveries.some(x => x.id === 2));

// Mitglied löschen und wieder hinzufügen
a = device(base()); a.s.members = ['Nico']; a.save(10); a.s.members.push('Paul'); a.save(20);
assert.deepStrictEqual(core.merge(a.body(), device(base()).body()).members, ['Nico', 'Paul']);

// Erststempel: nur Abweichungen vom Ursprungsstand bekommen Zeitstempel
const seed = base(), old = base(); old.deliveries[0].confirmed = true; old.deliveries.pop();
const rec = core.emptyRecords(); core.initialStamp(old, seed, rec, 500);
assert.strictEqual(old.deliveries[0].u, 500); assert.strictEqual(rec.tomb.d[2], 500);
const fresh = device(base()).body();
const mm = core.merge({ ...old, ...rec }, fresh);
assert.strictEqual(mm.deliveries.length, 1); assert.strictEqual(mm.deliveries[0].confirmed, true);
assert.ok(core.validBody(mm));
console.log('sync-core: alle Tests bestanden');
