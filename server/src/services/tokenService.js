const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const config = require("../config");
const pool = require("../db/pool");

const SALT_ROUNDS = 12;

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, mobile: user.mobile, role: user.role, type: "access" },
    config.jwt.secret,
    { expiresIn: config.jwt.accessExpiry }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, type: "refresh" },
    config.jwt.secret,
    { expiresIn: config.jwt.refreshExpiry }
  );
}

function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

async function hashToken(token) {
  return bcrypt.hash(token, 10);
}

async function storeRefreshToken(userId, refreshToken, deviceId, deviceModel) {
  const tokenHash = await hashToken(refreshToken);
  const decoded = jwt.decode(refreshToken);
  const expiresAt = new Date(decoded.exp * 1000);

  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, device_id, device_model, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, tokenHash, deviceId, deviceModel, expiresAt]
  );
}

async function revokeRefreshToken(tokenHash) {
  await pool.query(
    `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL`,
    [tokenHash]
  );
}

async function validateRefreshToken(refreshToken) {
  const decoded = verifyToken(refreshToken);
  if (decoded.type !== "refresh") return null;

  const { rows } = await pool.query(
    `SELECT rt.*, u.id, u.mobile, u.name, u.role
     FROM refresh_tokens rt
     JOIN users u ON u.id = rt.user_id
     WHERE rt.revoked_at IS NULL AND rt.expires_at > NOW()
     ORDER BY rt.created_at DESC
     LIMIT 50`
  );

  for (const row of rows) {
    const match = await bcrypt.compare(refreshToken, row.token_hash);
    if (match) return row;
  }
  return null;
}

function generateSetupToken(userId, purpose) {
  return jwt.sign({ sub: userId, purpose, type: "pin_setup" }, config.jwt.secret, { expiresIn: "15m" });
}

function verifySetupToken(token, expectedPurpose) {
  const decoded = verifyToken(token);
  if (decoded.type !== "pin_setup" || decoded.purpose !== expectedPurpose) {
    return null;
  }
  return decoded;
}

function hashOtp(otp) {
  return crypto.createHash("sha256").update(String(otp)).digest("hex");
}

module.exports = {
  SALT_ROUNDS,
  signAccessToken,
  signRefreshToken,
  verifyToken,
  hashToken,
  storeRefreshToken,
  revokeRefreshToken,
  validateRefreshToken,
  generateSetupToken,
  verifySetupToken,
  hashOtp,
};
