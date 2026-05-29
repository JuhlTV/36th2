const encoder = new TextEncoder();

const json = (data, status = 200, origin = '*') => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      Vary: 'Origin',
    },
  });
};

const base64UrlEncode = (input) => {
  const bytes = input instanceof Uint8Array ? input : encoder.encode(input);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const base64UrlDecode = (input) => {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

const timingSafeEqual = (a, b) => {
  if (a.length !== b.length) {
    return false;
  }
  let out = 0;
  for (let i = 0; i < a.length; i += 1) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
};

const hex = (bytes) => Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');

const sha256Hex = async (value) => {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return hex(new Uint8Array(digest));
};

const hmacSign = async (secret, data) => {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return base64UrlEncode(new Uint8Array(sig));
};

const issueToken = async (env, payload) => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const body = `${encodedHeader}.${encodedPayload}`;
  const signature = await hmacSign(env.AUTH_JWT_SECRET, body);
  return `${body}.${signature}`;
};

const verifyToken = async (env, token) => {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [encodedHeader, encodedPayload, signature] = parts;
  const body = `${encodedHeader}.${encodedPayload}`;
  const expected = await hmacSign(env.AUTH_JWT_SECRET, body);
  if (!timingSafeEqual(signature, expected)) {
    return null;
  }

  try {
    const payloadText = new TextDecoder().decode(base64UrlDecode(encodedPayload));
    const payload = JSON.parse(payloadText);
    if (!payload?.exp || Date.now() >= Number(payload.exp) * 1000) {
      return null;
    }
    return payload;
  } catch (_) {
    return null;
  }
};

const getOrigin = (request, env) => {
  const requestOrigin = request.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGIN || '').trim();
  if (!allowed) {
    return '*';
  }
  if (requestOrigin === allowed) {
    return requestOrigin;
  }
  return allowed;
};

const unauthorized = (origin, code = 'E-401', message = 'Unauthorized', status = 401) => {
  return json({ ok: false, code, message }, status, origin);
};

export default {
  async fetch(request, env) {
    const origin = getOrigin(request, env);
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return json({ ok: true }, 200, origin);
    }

    if (url.pathname === '/api/login' && request.method === 'POST') {
      let body;
      try {
        body = await request.json();
      } catch (_) {
        return unauthorized(origin, 'E-400', 'Invalid request body', 400);
      }

      const username = String(body?.username || '').trim().toLowerCase();
      const password = String(body?.password || '');
      const adminUser = String(env.ADMIN_USERNAME || '').trim().toLowerCase();
      const pepper = String(env.AUTH_PEPPER || '');
      const incomingHash = await sha256Hex(`${password}:${pepper}`);
      const expectedHash = String(env.ADMIN_PASSWORD_HASH || '').trim().toLowerCase();

      if (!username || !password) {
        return unauthorized(origin, 'E-400', 'Missing credentials', 400);
      }

      if (username !== adminUser || !timingSafeEqual(incomingHash, expectedHash)) {
        return unauthorized(origin, 'E-401', 'Invalid credentials', 401);
      }

      const now = Date.now();
      const ttlSec = Math.max(300, Number(env.TOKEN_TTL_SECONDS || 43200));
      const payload = {
        sub: username,
        role: 'command',
        iat: Math.floor(now / 1000),
        exp: Math.floor(now / 1000) + ttlSec,
      };

      const token = await issueToken(env, payload);
      return json(
        {
          ok: true,
          user: username,
          role: 'command',
          token,
          issuedAt: now,
          expiresAt: now + ttlSec * 1000,
        },
        200,
        origin
      );
    }

    if (url.pathname === '/api/session' && request.method === 'GET') {
      const authHeader = request.headers.get('Authorization') || '';
      if (!authHeader.startsWith('Bearer ')) {
        return unauthorized(origin, 'E-401', 'Missing bearer token', 401);
      }

      const token = authHeader.slice('Bearer '.length).trim();
      const payload = await verifyToken(env, token);
      if (!payload) {
        return unauthorized(origin, 'E-401', 'Invalid or expired token', 401);
      }

      return json(
        {
          ok: true,
          valid: true,
          user: payload.sub,
          role: payload.role,
          expiresAt: Number(payload.exp) * 1000,
        },
        200,
        origin
      );
    }

    if (url.pathname === '/api/health' && request.method === 'GET') {
      return json({ ok: true, service: 'sc36-auth-api' }, 200, origin);
    }

    return json({ ok: false, code: 'E-404', message: 'Not found' }, 404, origin);
  },
};
