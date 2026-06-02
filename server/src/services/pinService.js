const bcrypt = require("bcrypt");
const config = require("../config");
const pool = require("../db/pool");
const { InvalidPinError, AccountLockedError } = require("../utils/errors");
const { SALT_ROUNDS } = require("./tokenService");

function validatePinFormat(pin) {
  if (!pin || typeof pin !== "string") return false;
  const len = pin.length;
  return config.pin.allowedLengths.includes(len) && /^\d+$/.test(pin);
}

async function hashPin(pin) {
  return bcrypt.hash(pin, SALT_ROUNDS);
}

async function verifyPin(pin, pinHash) {
  if (!pinHash) return false;
  return bcrypt.compare(pin, pinHash);
}

async function isAccountLocked(user) {
  if (!user.locked_until) return false;
  const lockedUntil = new Date(user.locked_until);
  if (lockedUntil <= new Date()) {
    await pool.query(
      `UPDATE users SET locked_until = NULL, failed_attempts = 0 WHERE id = $1`,
      [user.id]
    );
    return false;
  }
  return true;
}

async function recordFailedAttempt(userId) {
  const { rows } = await pool.query(
    `UPDATE users
     SET failed_attempts = failed_attempts + 1
     WHERE id = $1
     RETURNING failed_attempts`,
    [userId]
  );

  const attempts = rows[0]?.failed_attempts || 0;
  const remaining = Math.max(0, config.pin.maxAttempts - attempts);

  if (attempts >= config.pin.maxAttempts) {
    const lockedUntil = new Date(Date.now() + config.pin.lockoutMinutes * 60 * 1000);
    await pool.query(
      `UPDATE users SET locked_until = $1 WHERE id = $2`,
      [lockedUntil, userId]
    );
    throw new AccountLockedError(lockedUntil.toISOString());
  }

  throw new InvalidPinError(remaining);
}

async function resetFailedAttempts(userId) {
  await pool.query(
    `UPDATE users SET failed_attempts = 0, locked_until = NULL WHERE id = $1`,
    [userId]
  );
}

async function setPin(userId, pin) {
  if (!validatePinFormat(pin)) {
    throw new Error("PIN must be 4 or 6 digits");
  }
  const pinHash = await hashPin(pin);
  await pool.query(
    `UPDATE users SET pin_hash = $1, failed_attempts = 0, locked_until = NULL WHERE id = $2`,
    [pinHash, userId]
  );
}

async function checkPinMatch(pin, confirmPin) {
  return pin === confirmPin;
}

module.exports = {
  validatePinFormat,
  hashPin,
  verifyPin,
  isAccountLocked,
  recordFailedAttempt,
  resetFailedAttempts,
  setPin,
  checkPinMatch,
};
