# SC36 Auth Worker

Cloudflare Worker fuer serverseitiges Admin-Login.

## Setup

1. Abhaengigkeiten installieren:

```bash
cd auth-worker
npm install
```

2. Passwort-Hash erzeugen (lokal):

```bash
node -e "const crypto=require('crypto'); const password='DEIN_ADMIN_PASSWORT'; const pepper='DEIN_PEPPER'; console.log(crypto.createHash('sha256').update(password + ':' + pepper).digest('hex'));"
```

3. Secrets setzen:

```bash
npx wrangler secret put ADMIN_PASSWORD_HASH
npx wrangler secret put AUTH_JWT_SECRET
npx wrangler secret put AUTH_PEPPER
```

4. Optional Variablen in wrangler.toml anpassen:
- ALLOWED_ORIGIN (z. B. https://juhltv.github.io)
- ADMIN_USERNAME (z. B. texer)
- TOKEN_TTL_SECONDS (z. B. 43200)

5. Deploy:

```bash
npm run deploy
```

6. Worker-URL in auth-config.json eintragen:

- authApiEnabled: true
- authApiBase: https://DEIN_WORKER.workers.dev

## Endpunkte

- POST /api/login
  - Body: { "username": "...", "password": "..." }
- GET /api/session
  - Header: Authorization: Bearer <token>
- GET /api/health
