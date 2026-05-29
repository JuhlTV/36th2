# SC36 Auth API for Vercel

Vercel Functions fuer serverseitiges Admin-Login.

## Setup

1. Vercel CLI installieren oder Projekt im Vercel-Dashboard importieren.

2. Env Vars setzen:
- ALLOWED_ORIGIN=https://juhltv.github.io
- ADMIN_USERNAME=deinadminname
- TOKEN_TTL_SECONDS=43200
- ADMIN_PASSWORD_HASH=<sha256 von passwort:pepper>
- AUTH_JWT_SECRET=<langes zufaelliges secret>
- AUTH_PEPPER=<zusaetzlicher geheimer pepper>

3. Passwort-Hash lokal erzeugen:

```bash
node -e "const crypto=require('crypto'); const password='DEIN_ADMIN_PASSWORT'; const pepper='DEIN_PEPPER'; console.log(crypto.createHash('sha256').update(password + ':' + pepper).digest('hex'));"
```

4. Deploy:

```bash
npm install -g vercel
cd auth-api-vercel
vercel
vercel --prod
```

5. Danach Vercel-Domain in auth-config.json eintragen:
- authApiEnabled: true
- authApiBase: https://DEIN-PROJEKT.vercel.app

## Endpunkte

- POST /api/login
- GET /api/session
- GET /api/health
