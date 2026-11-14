# Abgleich über mehrere Geräte einrichten

Die App funktioniert weiterhin ohne Cloud. Erst wenn du dich in der App anmeldest
(Knopf „Abgleich“ oben), werden die Daten zwischen deinen Geräten abgeglichen.

`sync-config.js` zeigt auf das bestehende Supabase-Projekt von Zeitwerk. So kannst du dich
mit demselben Konto (E-Mail + Passwort) anmelden. Wer lieber ein eigenes Projekt möchte,
legt eins an und trägt dort URL und öffentlichen Schlüssel ein.

## Einmalig (ca. 5 Minuten)

1. Supabase öffnen → Projekt → **SQL Editor** → Inhalt von `backend/setup.sql` einfügen.
2. In der letzten Anweisung `DEINE-EMAIL@example.com` durch deine Anmelde-E-Mail ersetzen
   (weitere Personen mit Komma ergänzen) und **Run** drücken.
3. Nur für den Anmeldelink per E-Mail: Authentication → URL Configuration → bei
   „Redirect URLs“ die Adresse der App ergänzen, z. B.
   `https://friedrichsnicolas.github.io/tv-anrath-Bierwart/**`.
   Mit Passwort-Anmeldung ist das nicht nötig.
4. Auf dem Gerät mit dem aktuellsten Stand zuerst „Backup sichern“, dann anmelden.
   Danach auf den weiteren Geräten anmelden. Vorhandene Einträge werden zusammengeführt.

## Weitere Personen (z. B. zweiter Bierwart)

1. Authentication → Users → **Invite user** (öffentliche Registrierung bleibt aus).
2. Im SQL Editor freischalten:
   ```sql
   insert into public.bierwart_members (team, user_id)
   select 'tv-anrath', id from auth.users where email = 'person@example.com'
   on conflict do nothing;
   ```

## Wie der Abgleich arbeitet

- Jede Änderung wird sofort lokal gespeichert und danach übertragen. Offline geht nichts verloren.
- Abgleich beim Öffnen, nach jeder Änderung und alle 20 Sekunden, solange die App offen ist.
- Ändern zwei Geräte gleichzeitig, werden die Stände pro Eintrag zusammengeführt;
  beim selben Eintrag gewinnt die jüngere Änderung. Löschungen werden mit übertragen.
- Ein versionsgeprüfter Schreibzugriff (`bierwart_write`) verhindert stilles Überschreiben.
- Lesen und Schreiben nur für angemeldete, freigeschaltete Konten. Kein anonymer Zugriff.
- In `sync-config.js` stehen nur öffentliche Werte. Niemals `service_role` oder `sb_secret_…` eintragen.
