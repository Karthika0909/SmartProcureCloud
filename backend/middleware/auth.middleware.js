const jwt            = require('jsonwebtoken');
const jwksClient     = require('jwks-rsa');
const { getRoleForUser } = require('../config/roles');

const client = jwksClient({
  jwksUri:   'https://login.microsoftonline.com/98587403-b531-456c-8d95-84d5d6845a6a/discovery/v2.0/keys',
  cache:     true,
  rateLimit: true
});

const getSigningKey = (kid) => new Promise((resolve, reject) => {
  client.getSigningKey(kid, (err, key) => {
    if (err) return reject(err);
    resolve(key.getPublicKey());
  });
});

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token   = authHeader.split(' ')[1];
    const decoded = jwt.decode(token, { complete: true });

    if (!decoded?.header?.kid) {
      return res.status(401).json({ error: 'Invalid token format' });
    }

    const signingKey = await getSigningKey(decoded.header.kid);

    const verified = jwt.verify(token, signingKey, {
      audience: '3ea48b59-7c9b-487e-8e90-ade7b7a0caa2',
      issuer:   'https://login.microsoftonline.com/98587403-b531-456c-8d95-84d5d6845a6a/v2.0'
    });

    req.user = {
      email: verified.preferred_username || verified.email,
      name:  verified.name,
      role:  getRoleForUser(verified.preferred_username || verified.email)
    };

    next();
  } catch (err) {
    console.error('Auth error:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

module.exports = { authenticate };
