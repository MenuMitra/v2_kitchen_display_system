import axios from "axios";
import { AUTH_API_BASE, AUTH_APP_TYPE, APP_INFO } from "../config";
import { getDevicePayload, isRememberDevice } from "../utils/deviceService";

const isLocalAuthServer = AUTH_API_BASE.includes("/api/auth");

function authUrl(path) {
  return `${AUTH_API_BASE}${path}`;
}

function verifyPinUrl() {
  return isLocalAuthServer ? authUrl("/login") : authUrl("/verify_pin");
}

function verifyPinPayload(mobile, pin) {
  if (isLocalAuthServer) {
    return {
      mobile,
      pin,
      app_type: "kds",
      version: APP_INFO.version,
      role: ["admin", "chef", "super_owner"],
      ...getDevicePayload(),
      remember_device: isRememberDevice(),
    };
  }

  return {
    mobile,
    pin,
    app_type: AUTH_APP_TYPE,
    ...getDevicePayload(),
  };
}

function parseError(error) {
  const data = error.response?.data;
  const detail =
    typeof data?.detail === "string"
      ? data.detail
      : Array.isArray(data?.detail)
      ? data.detail.map((d) => d.msg || d).join(", ")
      : null;
  return {
    message: data?.message || detail || "Something went wrong. Please try again.",
    code: data?.code,
    attemptsRemaining: data?.attempts_remaining,
    lockedUntil: data?.locked_until,
    requiresOtp: data?.requires_otp || data?.requires_pin_setup,
  };
}

/** Normalize verify_pin / login responses */
function normalizeLoginResponse(data) {
  if (!data || typeof data !== "object") return null;

  if (data.success === false) {
    return {
      success: false,
      message: data.message || "Invalid PIN",
      code: data.code,
    };
  }

  const accessToken = data.access_token || data.token || data.access;
  if (!accessToken) {
    return null;
  }

  const devicePayload = getDevicePayload();

  return {
    success: true,
    ...data,
    ...devicePayload,
    access_token: accessToken,
    user_role: data.role,
    user_id: data.user_id,
    name: data.name,
    outlet_id: data.outlet_id,
    expires_on: data.expires_on,
    role: data.role,
  };
}

export const authService = {
  checkMobile: async (mobile) => {
    if (!isLocalAuthServer) {
      return { success: true, exists: true, has_pin: true, locked: false };
    }
    try {
      const { data } = await axios.post(authUrl("/check-mobile"), { mobile });
      return data;
    } catch (error) {
      return { success: false, ...parseError(error) };
    }
  },

  loginWithPin: async (mobile, pin) => {
    try {
      const response = await axios.post(verifyPinUrl(), verifyPinPayload(mobile, pin));

      const normalized = normalizeLoginResponse(response.data);
      if (normalized?.success) {
        return normalized;
      }
      if (normalized?.success === false) {
        return normalized;
      }

      const data = response.data;
      const detail =
        typeof data?.detail === "string"
          ? data.detail
          : Array.isArray(data?.detail)
          ? data.detail.map((d) => d.msg || d).join(", ")
          : "";

      return {
        success: false,
        message: data?.message || detail || "Invalid PIN. Please try again.",
      };
    } catch (error) {
      return { success: false, ...parseError(error) };
    }
  },

  sendSetupOtp: async (mobile) => {
    try {
      const endpoint = isLocalAuthServer ? "/otp/send-setup" : "/login";
      const postUrl = authUrl(endpoint);
      const { data } = await axios.post(postUrl, {
        mobile,
        ...(isLocalAuthServer
          ? { app_type: "kds", version: APP_INFO.version }
          : {
              role: ["admin", "chef", "super_owner"],
              app_type: "kds",
              version: APP_INFO.version,
            }),
        ...getDevicePayload(),
      });
      return {
        success: true,
        message: data.message || data.detail || "OTP sent successfully",
        role: data.role,
      };
    } catch (error) {
      return { success: false, ...parseError(error) };
    }
  },

  sendResetOtp: async (mobile) => {
    try {
      const endpoint = isLocalAuthServer ? "/otp/send-reset" : "/login";
      const postUrl = authUrl(endpoint);
      const { data } = await axios.post(postUrl, {
        mobile,
        ...(isLocalAuthServer
          ? { app_type: "kds", version: APP_INFO.version }
          : {
              role: ["admin", "chef", "super_owner"],
              app_type: "kds",
              version: APP_INFO.version,
            }),
        ...getDevicePayload(),
      });
      return {
        success: true,
        message: data.message || data.detail || "OTP sent successfully",
        role: data.role,
      };
    } catch (error) {
      return { success: false, ...parseError(error) };
    }
  },

  verifySetupOtp: async (mobile, otp) => {
    try {
      const endpoint = isLocalAuthServer ? "/otp/verify-setup" : "/verify_otp";
      const postUrl = authUrl(endpoint);
      const { data } = await axios.post(postUrl, {
        mobile,
        otp,
        app_type: "kds",
        version: APP_INFO.version,
        ...getDevicePayload(),
        fcm_token: "dummy_fcm_token",
      });

      if (data.success === false) {
        return { success: false, message: data.message || "Invalid OTP" };
      }

      if (data.setup_token) {
        return {
          success: true,
          setupToken: data.setup_token,
          user: data.user,
        };
      }

      if (data.access_token) {
        return {
          success: true,
          needsPinSetup: true,
          access_token: data.access_token,
          ...data,
          user_role: data.role,
        };
      }

      return { success: false, message: "Invalid OTP" };
    } catch (error) {
      return { success: false, ...parseError(error) };
    }
  },

  verifyResetOtp: async (mobile, otp) => {
    try {
      const endpoint = isLocalAuthServer ? "/otp/verify-reset" : "/verify_otp";
      const postUrl = authUrl(endpoint);
      const { data } = await axios.post(postUrl, {
        mobile,
        otp,
        app_type: "kds",
        version: APP_INFO.version,
        ...getDevicePayload(),
        fcm_token: "dummy_fcm_token",
      });

      if (data.success === false) {
        return { success: false, message: data.message || "Invalid OTP" };
      }

      return {
        success: true,
        setupToken: data.setup_token,
        user: data.user,
      };
    } catch (error) {
      return { success: false, ...parseError(error) };
    }
  },

  setupPin: async (setupToken, pin, confirmPin) => {
    try {
      const { data } = await axios.post(authUrl("/pin/setup"), {
        setup_token: setupToken,
        pin,
        confirm_pin: confirmPin,
      });
      return { success: true, ...data };
    } catch (error) {
      return { success: false, ...parseError(error) };
    }
  },

  resetPin: async (setupToken, pin, confirmPin) => {
    try {
      const { data } = await axios.post(authUrl("/pin/reset"), {
        setup_token: setupToken,
        pin,
        confirm_pin: confirmPin,
        ...getDevicePayload(),
      });

      const normalized = normalizeLoginResponse(data);
      if (normalized?.success) {
        return normalized;
      }

      return { success: true, ...data };
    } catch (error) {
      return { success: false, ...parseError(error) };
    }
  },

  refreshToken: async (refreshToken) => {
    try {
      const { data } = await axios.post(authUrl("/token/refresh"), {
        refresh_token: refreshToken,
      });
      return {
        success: true,
        access_token: data.access || data.access_token,
      };
    } catch (error) {
      return { success: false, ...parseError(error) };
    }
  },

  logout: async (refreshToken) => {
    try {
      await axios.post(authUrl("/logout"), { refresh_token: refreshToken });
      return { success: true };
    } catch {
      return { success: true };
    }
  },
};
