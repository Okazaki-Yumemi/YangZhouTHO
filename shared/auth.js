const crypto = require('node:crypto');

function normalizeDisplayName(value) {
  return String(value || '').trim().toLowerCase();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const normalizedPassword = String(password || '');
  const hash = crypto.scryptSync(normalizedPassword, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, expectedHash) {
  if (!salt || !expectedHash) {
    return false;
  }
  const actual = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expectedHash, 'hex'));
}

function findUserByDisplayName(users, displayName) {
  const normalizedTarget = normalizeDisplayName(displayName);
  if (!normalizedTarget) {
    return null;
  }
  return users.find((user) => normalizeDisplayName(user.display_name) === normalizedTarget) || null;
}

module.exports = {
  findUserByDisplayName,
  hashPassword,
  normalizeDisplayName,
  verifyPassword
};
