const AUTH_KEYS = [
  "access_token",
  "refresh_token",
  "user_id",
  "user_role",
  "name",
  "device_id",
  "fcm_token",
  "token",
  "role",
  "last_activity",
  "expires_on",
];

export function saveAuthSession(data, { clearOutlet = true } = {}) {
  const payload = {
    ...data,
    access_token: data.access_token || data.token || data.access,
    user_role: data.user_role || data.role,
    last_activity: Date.now(),
  };

  if (payload.refresh_token || payload.refresh) {
    localStorage.setItem(
      "refresh_token",
      String(payload.refresh_token || payload.refresh)
    );
  }

  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (clearOutlet && (key === "outlet_id" || key === "outlet_name")) return;
    if (key === "refresh" && payload.refresh_token) return;
    localStorage.setItem(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  });

  if (clearOutlet) {
    localStorage.removeItem("outlet_id");
    localStorage.removeItem("outlet_name");
  }

  sessionStorage.setItem("kds_fresh_login", "1");
}

export function clearAuthSession() {
  AUTH_KEYS.forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem("outlet_id");
  localStorage.removeItem("outlet_name");
  sessionStorage.removeItem("kds_fresh_login");
}

export function isAuthenticated() {
  return !!localStorage.getItem("access_token");
}

export function getAccessToken() {
  return localStorage.getItem("access_token");
}

export function getRefreshToken() {
  return localStorage.getItem("refresh_token");
}

/** Clear session and send user to login (prevents login ↔ orders redirect loop on 401). */
export function logoutAndRedirect(navigate) {
  clearAuthSession();
  if (typeof navigate === "function") {
    navigate("/login", { replace: true });
  }
}
