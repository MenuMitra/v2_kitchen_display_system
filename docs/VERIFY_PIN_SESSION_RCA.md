# verify_pin — "No active login session found" RCA

## Summary

On **menusmitra.xyz (testing)**, `POST /v2.3/common/verify_pin` is **step 2** of a two-step login. It does **not** authenticate from scratch. It requires a pending session created by `POST /v2.3/common/login` (mobile only, no PIN).

On **menu4.xyz (production)**, `verify_pin` for KDS/admin users works as a **single-step** login (PIN validation + token in one call).

The customer app failure is caused by calling `verify_pin` without calling `/login` first on the testing environment.

---

## Live API trace (menusmitra.xyz)

### Failing flow (customer app)

```http
POST /v2.3/common/verify_pin
{
  "mobile": "8696699696",
  "pin": "6677",
  "app_type": "customer",
  "device_id": "17804923422398654",
  "device_model": "Google Pixel 9",
  "device_type": "Mobile Phone"
}
```

**Response (404):**

```json
{
  "success": false,
  "message": "USER_49899 - 404 - No active login session found. Please login first."
}
```

**Failure point:** Session lookup runs **before** PIN validation. No row exists for `(mobile, device_id, app_type)` → immediate 404.

### Working flow (two-step)

**Step 1 — create session:**

```http
POST /v2.3/common/login
{
  "mobile": "8696699696",
  "app_type": "customer",
  "device_id": "17804923422398654",
  "device_model": "Google Pixel 9",
  "device_type": "Mobile Phone"
}
```

**Response (200):**

```json
{ "role": "customer" }
```

**Step 2 — verify PIN (same mobile, device_id, app_type):**

```http
POST /v2.3/common/verify_pin
{ ...same fields plus pin... }
```

**Response (200):**

```json
{
  "user_id": 891,
  "name": "fgd",
  "role": "customer",
  "outlet_id": null,
  "access_token": "<jwt>",
  "expires_on": "14 Aug 2026"
}
```

### Session binding rules (verified)

| Rule | Result |
|------|--------|
| `device_id` must match between `/login` and `/verify_pin` | Mismatch → 404 session not found |
| `app_type` must match | `login: customer` + `verify_pin: kds` → 404 |
| Fresh device, `verify_pin` only | 404 session not found |
| Wrong PIN after valid session | 400 Invalid PIN (session exists, PIN checked) |

---

## Why KDS "works" but customer fails

| Factor | Working KDS request | Failing customer request |
|--------|---------------------|--------------------------|
| Environment | Likely **menu4.xyz production** | **menusmitra.xyz testing** |
| Prior `/login` call | Not required on production KDS | **Required** on testing |
| User role | `admin` with outlet mapping | `customer` |
| `app_type` | `kds` | `customer` |

Production KDS (`menu4.xyz`) with a fresh `device_id` returns 200 from `verify_pin` alone — no session prerequisite.

Testing (`menusmitra.xyz`) enforces two-step for **all** app types including `customer`, `kds`, and `admin`.

---

## Backend architecture (inferred from API behavior)

```
verify_pin controller
  ├─ validate request (mobile, pin, app_type, device_id)
  ├─ lookup login_sessions WHERE mobile=? AND device_id=? AND app_type=? AND status='pending'
  │     └─ NOT FOUND → 404 "No active login session found"  ← FAILURE HERE
  ├─ validate PIN against user record
  ├─ mark session active / create refresh token
  └─ return JWT + user payload
```

Expected table (approximate):

```sql
SELECT * FROM login_sessions
WHERE mobile = $1
  AND device_id = $2
  AND app_type = $3
  AND status = 'pending'
  AND expires_at > NOW();
```

`/login` (no PIN) inserts/updates this row after confirming the user exists.

---

## Required backend fix (menusmitra.xyz)

**Option A — Client fix (immediate):** Customer app must call `/login` then `/verify_pin`.

**Option B — Backend fix (recommended):** In `verify_pin`, if no pending session exists, fall through to full authentication instead of failing:

```python
# Pseudocode — verify_pin controller
session = find_pending_session(mobile, device_id, app_type)

if not session:
    user = find_user_by_mobile(mobile)
    if not user:
        raise NotFound("User with this mobile number does not exist")
    # Continue to PIN validation — do NOT require pre-session
else:
    user = session.user

verify_pin_hash(user, pin)
session = create_or_activate_session(user, device_id, app_type)
token = generate_jwt(user, device_id, app_type)
return LoginResponse(success=True, token=token, ...)
```

Align testing with production so `verify_pin` is self-contained.

---

## KDS frontend integration

`src/services/authService.js` calls `POST /login` before `POST /verify_pin` on remote APIs. This matches the testing environment contract and is safe on production.
