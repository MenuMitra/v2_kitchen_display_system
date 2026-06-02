class AppError extends Error {
  constructor(message, statusCode = 400, code = "BAD_REQUEST") {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
  }
}

class InvalidPinError extends AppError {
  constructor(attemptsRemaining) {
    super("Invalid PIN", 401, "INVALID_PIN");
    this.attemptsRemaining = attemptsRemaining;
  }
}

class AccountLockedError extends AppError {
  constructor(lockedUntil) {
    super("Account temporarily locked due to multiple failed attempts", 423, "ACCOUNT_LOCKED");
    this.lockedUntil = lockedUntil;
  }
}

class PinNotSetError extends AppError {
  constructor() {
    super("PIN not configured. OTP verification required.", 403, "PIN_NOT_SET");
  }
}

module.exports = { AppError, InvalidPinError, AccountLockedError, PinNotSetError };
