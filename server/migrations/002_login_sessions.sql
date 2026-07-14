-- Pending login sessions for two-step PIN flow (verify_pin step 2)
CREATE TABLE IF NOT EXISTS login_sessions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mobile VARCHAR(15) NOT NULL,
  device_id VARCHAR(255) NOT NULL,
  device_model VARCHAR(255),
  app_type VARCHAR(32) NOT NULL DEFAULT 'kds',
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired')),
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (mobile, device_id, app_type)
);

CREATE INDEX IF NOT EXISTS idx_login_sessions_lookup
  ON login_sessions (mobile, device_id, app_type, status);
