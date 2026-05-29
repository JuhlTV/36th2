const { json, getOrigin, unauthorized, verifyToken } = require('./_lib');

module.exports = async (req, res) => {
  const origin = getOrigin(req);

  if (req.method === 'OPTIONS') {
    return json(res, 200, { ok: true }, origin);
  }

  if (req.method !== 'GET') {
    return unauthorized(res, origin, 'E-405', 'Method not allowed', 405);
  }

  const authHeader = String(req.headers.authorization || '');
  if (!authHeader.startsWith('Bearer ')) {
    return unauthorized(res, origin, 'E-401', 'Missing bearer token', 401);
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const payload = verifyToken(token);
  if (!payload) {
    return unauthorized(res, origin, 'E-401', 'Invalid or expired token', 401);
  }

  return json(
    res,
    200,
    {
      ok: true,
      valid: true,
      user: payload.sub,
      role: payload.role,
      expiresAt: Number(payload.exp) * 1000,
    },
    origin
  );
};
