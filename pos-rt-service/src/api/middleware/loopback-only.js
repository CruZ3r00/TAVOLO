'use strict';

const { AppError, CODES } = require('../../utils/errors');

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function loopbackOnly(req, res, next) {
  const ip = req.socket.remoteAddress;
  if (!LOOPBACK.has(ip)) {
    const err = new AppError(CODES.LOOPBACK_ONLY, 'Accesso consentito solo da 127.0.0.1', {
      httpStatus: 403,
    });
    return res.status(err.httpStatus).json(err.toJSON());
  }
  next();
}

module.exports = { loopbackOnly };
