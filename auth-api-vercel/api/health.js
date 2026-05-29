const { json, getOrigin } = require('./_lib');

module.exports = async (req, res) => {
  const origin = getOrigin(req);
  return json(res, 200, { ok: true, service: 'sc36-auth-api-vercel' }, origin);
};
