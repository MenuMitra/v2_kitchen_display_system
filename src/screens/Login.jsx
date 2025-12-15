import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import axios from "axios";
import { ENV } from "../config/env";
import { APP_INFO, V2_COMMON_BASE } from "../config"; 

function Login() {
  const [mobileNumber, setMobileNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [otpValues, setOtpValues] = useState(["", "", "", ""]);
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0); // Seconds remaining for cooldown
  const navigate = useNavigate();
  const otpRefs = [useRef(), useRef(), useRef(), useRef()];

  // Redirect to orders if already logged in (run once on mount)
  // Handle resend OTP cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setError("");

    if (!mobileNumber || mobileNumber.length !== 10) {
      setError("Please enter a valid 10-digit mobile number");
      return;
    }

    try {
      setLoading(true);
      const response = await axios.post(`${V2_COMMON_BASE}/login`, {
        mobile: mobileNumber,
        role: ["admin", "chef", "super_owner"],
        app_type: "kds",
        version: APP_INFO.version,
      });

      if (response.data.detail && response.data.detail.includes("successfully")) {
        setShowOtpInput(true);
        setResendCooldown(30); // Start cooldown timer for resend OTP
        localStorage.setItem("user_role", response.data.user_role || response.data.role || "");
      } else {
        setError(response.data.detail || "Failed to send OTP");
      }
    } catch (error) {
      setError(error.response?.data?.detail || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    if (resendCooldown > 0) return; // Block resending while cooldown active
    setError("");
    try {
      setLoading(true);
      const response = await axios.post(`${V2_COMMON_BASE}/login`, {
        mobile: mobileNumber,
        role: ["admin", "chef", "super_owner"],
        app_type: "kds",
        version: APP_INFO.version,
      });

      if (response.data.detail && response.data.detail.includes("successfully")) {
        setResendCooldown(30);
      } else {
        setError(response.data.detail || "Failed to resend OTP");
      }
    } catch (error) {
      setError(error.response?.data?.detail || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const generateRandomSessionId = (length) => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    return Array.from({ length }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join("");
  };

  const handleOtpChange = (index, value) => {
    if (value.length > 1) value = value[0];
    if (!/^\d*$/.test(value)) return;

    const newOtpValues = [...otpValues];
    newOtpValues[index] = value;
    setOtpValues(newOtpValues);

    if (value !== "" && index < 3) {
      otpRefs[index + 1].current.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otpValues[index] && index > 0) {
      otpRefs[index - 1].current.focus();
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setError("");

    const otp = otpValues.join("");
    if (!otp || otp.length !== 4) {
      setError("Please enter a valid 4-digit OTP");
      return;
    }

    try {
      setLoading(true);
      const deviceSessId = generateRandomSessionId(20);
      const fcmToken = "dummy_fcm_token";

      const response = await axios.post(`${V2_COMMON_BASE}/verify_otp`, {
        mobile: mobileNumber,
        otp: otp,
        fcm_token: fcmToken,
        device_id: deviceSessId,
        device_model: "web",
        app_type: "kds",
        version: APP_INFO.version,
      });

      if (response.data && response.data.access_token) {
        const userData = {
          ...response.data,
          device_id: deviceSessId,
          fcm_token: fcmToken,
          last_activity: new Date().getTime(),
        };

        Object.entries(userData).forEach(([key, value]) => {
          localStorage.setItem(key, typeof value === "object" ? JSON.stringify(value) : value.toString());
        });

        localStorage.setItem("outlet_id", response.data.outlet_id);
        navigate("/orders");
      } else {
        setError("Invalid response from server");
      }
    } catch (error) {
      setError(error.response?.data?.detail || "Failed to verify OTP");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#f7f8fc] p-4">
        <div className="w-full max-w-md sm:max-w-lg lg:max-w-xl bg-white rounded-2xl shadow-[0_4px_16px_0_rgba(0,0,0,0.12)] p-8 sm:p-10 lg:p-12 border border-gray-300 mt-10">
          <div className="flex flex-col items-center justify-center">
            <div className="flex justify-center mb-4">
              <Link to="/" className="flex flex-col items-center no-underline">
                <span className="flex items-center justify-center">
                  <img src={logo} alt="MenuMitra" className="w-10 h-10 sm:w-12 sm:h-12 object-contain" />
                </span>
                <span className="text-2xl sm:text-3xl font-semibold text-gray-800 mt-3">MenuMitra</span>
              </Link>
            </div>
            <div className="flex flex-col justify-center items-center mt-1 text-center">
              <span className="text-xl sm:text-2xl font-semibold text-gray-800">Kitchen Display System</span>
              <p className="mt-2 text-gray-500 text-sm sm:text-base">Sign in to continue to your account</p>
            </div>
            <div className="w-full mt-1">
              <form id="formAuthentication" className="mb-1 w-full p-1" onSubmit={showOtpInput ? handleVerifyOTP : handleSendOTP} noValidate>
                {!showOtpInput ? (
                  <div className="mb-3 w-full px-0 sm:px-4">
                    <div>
                      <label htmlFor="mobile" className="block text-gray-700 font-medium mb-1">Mobile Number <span className="text-red-500">*</span></label>
                    </div>
                    <input
                      type="text"
                      className="w-full h-[55px] px-4 py-3 text-xl border border-gray-800 rounded-3xl focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder-gray-400"
                      id="mobile"
                      name="mobile"
                      placeholder="Enter your mobile number"
                      value={mobileNumber}
                      onChange={(e) => {
                        const input = e.target.value.replace(/\D/g, "").slice(0, 10);
                        if (/^[0-5]/.test(input)) {
                          setError("Mobile number must start with 6-9");
                          return;
                        } else {
                          setError("");
                        }
                        setMobileNumber(input);
                      }}
                      autoFocus
                    />
                    
                    {error && <p className="text-red-500 text-sm mt-1" role="alert">{error}</p>}
                    
                  </div>
                ) : (
                  <>
                    {error && (
                      <div className="flex justify-center px-2 mb-4">
                        <div
                          role="alert"
                          className="w-full max-w-[420px] bg-red-100 text-red-800 border border-red-200 rounded-lg px-3 py-2 text-center text-sm"
                        >
                          {error}
                        </div>
                      </div>
                    )}
                    <div className="text-center mt-2 mb-3 text-gray-700">Enter 4-digit Verification code </div>
                    <div className="flex justify-center gap-4 mb-4 px-2">
                      {otpValues.map((value, index) => (
                        <input
                          key={index}
                          ref={otpRefs[index]}
                          type="text"
                          className="w-[40px] h-[40px] sm:w-[60px] sm:h-[60px] text-center text-2xl sm:text-3xl border border-2 border-gray-300 rounded-3xl focus:outline-none focus:ring-2 focus:ring-primary"
                          value={value}
                          onChange={(e) => handleOtpChange(index, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(index, e)}
                          maxLength={1}
                          autoFocus={index === 0}
                        />

                      ))}
                    </div>
                  

                    <div className="flex flex-col sm:flex-row justify-between align-items-center w-full px-2 sm:px-8 mb-4 gap-2 sm:gap-0">
                      <button
                        type="button"
                        onClick={handleResendOTP}
                        disabled={resendCooldown > 0}
                        className={`text-base font-medium rounded-3xl focus:outline-none hover:underline bg-transparent border-none p-0 ${resendCooldown > 0 ? 'text-gray-400 cursor-not-allowed' : 'text-blue-600 cursor-pointer'}`}
                      >
                        {resendCooldown > 0 ? `Resend OTP (${resendCooldown}s)` : "Resend OTP"}
                      </button>
                      <button
                        className="text-base font-medium rounded-3xl focus:outline-none hover:underline bg-transparent border-none p-0 text-blue-600 cursor-pointer"
                        type="button"
                        onClick={() => {
                          setShowOtpInput(false);
                          setOtpValues(["", "", "", ""]);
                          setError("");
                        }}
                      >
                        Back to login
                      </button>
                    </div>

                  </>
                )}

                <div className="mb-1 w-full px-0 sm:px-4">
                  <button
                    className={`w-full h-[55px] rounded-3xl text-white text-lg font-medium transition-colors duration-200 ${
                      showOtpInput
                        ? "bg-primary hover:bg-blue-700"
                        : mobileNumber.length === 10
                        ? "bg-primary hover:bg-blue-700"
                        : "bg-secondary cursor-not-allowed"
                    }`}
                    type="submit"
                    disabled={!showOtpInput && mobileNumber.length !== 10} 
                  >
                    {showOtpInput ? "Verify OTP" : "Send OTP"}
                  </button>

                </div>
              </form>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-4 sm:gap-6 mt-4 border-b border-gray-300 pb-4 mb-4">
            <a className="text-gray-500 hover:text-gray-700 no-underline text-sm sm:text-base" href="https://menumitra.com/" target="_blank" rel="noopener noreferrer">
              Home
            </a>
            <a className="text-gray-500 hover:text-gray-700 no-underline text-sm sm:text-base" href="https://menumitra.com/book-demo" target="_blank" rel="noopener noreferrer">
              Book a demo
            </a>
            <a className="text-gray-500 hover:text-gray-700 no-underline text-sm sm:text-base" href="https://menumitra.com/contact" target="_blank" rel="noopener noreferrer">
              Contact
            </a>
            <a className="text-gray-500 hover:text-gray-700 no-underline text-sm sm:text-base" href="https://menumitra.com/customer-care" target="_blank" rel="noopener noreferrer">
              Support
            </a>
          </div>

          <div className="pt-2">
            <div className="flex flex-col items-center justify-center">
              
              <div className="flex justify-center gap-3 mb-3">
                <a href="https://menumitra.com/" className="w-[42px] h-[42px] rounded-full border-2 border-gray-200 flex items-center justify-center text-green-600 text-xl hover:text-blue-500 hover:border-blue-500 hover:shadow-md transition-all duration-300 no-underline" target="_blank" rel="noopener noreferrer" aria-label="Google">
                  <i className="ri-google-fill" />
                </a>
                <a href="https://www.facebook.com/people/Menu-Mitra/61565082412478/" className="w-[42px] h-[42px] rounded-full border-2 border-gray-200 flex items-center justify-center text-blue-600 text-xl hover:text-blue-600 hover:border-blue-600 hover:shadow-md transition-all duration-300 no-underline" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
                  <i className="ri-facebook-fill" />
                </a>
                <a href="https://www.instagram.com/menumitra/" className="w-[42px] h-[42px] rounded-full border-2 border-gray-200 flex items-center justify-center text-pink-600 text-xl hover:text-pink-600 hover:border-pink-600 hover:shadow-md transition-all duration-300 no-underline" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                  <i className="ri-instagram-fill" />
                </a>
                <a href="https://www.youtube.com/@menumitra" className="w-[42px] h-[42px] rounded-full border-2 border-gray-200 flex items-center justify-center text-red-600 text-xl hover:text-red-600 hover:border-red-600 hover:shadow-md transition-all duration-300 no-underline" target="_blank" rel="noopener noreferrer" aria-label="YouTube">
                  <i className="ri-youtube-fill" />
                </a>
               
              </div>
              <div className="text-center text-gray-500 text-xs sm:text-sm">
                Version {APP_INFO.version} <span className="mx-2">|</span> {APP_INFO.releaseDate}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default Login;
