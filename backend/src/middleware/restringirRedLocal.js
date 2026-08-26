// RNF: el panel solo debe responder a pedidos que vengan de la LAN del
// hospital. LAN_CIDR admite una lista separada por comas (varias VLANs); si
// queda vacio, no restringe nada — asi un .env de desarrollo sin esta
// variable sigue funcionando desde localhost sin config extra.
function ipEnRango(ip, cidr) {
  const limpio = ip.replace(/^::ffff:/, '');
  const [rangoIp, bitsStr] = cidr.split('/');
  const bits = bitsStr === undefined ? 32 : parseInt(bitsStr, 10);
  const aNumero = (s) => s.split('.').reduce((acc, octeto) => (acc << 8) + parseInt(octeto, 10), 0) >>> 0;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(limpio) || !/^\d+\.\d+\.\d+\.\d+$/.test(rangoIp)) return false;
  const mascara = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (aNumero(limpio) & mascara) === (aNumero(rangoIp) & mascara);
}

module.exports = function restringirRedLocal(req, res, next) {
  const cidrs = (process.env.LAN_CIDR || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (cidrs.length === 0) return next();

  if (cidrs.some((cidr) => ipEnRango(req.ip, cidr))) return next();

  return res.status(403).json({ error: 'Acceso permitido solo desde la red interna del hospital.' });
};

module.exports.ipEnRango = ipEnRango;
