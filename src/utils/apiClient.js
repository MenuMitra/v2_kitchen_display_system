/**
 * Shared auth headers and session fields for MenuMitra APIs.
 * verify_pin (v2.3) binds the JWT to device_id — all authenticated calls must send the same device_id.
 */

export function getAccessToken() {
  return localStorage.getItem("access_token") || "";
}

export function getDeviceId() {
  return localStorage.getItem("device_id") || "";
}

export function getUserId() {
  return localStorage.getItem("user_id") || "";
}

export function buildAuthHeaders(extra = {}) {
  const token = getAccessToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

/** device_id + user_id — required on most authenticated MenuMitra APIs */
export function getDeviceSessionFields() {
  const deviceId = getDeviceId();
  const userId = getUserId();

  return {
    ...(userId ? { user_id: userId } : {}),
    ...(deviceId ? { device_id: deviceId, device_token: deviceId } : {}),
  };
}

/** get_outlet_list and other admin-panel APIs */
export function getAdminSessionBody(extra = {}) {
  const userId = getUserId();

  return {
    ...getDeviceSessionFields(),
    ...(userId ? { owner_id: String(userId) } : {}),
    app_source: "admin",
    ...extra,
  };
}

/** Logout body — must match verify_pin token (app_type: admin) */
export function getLogoutBody() {
  const userId = getUserId();
  const userRole =
    localStorage.getItem("user_role") || localStorage.getItem("role") || "admin";
  const deviceId = getDeviceId();

  return {
    ...(userId ? { user_id: userId } : {}),
    role: userRole,
    app: "admin",
    app_type: "admin",
    app_source: "admin",
    device_token: deviceId,
    device_id: deviceId,
  };
}
