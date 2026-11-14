// Öffentliche Supabase-Verbindung für den Geräte-Abgleich. Nur Projekt-URL und
// öffentlicher (publishable/anon) Schlüssel – niemals service_role oder sb_secret_ eintragen.
// Leere url schaltet den Abgleich ab; die App arbeitet dann wie bisher nur lokal.
window.BIERWART_CLOUD = {
  url: 'https://ghwscyrdbtaaffxjqyge.supabase.co',
  key: 'sb_publishable_URr4dU9MTTcbFdWAagy1uw_iOfs9clb',
  team: 'tv-anrath'
};
