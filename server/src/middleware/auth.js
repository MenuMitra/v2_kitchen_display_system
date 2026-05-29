const jwt = require("jsonwebtoken");
const config = require("../config");
const { AppError } = require("../utils/errors");

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "Authentication required" });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    if (decoded.type !== "access") {
      return res.status(401).json({ success: false, message: "Invalid token type" });
    }
    req.user = decoded;
    next();
  } catch (err) {
    const message = err.name === "TokenExpiredError" ? "Session expired. Please login again." : "Invalid token";
    return res.status(401).json({ success: false, message });
  }
}

function validateMobile(req, res, next) {
  const mobile = req.body.mobile;
  if (!mobile || !/^[6-9]\d{9}$/.test(String(mobile))) {
    return res.status(400).json({ success: false, message: "Valid 10-digit mobile number required" });
  }
  next();
}

function validatePin(req, res, next) {
  const { pin, confirm_pin } = req.body;
  const lengths = config.pin.allowedLengths;

  if (pin && !lengths.includes(String(pin).length)) {
    return res.status(400).json({ success: false, message: "PIN must be 4 or 6 digits" });
  }

  if (confirm_pin !== undefined && pin !== confirm_pin) {
    return res.status(400).json({ success: false, message: "PINs do not match" });
  }

  next();
}

function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    const body = { success: false, message: err.message, code: err.code };
    if (err.attemptsRemaining !== undefined) body.attempts_remaining = err.attemptsRemaining;
    if (err.lockedUntil) body.locked_until = err.lockedUntil;
    return res.status(err.statusCode).json(body);
  }

  if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }

  console.error(err);
  res.status(500).json({ success: false, message: "Internal server error" });
}

module.exports = { authenticate, validateMobile, validatePin, errorHandler };
