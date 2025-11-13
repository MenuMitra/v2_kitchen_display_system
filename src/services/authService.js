import axios from "axios";
import { V2_COMMON_BASE } from "../config";

export const authService = {
  // Send OTP
  sendOTP: async (mobileNumber) => {
    try {
      const response = await axios.post(
        `${V2_COMMON_BASE}/login`,
        { mobile: mobileNumber, app_type: "chef" },
        {
          headers: { "Content-Type": "application/json" },
        }
      );
      // Return success with role information
      return {
        success: true,
        role: response.data.role,
        message: response.data.detail,
        app_type: "chef",
      };
    } catch (error) {
      console.error("OTP Send Error:", error);
      let errDetail = error.response?.data?.detail;
      return {
        success: false,
        error:
          typeof errDetail === "string"
            ? errDetail
            : JSON.stringify(errDetail || "Failed to send OTP"),
      };
    }
  },

   // Verify OTP
   verifyOTP: async (mobileNumber, otp) => {
    // Function to generate a random alphanumeric string of specified length
    const generateRandomSessionId = (length) => {
      const chars =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      let sessionId = "";
      for (let i = 0; i < length; i++) {
        sessionId += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return sessionId;
    };

    const deviceId = generateRandomSessionId(10);
    const fcmToken = generateRandomSessionId(12);

    try {
      const response = await axios.post(
        `${V2_COMMON_BASE}/verify_otp`,
        {
          mobile: mobileNumber,
          otp,
          device_id: deviceId,
          device_model: "Laptop 122",
          fcm_token: fcmToken,
          app_type: "chef",
        },
        {
          headers: { "Content-Type": "application/json" },
        }
      );

      const result = response.data;

      // Store auth data in localStorage
      localStorage.setItem(
        "authData",
        JSON.stringify({
          name: result.name,
          user_id: result.user_id,
          outlet_id: result.outlet_id,
          access_token: result.access_token,
          role: result.role,
          device_id: deviceId,
          expires_at: result.expires_at,
        })
      );

      return {
        success: true,
        ...result,
      };
    } catch (error) {
      console.error("OTP Verification Error:", error);
      return {
        success: false,
        error: error.response?.data?.detail || "Failed to verify OTP",
      };
    }
  },
};
