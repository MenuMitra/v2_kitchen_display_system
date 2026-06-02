const crypto = require("crypto");
const config = require("../config");
const pool = require("../db/pool");
const { hashOtp, generateSetupToken } = require("./tokenService");
const logger = require("../utils/logger");

function generateOtp() {
  return String(crypto.randomInt(1000, 9999));
}

async function sendOtpSms(mobile, otp) {
  // Integrate with SMS provider (Twilio, MSG91, etc.) in production
  logger.info("OTP generated for delivery", { mobile: mobile.slice(-4).padStart(10, "*"), otp: config.nodeEnv === "development" ? otp : "[redacted]" });
}

async function createOtpVerification(mobile, purpose) {
  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  const expiresAt = new Date(Date.now() + config.otp.expiryMinutes * 60 * 1000);

  await pool.query(
    `DELETE FROM otp_verifications WHERE mobile = $1 AND purpose = $2`,
    [mobile, purpose]
  );

  await pool.query(
    `INSERT INTO otp_verifications (mobile, otp_hash, purpose, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [mobile, otpHash, purpose, expiresAt]
  );

  await sendOtpSms(mobile, otp);

  return { message: "Your OTP is sent successfully." };
}

async function verifyOtp(mobile, otp, purpose) {
  const { rows } = await pool.query(
    `SELECT * FROM otp_verifications
     WHERE mobile = $1 AND purpose = $2 AND expires_at > NOW()
     ORDER BY created_at DESC LIMIT 1`,
    [mobile, purpose]
  );

  if (!rows.length) {
    return { success: false, message: "OTP expired or not found. Please request a new one." };
  }

  const record = rows[0];

  if (record.attempts >= config.otp.maxAttempts) {
    return { success: false, message: "Too many OTP attempts. Please request a new OTP." };
  }

  const otpHash = hashOtp(otp);
  if (otpHash !== record.otp_hash) {
    await pool.query(
      `UPDATE otp_verifications SET attempts = attempts + 1 WHERE id = $1`,
      [record.id]
    );
    return { success: false, message: "Invalid OTP" };
  }

  await pool.query(`DELETE FROM otp_verifications WHERE id = $1`, [record.id]);

  const { rows: userRows } = await pool.query(
    `SELECT id, mobile, name, role FROM users WHERE mobile = $1`,
    [mobile]
  );

  if (!userRows.length) {
    return { success: false, message: "User not found" };
  }

  const user = userRows[0];
  const setupToken = generateSetupToken(user.id, purpose);

  return {
    success: true,
    message: "OTP verified successfully",
    setup_token: setupToken,
    user: { id: user.id, name: user.name, mobile: user.mobile, role: user.role },
  };
}

module.exports = { createOtpVerification, verifyOtp, sendOtpSms };
