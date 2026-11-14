/* Bierwart · Abgleich über mehrere Geräte (Supabase, ohne zusätzliche Bibliothek).
 * Daten bleiben immer zuerst lokal gespeichert. Ist man angemeldet, gleicht die App
 * den gemeinsamen Team-Datensatz ab: beim Öffnen, nach jeder Änderung und alle 20 Sekunden. */
(function () {
  'use strict';
  const core = window.BierwartSyncCore, app = window.bierwartApp;
  const cfg = window.BIERWART_CLOUD || {};
  const SESSION = 'tv-anrath-sync-session-v1', META = 'tv-anrath-sync-meta-v1';
  const $ = id => document.getElementById(id);
  const enabled = !!(cfg.url && cfg.key && cfg.team);
  let session = read(SESSION), meta = { version: 0, dirty: false, gen: 0, userId: null, op: null, last: null, ...(read(META) || {}) };
  let busy = false, again = false, timer = null, lastError = '';

  function read(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }
  function write(k, v) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { } }
  function persist() { write(META, meta); }

  // ---------------------------------------------------------------- Anzeige
  function badge() {
    const b = $('syncBadge'); if (!b) return;
    let text, state;
    if (!enabled) { text = 'Nur dieses Gerät'; state = 'off'; }
    else if (!session) { text = 'Abgleich aus'; state = 'off'; }
    else if (!navigator.onLine) { text = 'Offline'; state = 'warn'; }
    else if (lastError) { text = 'Abgleich prüfen'; state = 'warn'; }
    else if (busy || meta.dirty) { text = 'Wird abgeglichen …'; state = 'busy'; }
    else { text = meta.last ? 'Abgeglichen ' + new Date(meta.last).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : 'Verbunden'; state = 'ok'; }
    b.querySelector('span').textContent = text; b.dataset.state = state;
    if ($('syncDialog')?.open) dialog();
  }
  function dialog() {
    $('syncOff').classList.toggle('hide', enabled);
    $('syncLoginForm').classList.toggle('hide', !enabled || !!session);
    $('syncAccount').classList.toggle('hide', !enabled || !session);
    $('syncUser').textContent = session?.user?.email || '';
    $('syncStatus').textContent = lastError ? lastError
      : !navigator.onLine ? 'Offline. Änderungen bleiben auf diesem Gerät und werden später übertragen.'
      : busy ? 'Abgleich läuft …'
      : meta.dirty ? 'Änderungen werden übertragen …'
      : meta.last ? 'Alle Geräte auf dem gleichen Stand · zuletzt ' + new Date(meta.last).toLocaleString('de-DE') : 'Verbunden.';
    $('syncStatus').classList.toggle('red', !!lastError);
  }
  function loginMsg(t, err) { $('syncLoginMsg').textContent = t; $('syncLoginMsg').classList.toggle('red', !!err); }

  // ---------------------------------------------------------------- Supabase-REST
  async function request(path, { method = 'GET', body, auth = true } = {}) {
    const headers = { apikey: cfg.key, 'Content-Type': 'application/json' };
    if (auth) { await freshToken(); headers.Authorization = 'Bearer ' + session.access_token; }
    const res = await fetch(cfg.url.replace(/\/$/, '') + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { }
    if (!res.ok) { const e = new Error(data?.msg || data?.message || data?.error_description || ('HTTP ' + res.status)); e.status = res.status; e.code = data?.code || data?.error_code || data?.error; throw e; }
    return data;
  }
  function keep(data) {
    session = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000, user: { id: data.user?.id, email: data.user?.email } };
    write(SESSION, session);
  }
  async function freshToken() {
    if (!session) throw new Error('Nicht angemeldet');
    if (session.expires_at - Date.now() > 60000) return;
    try { keep(await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: session.refresh_token }, auth: false })); }
    catch (e) { if (e.status === 400 || e.status === 401) { signedOut('Anmeldung abgelaufen. Bitte neu anmelden.'); } throw e; }
  }
  function signedOut(msg) { session = null; write(SESSION, null); lastError = ''; badge(); if (msg) app.notify(msg); }

  async function readRemote() {
    const rows = await request('/rest/v1/bierwart_documents?select=version,body&team=eq.' + encodeURIComponent(cfg.team));
    const row = rows?.[0];
    if (!row) return null;
    if (!core.validBody(row.body)) throw new Error('Cloud-Daten haben ein unbekanntes Format.');
    return row;
  }

  // ---------------------------------------------------------------- Abgleich
  function friendly(e) {
    if (e.code === '42501' || /member/i.test(e.message)) return 'Dein Konto ist für das Team noch nicht freigeschaltet. Siehe Einrichtung (backend/SETUP.md).';
    if (e.code === '42P01' || e.code === 'PGRST202' || e.code === 'PGRST205') return 'Die Cloud ist noch nicht eingerichtet (backend/setup.sql ausführen).';
    if (e instanceof TypeError) return 'Keine Verbindung zur Cloud. Änderungen bleiben auf diesem Gerät.';
    return 'Abgleich fehlgeschlagen: ' + e.message + '. Änderungen bleiben auf diesem Gerät.';
  }
  async function cycle() {
    if (!enabled || !session || !navigator.onLine) { badge(); return; }
    if (busy) { again = true; return; }
    busy = true; badge();
    try {
      if (meta.userId !== session.user.id) { meta = { ...meta, userId: session.user.id, version: 0, op: null, dirty: true }; persist(); }
      for (let attempt = 0; attempt < 4; attempt++) {
        if (!meta.op) {
          const remote = await readRemote();
          const remoteVersion = remote?.version || 0;
          if (remote && remoteVersion !== meta.version) {
            const local = app.get(), merged = core.merge(local, remote.body);
            if (!core.same(merged, local)) app.apply(merged);
            meta.dirty = meta.dirty || !core.same(merged, remote.body);
          } else if (!remote) meta.dirty = true;
          meta.version = remoteVersion; persist();
          if (!meta.dirty) break;
          meta.op = { id: crypto.randomUUID(), expected: meta.version, body: app.get(), gen: meta.gen }; persist();
        }
        const op = meta.op;
        const res = await request('/rest/v1/rpc/bierwart_write', { method: 'POST', body: { p_team: cfg.team, p_expected: op.expected, p_body: op.body, p_operation: op.id } });
        meta.op = null;
        if (res?.ok) { meta.version = res.version; meta.dirty = meta.gen !== op.gen; persist(); if (!meta.dirty) break; }
        else if (res?.conflict) { persist(); /* anderes Gerät war schneller: neu lesen, zusammenführen, erneut senden */ }
        else throw new Error('Speichern wurde nicht bestätigt');
      }
      meta.last = Date.now(); lastError = ''; persist();
    } catch (e) {
      if (session) lastError = friendly(e);
    } finally {
      busy = false; badge();
      if (again) { again = false; schedule(300); }
    }
  }
  function schedule(delay = 800) { clearTimeout(timer); timer = setTimeout(cycle, delay); }

  // ---------------------------------------------------------------- Anmeldung
  async function login(e) {
    e.preventDefault();
    const email = $('syncEmail').value.trim(), password = $('syncPassword').value;
    if (!email || !password) return;
    $('syncLoginBtn').disabled = true; loginMsg('Anmeldung läuft …');
    try {
      keep(await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password }, auth: false }));
      $('syncPassword').value = ''; loginMsg(''); lastError = '';
      app.notify('Angemeldet · Daten werden abgeglichen'); dialog(); cycle();
    } catch (err) {
      loginMsg(err.status === 400 ? 'E-Mail oder Passwort stimmt nicht. Kein Passwort? Dann Anmeldelink anfordern.' : friendly(err), true);
    } finally { $('syncLoginBtn').disabled = false; }
  }
  async function magicLink() {
    const email = $('syncEmail').value.trim();
    if (!email) { loginMsg('Bitte zuerst die E-Mail-Adresse eintragen.', true); return; }
    $('syncLinkBtn').disabled = true;
    try {
      const redirect = location.origin + location.pathname;
      await request('/auth/v1/otp?redirect_to=' + encodeURIComponent(redirect), { method: 'POST', body: { email, create_user: false }, auth: false });
      loginMsg('Link verschickt. Öffne die E-Mail auf diesem Gerät und tippe auf den Link.');
    } catch (err) {
      loginMsg(err.status === 429 ? 'Zu viele Anfragen. Bitte etwas warten.' : 'Link konnte nicht verschickt werden. Ist die Adresse freigeschaltet?', true);
    } finally { setTimeout(() => { $('syncLinkBtn').disabled = false; }, 30000); }
  }
  async function fromLink() {
    if (!location.hash.includes('access_token=')) return;
    const p = new URLSearchParams(location.hash.slice(1));
    history.replaceState(null, '', location.pathname + location.search);
    try {
      session = { access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_at: Date.now() + (Number(p.get('expires_in')) || 3600) * 1000, user: {} };
      const user = await request('/auth/v1/user');
      session.user = { id: user.id, email: user.email }; write(SESSION, session);
      app.notify('Angemeldet · Daten werden abgeglichen');
    } catch { session = null; write(SESSION, null); app.notify('Anmeldelink ungültig oder abgelaufen'); }
  }
  async function logout() {
    if (meta.dirty && !confirm('Es gibt noch nicht übertragene Änderungen. Trotzdem abmelden? Sie bleiben auf diesem Gerät.')) return;
    try { await request('/auth/v1/logout?scope=local', { method: 'POST' }); } catch { }
    signedOut('Abgemeldet · Daten bleiben auf diesem Gerät');
  }

  // ---------------------------------------------------------------- Start
  app.onChange(() => { meta.gen++; meta.dirty = true; persist(); badge(); if (session) schedule(); });
  $('syncBadge').addEventListener('click', () => { dialog(); $('syncDialog').showModal(); });
  $('syncLoginForm').addEventListener('submit', login);
  $('syncLinkBtn').addEventListener('click', magicLink);
  $('syncNow').addEventListener('click', () => { lastError = ''; cycle(); });
  $('syncLogout').addEventListener('click', logout);
  window.addEventListener('online', () => schedule(0));
  window.addEventListener('offline', badge);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(0); });
  setInterval(() => { if (!document.hidden) cycle(); }, 20000);
  window.bierwartSync = { cycle, get signedIn() { return !!session; } };
  (async () => { if (enabled) await fromLink(); badge(); if (session) cycle(); })();
})();
