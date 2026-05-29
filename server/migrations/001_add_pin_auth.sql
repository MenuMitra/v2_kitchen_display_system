-- PIN-based authentication columns for users table
-- Run against your existing PostgreSQL database

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255),
  ADD COLUMN IF NOT EXISTS failed_attempts INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP NULL;

-- OTP verification tokens for PIN setup / reset flows
CREATE TABLE IF NOT EXISTS otp_verifications (
  id SERIAL PRIMARY KEY,
  mobile VARCHAR(15) NOT NULL,
  otp_hash VARCHAR(255) NOT NULL,
  purpose VARCHAR(20) NOT NULL CHECK (purpose IN ('pin_setup', 'pin_reset')),
  attempts INT DEFAULT 0,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_otp_verifications_mobile ON otp_verifications(mobile);

-- Refresh token storage for session management
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash VARCHAR(255) NOT NULL,
  device_id VARCHAR(255),
  device_model VARCHAR(255),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  revoked_at TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);

-- Trusted devices for "remember this device"
CREATE TABLE IF NOT EXISTS trusted_devices (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  device_id VARCHAR(255) NOT NULL,
  device_model VARCHAR(255),
  last_used_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP NOT NULL,
  UNIQUE(user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_trusted_devices_user_device ON trusted_devices(user_id, device_id);
