const pool = require("../db/pool");
const pinService = require("./pinService");
const otpService = require("./otpService");
const tokenService = require("./tokenService");
const { AppError, PinNotSetError, AccountLockedError } = require("../utils/errors");
const logger = require("../utils/logger");

const ALLOWED_ROLES = ["admin", "chef", "super_owner", "owner"];

async function findUserByMobile(mobile) {
  const { rows } = await pool.query(
    `SELECT id, mobile, name, role, pin_hash, failed_attempts, locked_until
     FROM users WHERE mobile = $1`,
    [mobile]
  );
  return rows[0] || null;
}

async function checkMobileStatus(mobile) {
  const user = await findUserByMobile(mobile);
  if (!user) {
    return { exists: false, has_pin: false, locked: false };
  }

  const locked = await pinService.isAccountLocked(user);
  return {
    exists: true,
    has_pin: !!user.pin_hash,
    locked,
    locked_until: user.locked_until,
    role: user.role,
  };
}

async function login({ mobile, pin, device_id, device_model, app_type, version, remember_device }) {
  if (!mobile || !/^[6-9]\d{9}$/.test(mobile)) {
    throw new AppError("Invalid mobile number", 400, "INVALID_MOBILE");
  }

  const user = await findUserByMobile(mobile);
  if (!user) {
    throw new AppError("User not found", 404, "USER_NOT_FOUND");
  }

  if (!ALLOWED_ROLES.includes(user.role)) {
    throw new AppError("Access denied for this role", 403, "ROLE_DENIED");
  }

  if (await pinService.isAccountLocked(user)) {
    throw new AccountLockedError(user.locked_until);
  }

  if (!user.pin_hash) {
    throw new PinNotSetError();
  }

  if (!pin) {
    throw new AppError("PIN is required", 400, "PIN_REQUIRED");
  }

  if (!pinService.validatePinFormat(pin)) {
    throw new AppError("PIN must be 4 or 6 digits", 400, "INVALID_PIN_FORMAT");
  }

  const valid = await pinService.verifyPin(pin, user.pin_hash);
  if (!valid) {
    await pinService.recordFailedAttempt(user.id);
  }

  await pinService.resetFailedAttempts(user.id);

  const accessToken = tokenService.signAccessToken(user);
  const refreshToken = tokenService.signRefreshToken(user);
  await tokenService.storeRefreshToken(user.id, refreshToken, device_id, device_model);

  if (remember_device && device_id) {
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO trusted_devices (user_id, device_id, device_model, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, device_id)
       DO UPDATE SET last_used_at = NOW(), expires_at = $4, device_model = $3`,
      [user.id, device_id, device_model, expiresAt]
    );
  }

  logger.info("User logged in", { userId: user.id, mobile: mobile.slice(-4).padStart(10, "*"), app_type, version });

  return {
    success: true,
    message: "Login successful",
    token: accessToken,
    access_token: accessToken,
    refresh_token: refreshToken,
    role: user.role,
    user_role: user.role,
    user_id: user.id,
    name: user.name,
    user: { id: user.id, name: user.name, mobile: user.mobile },
  };
}

async function sendSetupOtp(mobile) {
  const user = await findUserByMobile(mobile);
  if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");
  const result = await otpService.createOtpVerification(mobile, "pin_setup");
  return { ...result, role: user.role };
}

async function sendResetOtp(mobile) {
  const user = await findUserByMobile(mobile);
  if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");
  if (!user.pin_hash) throw new AppError("PIN not set. Use first-time setup.", 400, "PIN_NOT_SET");
  const result = await otpService.createOtpVerification(mobile, "pin_reset");
  return { ...result, role: user.role };
}

async function verifySetupOtp(mobile, otp) {
  return otpService.verifyOtp(mobile, otp, "pin_setup");
}

async function verifyResetOtp(mobile, otp) {
  return otpService.verifyOtp(mobile, otp, "pin_reset");
}

async function setupPin({ setup_token, pin, confirm_pin }) {
  const decoded = tokenService.verifySetupToken(setup_token, "pin_setup");
  if (!decoded) throw new AppError("Invalid or expired setup token", 401, "INVALID_SETUP_TOKEN");

  if (!pinService.validatePinFormat(pin)) {
    throw new AppError("PIN must be 4 or 6 digits", 400, "INVALID_PIN_FORMAT");
  }

  if (!(await pinService.checkPinMatch(pin, confirm_pin))) {
    throw new AppError("PINs do not match", 400, "PIN_MISMATCH");
  }

  await pinService.setPin(decoded.sub, pin);
  return { success: true, message: "PIN created successfully" };
}

async function resetPin({ setup_token, pin, confirm_pin, device_id, device_model }) {
  const decoded = tokenService.verifySetupToken(setup_token, "pin_reset");
  if (!decoded) throw new AppError("Invalid or expired reset token", 401, "INVALID_SETUP_TOKEN");

  if (!pinService.validatePinFormat(pin)) {
    throw new AppError("PIN must be 4 or 6 digits", 400, "INVALID_PIN_FORMAT");
  }

  if (!(await pinService.checkPinMatch(pin, confirm_pin))) {
    throw new AppError("PINs do not match", 400, "PIN_MISMATCH");
  }

  await pinService.setPin(decoded.sub, pin);

  const { rows } = await pool.query(
    `SELECT id, mobile, name, role FROM users WHERE id = $1`,
    [decoded.sub]
  );
  const user = rows[0];

  const accessToken = tokenService.signAccessToken(user);
  const refreshToken = tokenService.signRefreshToken(user);
  await tokenService.storeRefreshToken(user.id, refreshToken, device_id, device_model);

  return {
    success: true,
    message: "PIN reset successful",
    token: accessToken,
    access_token: accessToken,
    refresh_token: refreshToken,
    role: user.role,
    user_role: user.role,
    user_id: user.id,
    name: user.name,
    user: { id: user.id, name: user.name, mobile: user.mobile },
  };
}

async function refreshAccessToken(refreshToken) {
  const record = await tokenService.validateRefreshToken(refreshToken);
  if (!record) throw new AppError("Invalid or expired refresh token", 401, "INVALID_REFRESH_TOKEN");

  const user = { id: record.id, mobile: record.mobile, role: record.role };
  const accessToken = tokenService.signAccessToken(user);
  return { access: accessToken, access_token: accessToken };
}

async function logout(refreshToken) {
  if (refreshToken) {
    const tokenHash = await tokenService.hashToken(refreshToken);
    await tokenService.revokeRefreshToken(tokenHash);
  }
  return { success: true, message: "Logged out successfully" };
}

module.exports = {
  checkMobileStatus,
  login,
  sendSetupOtp,
  sendResetOtp,
  verifySetupOtp,
  verifyResetOtp,
  setupPin,
  resetPin,
  refreshAccessToken,
  logout,
};
