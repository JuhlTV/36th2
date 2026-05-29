const { json, getOrigin, unauthorized, timingSafeEqual, sha256Hex, issueToken } = require('./_lib');

module.exports = async (req, res) => {
  const origin = getOrigin(req);

  if (req.method === 'OPTIONS') {
    return json(res, 200, { ok: true }, origin);
  }

  if (req.method !== 'POST') {
    return unauthorized(res, origin, 'E-405', 'Method not allowed', 405);
  }

  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');

  if (!username || !password) {
    return unauthorized(res, origin, 'E-400', 'Missing credentials', 400);
  }

  const adminUsername = String(process.env.ADMIN_USERNAME || '').trim().toLowerCase();
  const pepper = String(process.env.AUTH_PEPPER || '');
  const incomingHash = sha256Hex(`${password}:${pepper}`);
  const expectedHash = String(process.env.ADMIN_PASSWORD_HASH || '').trim().toLowerCase();

  if (username !== adminUsername || !timingSafeEqual(incomingHash, expectedHash)) {
    return unauthorized(res, origin, 'E-401', 'Invalid credentials', 401);
  }

  const now = Date.now();
  const ttlSec = Math.max(300, Number(process.env.TOKEN_TTL_SECONDS || 43200));
  const payload = {
    sub: username,
    role: 'command',
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + ttlSec,
  };

  const token = issueToken(payload);
  return json(
    res,
    200,
    {
      ok: true,
      user: username,
      role: 'command',
      token,
      issuedAt: now,
      expiresAt: now + ttlSec * 1000,
    },
    origin
  );
};
