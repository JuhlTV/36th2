# 36th Storm Corps HUD Site

Mehrseitige Star-Wars-HUD-Website fuer das 36th Storm Corps mit Command-Hub, Missionsboard, Rekruten-Terminal, Dienstplan, Rangfreischaltung, Debrief-Archiv und Charakterakten.

## Projekt lokal starten

1. Repository klonen:

```bash
git clone https://github.com/JuhlTV/36th2.git
cd 36th2
```

2. Seite lokal oeffnen:
- Direkt `index.html` im Browser oeffnen
- oder besser mit lokalem Server (z. B. VS Code Live Server), damit alle dynamischen Features wie `fetch()` stabil laufen

## Struktur

- `index.html`: Hauptdashboard
- `command-hub.html`: Zentrale Live-Uebersicht
- `missionsboard.html`: Einsatz-Planer mit Filtern
- `rekruten-terminal.html`: Bewerbungsflow + Antragsausgabe
- `dienstplan.html`: Trainingsslots + fehlende Fortbildungen
- `auszeichnungen.html`: Orden und Profilkarten
- `rangfreischaltung.html`: Interaktive Rangfreischaltung
- `nachberichte.html`: Debrief-Archiv + Template
- `charakterakten.html`: Charakterakten-System
- `admin-auth.html`: Visuelle Auth-Admin-Konsole (Accounts, Rollen, Seitenrechte)
- `auth-config.json`: Zentrale Account-/Rechte-Konfiguration
- `styles.css`: Globales HUD-Styling
- `script.js`: Interaktionen, Filter, Audio-Modus, Live-Metriken

## GitHub Pages aktivieren

1. GitHub Repo oeffnen: `https://github.com/JuhlTV/36th2`
2. `Settings` -> `Pages`
3. `Source`: `Deploy from a branch`
4. `Branch`: `main` und Ordner `/(root)`
5. `Save`
6. Warten, bis die URL angezeigt wird (typisch):
   - `https://juhltv.github.io/36th2/`

## In Google Sites einbinden

1. Google Sites Seite oeffnen
2. `Einfuegen` -> `Einbetten` -> `URL`
3. GitHub-Pages-URL einfuegen (z. B. Startseite):
   - `https://juhltv.github.io/36th2/`
4. Block auf volle Breite ziehen und Seite veroeffentlichen

### Optional: einzelne Module separat einbetten

- `https://juhltv.github.io/36th2/command-hub.html`
- `https://juhltv.github.io/36th2/missionsboard.html`
- `https://juhltv.github.io/36th2/rekruten-terminal.html`
- `https://juhltv.github.io/36th2/dienstplan.html`
- `https://juhltv.github.io/36th2/auszeichnungen.html`
- `https://juhltv.github.io/36th2/rangfreischaltung.html`
- `https://juhltv.github.io/36th2/nachberichte.html`
- `https://juhltv.github.io/36th2/charakterakten.html`

## Hinweise

- Der Audio-/Atmosphaere-Modus startet browserbedingt erst nach Nutzerinteraktion.
- Falls ein Embed in Google Sites nicht sofort sichtbar ist, Seite einmal neu laden und erneut veroeffentlichen.

## Login-System (Admin via API)

Die Inhaltsseiten sind oeffentlich lesbar.
Nur `admin-auth.html` ist geschuetzt und nutzt serverseitige Authentifizierung ueber eine externe Login-API (Vercel Function).

Konfiguration in `auth-config.json`:
- `authApiEnabled: true`
- `authApiBase: https://DEIN-PROJEKT.vercel.app`

Damit liegen Admin-Zugangsdaten nicht mehr im Frontend.

## Auth Admin-Konsole

Die Seite `admin-auth.html` ist standardmaessig nur fuer die Rolle `command` freigegeben.

Funktionen:
- Rollen und Rollen-Labels verwalten
- Seitenrechte pro Rolle in einer Matrix steuern
- Lockout und Session-TTL ohne manuelles JSON-Edit anpassen
- Konfiguration lokal aktivieren (LocalStorage Override) und als `auth-config.json` exportieren

Hinweis zu Accounts:
- Bei aktivierter API (`authApiEnabled: true`) erfolgt Account-Verwaltung serverseitig in der Vercel-API.
- Die lokale Account-Sektion wird dann ausgeblendet.

## Eigene Login-API (Vercel Function)

Das API-Projekt liegt in `auth-api-vercel/`.

Kurzablauf:
1. `cd auth-api-vercel`
2. Vercel-Projekt anlegen oder importieren
3. Env Vars setzen (`ADMIN_PASSWORD_HASH`, `AUTH_JWT_SECRET`, `AUTH_PEPPER`, `ADMIN_USERNAME`, `ALLOWED_ORIGIN`)
4. `vercel --prod`
5. Vercel-URL in `auth-config.json` unter `authApiBase` eintragen

Details siehe `auth-api-vercel/README.md`.

Hinweis zum Deploy:
- "Lokal speichern" in der Admin-Seite wirkt sofort im Browser dieses Geraets.
- Fuer dauerhafte Repo-Aenderungen exportiere `auth-config.json` und committe die Datei ins Repo.
