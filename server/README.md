# KDS Auth Server

PIN-based authentication server for the Kitchen Display System.

## Setup

```bash
cd server
cp .env.example .env
# Edit .env with your DATABASE_URL and JWT_SECRET
npm install
```

## Database Migration

```bash
psql $DATABASE_URL -f migrations/001_add_pin_auth.sql
```

## Run

```bash
npm run dev   # development with auto-reload
npm start     # production
```

Server runs on `http://localhost:3001` by default.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login with mobile + PIN |
| POST | `/api/auth/check-mobile` | Check if user has PIN set |
| POST | `/api/auth/otp/send-setup` | Send OTP for first-time PIN setup |
| POST | `/api/auth/otp/send-reset` | Send OTP for forgot PIN |
| POST | `/api/auth/otp/verify-setup` | Verify OTP for PIN setup |
| POST | `/api/auth/otp/verify-reset` | Verify OTP for PIN reset |
| POST | `/api/auth/pin/setup` | Create PIN after OTP verification |
| POST | `/api/auth/pin/reset` | Reset PIN and auto-login |
| POST | `/api/auth/token/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Revoke refresh token |

## Login Example

```json
POST /api/auth/login
{
  "mobile": "9876543210",
  "pin": "1234",
  "app_type": "kds",
  "version": "2.2.0",
  "device_id": "DEVICE123",
  "device_model": "web"
}
```

## Security

- PINs hashed with bcrypt (12 rounds)
- Account lockout after 5 failed attempts (15 min)
- JWT access + refresh tokens
- Rate limiting on auth and OTP endpoints
- OTP hashed with SHA-256 in database
