const crypto = require('crypto');

const json = (res, status, data, origin = '*') => {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Vary', 'Origin');
  res.send(JSON.stringify(data));
};

const getOrigin = (req) => {
  const allowed = String(process.env.ALLOWED_ORIGIN || '').trim();
  const requestOrigin = String(req.headers.origin || '').trim();
  if (!allowed) {
    return '*';
  }
  return requestOrigin === allowed ? requestOrigin : allowed;
};

const unauthorized = (res, origin, code = 'E-401', message = 'Unauthorized', status = 401) => {
  return json(res, status, { ok: false, code, message }, origin);
};

const timingSafeEqual = (a, b) => {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  if (left.length !== right.length) {
    return false;
  }
  return crypto.timingSafeEqual(left, right);
};

const sha256Hex = (value) => crypto.createHash('sha256').update(value).digest('hex');

const base64UrlEncode = (value) => {
  const raw = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return raw.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const base64UrlDecode = (value) => {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, 'base64');
};

const sign = (secret, data) => {
  return base64UrlEncode(crypto.createHmac('sha256', secret).update(data).digest());
};

const issueToken = (payload) => {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const body = `${encodedHeader}.${encodedPayload}`;
  const signature = sign(process.env.AUTH_JWT_SECRET, body);
  return `${body}.${signature}`;
};

const verifyToken = (token) => {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const body = `${encodedHeader}.${encodedPayload}`;
  const expected = sign(process.env.AUTH_JWT_SECRET, body);
  if (!timingSafeEqual(signature, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8'));
    if (!payload?.exp || Date.now() >= Number(payload.exp) * 1000) {
      return null;
    }
    return payload;
  } catch (_) {
    return null;
  }
};

module.exports = {
  json,
  getOrigin,
  unauthorized,
  timingSafeEqual,
  sha256Hex,
  issueToken,
  verifyToken,
};
