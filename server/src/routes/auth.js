const express = require("express");
const authService = require("../services/authService");
const { validateMobile, validatePin } = require("../middleware/auth");
const { authLimiter, otpLimiter } = require("../middleware/rateLimiter");
const { PinNotSetError } = require("../utils/errors");

const router = express.Router();

router.post("/check-mobile", authLimiter, validateMobile, async (req, res, next) => {
  try {
    const status = await authService.checkMobileStatus(req.body.mobile);
    res.json({ success: true, ...status });
  } catch (err) {
    next(err);
  }
});

router.post("/login", authLimiter, validateMobile, async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    res.json(result);
  } catch (err) {
    if (err instanceof PinNotSetError) {
      return res.status(403).json({
        success: false,
        message: err.message,
        code: "PIN_NOT_SET",
        requires_otp: true,
      });
    }
    next(err);
  }
});

router.post("/verify_pin", authLimiter, validateMobile, async (req, res, next) => {
  try {
    const { pin } = req.body;
    if (!pin) {
      return res.status(400).json({ success: false, message: "PIN is required" });
    }
    const result = await authService.verifyPin(req.body);
    res.json(result);
  } catch (err) {
    if (err instanceof PinNotSetError) {
      return res.status(403).json({
        success: false,
        message: err.message,
        code: "PIN_NOT_SET",
        requires_otp: true,
      });
    }
    next(err);
  }
});

router.post("/otp/send-setup", otpLimiter, validateMobile, async (req, res, next) => {
  try {
    const result = await authService.sendSetupOtp(req.body.mobile);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.post("/otp/send-reset", otpLimiter, validateMobile, async (req, res, next) => {
  try {
    const result = await authService.sendResetOtp(req.body.mobile);
    res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.post("/otp/verify-setup", authLimiter, validateMobile, async (req, res, next) => {
  try {
    const { mobile, otp } = req.body;
    if (!otp || otp.length !== 4) {
      return res.status(400).json({ success: false, message: "Valid 4-digit OTP required" });
    }
    const result = await authService.verifySetupOtp(mobile, otp);
    if (!result.success) return res.status(401).json(result);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/otp/verify-reset", authLimiter, validateMobile, async (req, res, next) => {
  try {
    const { mobile, otp } = req.body;
    if (!otp || otp.length !== 4) {
      return res.status(400).json({ success: false, message: "Valid 4-digit OTP required" });
    }
    const result = await authService.verifyResetOtp(mobile, otp);
    if (!result.success) return res.status(401).json(result);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/pin/setup", authLimiter, validatePin, async (req, res, next) => {
  try {
    const result = await authService.setupPin(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/pin/reset", authLimiter, validatePin, async (req, res, next) => {
  try {
    const result = await authService.resetPin(req.body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/token/refresh", async (req, res, next) => {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) {
      return res.status(400).json({ success: false, message: "Refresh token required" });
    }
    const result = await authService.refreshAccessToken(refresh_token);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post("/logout", async (req, res, next) => {
  try {
    const result = await authService.logout(req.body.refresh_token);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Backward-compatible alias matching v2.2/common/login path shape
router.post("/common/login", authLimiter, validateMobile, async (req, res, next) => {
  try {
    const result = await authService.login(req.body);
    res.json(result);
  } catch (err) {
    if (err instanceof PinNotSetError) {
      const otpResult = await authService.sendSetupOtp(req.body.mobile);
      return res.json({
        detail: otpResult.message || "Your OTP is sent successfully.",
        role: otpResult.role,
        requires_pin_setup: true,
      });
    }
    if (err.code === "INVALID_PIN") {
      return res.status(401).json({ success: false, message: "Invalid PIN" });
    }
    next(err);
  }
});

module.exports = router;
