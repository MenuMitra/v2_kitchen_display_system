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

  // Add responsive styles
  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = `
      /* Mobile devices (max-width: 575.98px) */
      @media (max-width: 575.98px) {
        .responsive-login-card {
          min-width: 100% !important;
          max-width: 100% !important;
          padding: 0.75rem !important;
        }
        .responsive-login-logo {
          width: 32px !important;
          height: 32px !important;
        }
        .responsive-login-brand-text {
          font-size: 1.25rem !important;
        }
        .responsive-login-title {
          font-size: 1rem !important;
        }
        .responsive-login-subtitle {
          font-size: 0.875rem !important;
        }
        .responsive-login-form-container {
          padding-left: 0.5rem !important;
          padding-right: 0.5rem !important;
        }
        .responsive-otp-container {
          gap: 0.5rem !important;
        }
        .responsive-otp-input {
          width: 50px !important;
          height: 50px !important;
          font-size: 1.25rem !important;
        }
        .responsive-otp-buttons {
          flex-direction: column !important;
          gap: 0.5rem !important;
          margin-left: 0 !important;
          margin-right: 0 !important;
          padding: 0 0.5rem !important;
        }
        .responsive-otp-button {
          width: 100% !important;
          text-align: center !important;
          font-size: 0.875rem !important;
        }
        .responsive-error-container {
          max-width: 100% !important;
          padding: 8px 10px !important;
          font-size: 0.875rem !important;
        }
        .responsive-links-container {
          flex-wrap: wrap !important;
          gap: 0.5rem !important;
        }
        .responsive-links-container p {
          font-size: 0.75rem !important;
          margin: 0 !important;
        }
        .responsive-submit-button {
          height: 42px !important;
          font-size: 0.95rem !important;
        }
      }
      
      /* Tablet devices (576px - 991.98px) */
      @media (min-width: 576px) and (max-width: 991.98px) {
        .responsive-login-card {
          min-width: 90% !important;
          max-width: 600px !important;
        }
        .responsive-login-logo {
          width: 36px !important;
          height: 36px !important;
        }
        .responsive-login-brand-text {
          font-size: 1.5rem !important;
        }
        .responsive-login-title {
          font-size: 1.25rem !important;
        }
        .responsive-otp-input {
          width: 60px !important;
          height: 60px !important;
          font-size: 1.5rem !important;
        }
        .responsive-otp-buttons {
          margin-left: 2rem !important;
          margin-right: 2rem !important;
        }
        .responsive-error-container {
          max-width: 90% !important;
        }
      }
      
      /* Desktop devices (min-width: 992px) */
      @media (min-width: 992px) {
        .responsive-login-card {
          min-width: 550px !important;
          max-width: 800px !important;
        }
      }
    `;
    document.head.appendChild(style);
    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <>
      <div className="container">
        <div className="card-login-page-main d-flex flex-column align-items-center justify-content-center responsive-login-card">
          <div className="login-card-main-box">
            <div className="app-brand justify-content-center ">
              <Link to="/" className="d-flex flex-column app-brand-link" style={{ textDecoration: "none" }}>
                <span className="app-brand-logo demo">
                  <img src={logo} alt="MenuMitra" className="responsive-login-logo" style={{ width: "40px", height: "40px" }} />
                </span>
                <span className="app-brand-text demo text-heading fw-semibold mt-3 responsive-login-brand-text">MenuMitra</span>
              </Link>
            </div>
            <div className="d-flex flex-column justify-content-center align-items-center mt-2">
              <span className="app-brand-text demo text-heading fw-semibold text-center pt-3 responsive-login-title">Kitchen Display System</span>
              <p className="mt-3 pb-1 responsive-login-subtitle" style={{ color: "gray" }}>Sign in to continue to your account</p>
            </div>
            <div>
              <form id="formAuthentication" className="mb-3 form-container-login fv-plugins-bootstrap5 fv-plugins-framework" onSubmit={showOtpInput ? handleVerifyOTP : handleSendOTP} noValidate="novalidate">
                {!showOtpInput ? (
                  <div className="form-floating form-floating-outline mb-3 form-control-validation fv-plugins-icon-container responsive-login-form-container px-md-4">
                    <div>
                      <label htmlFor="mobile">Mobile Number <span className="red-asterisk">*</span></label>
                    </div>
                    <input
                      type="text"
                      className="form-control-login-form mt-2"
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
                    
                    {error && <p className="text-danger" role="alert">{error}</p>}
                    
                  </div>
                ) : (
                  <>
                    {error && (
                      <div
                        className="d-flex justify-content-center px-2"
                      >
                        <div
                          role="alert"
                          className="mb-2 text-center responsive-error-container"
                          style={{
                            maxWidth: "420px",
                            width: "100%",
                            background: "#f8d7da", // light red background
                            color: "#842029", // dark red text
                            border: "1px solid #f5c2c7",
                            borderRadius: "8px",
                            padding: "10px 12px",
                          }}
                        >
                          {error}
                        </div>
                      </div>
                    )}
                    <div className="text-center mt-2 mb-3">Enter 4-digit Verification code </div>
                    <div className="d-flex justify-content-center responsive-otp-container gap-3 mb-3 px-2">
                      {otpValues.map((value, index) => (
                        <input
                          key={index}
                          ref={otpRefs[index]}
                          type="text"
                          className="form-control text-center input-element-login responsive-otp-input"
                          value={value}
                          onChange={(e) => handleOtpChange(index, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(index, e)}
                          maxLength={1}
                          autoFocus={index === 0}
                        />

                      ))}
                    </div>
                  

                    <div className="d-flex justify-content-between align-items-center responsive-otp-buttons px-2 px-md-0" style={{ width: "100%" }}>
                      <button
                        type="button"
                        onClick={handleResendOTP}
                        disabled={resendCooldown > 0}
                        className="text-base font-medium focus:outline-none focus:underline mb-3 mt-2 responsive-otp-button"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: resendCooldown > 0 ? 'gray' : '#2563eb', // Gray when disabled, blue otherwise
                        }}
                      >
                        {resendCooldown > 0 ? `Resend OTP (${resendCooldown}s)` : "Resend OTP"}
                      </button>
                      <button
                        className="text-base font-medium focus:outline-none focus:underline mb-3 responsive-otp-button"
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          color: '#2563eb' // Always blue color here
                        }}
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

                <div className="mb-3 responsive-login-form-container px-md-4">
                  <button
                    className={`btn mb-3 d-grid w-100 waves-effect waves-light responsive-submit-button ${
                      showOtpInput
                        ? "bg-primary text-white"
                        : mobileNumber.length === 10
                        ? "bg-primary text-white"
                        : "bg-secondary text-white"
                    }`}
                    type="submit"
                    disabled={!showOtpInput && mobileNumber.length !== 10} // disable if Send OTP mode and not 10 digits
                    style={{ height: "45px", borderRadius: "10px" }}
                  >
                    {showOtpInput ? "Verify OTP" : "Send OTP"}
                  </button>

                </div>
              </form>
            </div>
          </div>

          <div className="d-flex justify-content-center gap-1 mt-2 links-container responsive-links-container">
            <a className="liking-items" href="https://menumitra.com/" target="_blank" rel="noopener noreferrer">
              <p style={{ color: "gray" }}>Home</p>
            </a>
            <a className="liking-items" href="https://menumitra.com/book-demo" target="_blank" rel="noopener noreferrer">
              <p style={{ color: "gray" }}>Book a demo</p>
            </a>
            <a className="liking-items" href="https://menumitra.com/contact" target="_blank" rel="noopener noreferrer">
              <p style={{ color: "gray" }}>Contact</p>
            </a>
            <a className="liking-items" href="https://menumitra.com/customer-care" target="_blank" rel="noopener noreferrer">
              <p style={{ color: "gray" }}>Support</p>
            </a>
          </div>

          <div className="card-body pt-2">
            <div className="d-flex flex-column align-items-center justify-content-center">
              
              <div className="kds-socials d-flex justify-content-center gap-1 mb-3">
                <a href="https://menumitra.com/" className="kds-social" target="_blank" rel="noopener noreferrer" aria-label="Google">
                  <i className="ri-google-fill" />
                </a>
                <a href="https://www.facebook.com/people/Menu-Mitra/61565082412478/" className="kds-social" target="_blank" rel="noopener noreferrer" aria-label="Facebook">
                  <i className="ri-facebook-fill" />
                </a>
                <a href="https://www.instagram.com/menumitra/" className="kds-social" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
                  <i className="ri-instagram-fill" />
                </a>
                <a href="https://www.youtube.com/@menumitra" className="kds-social" target="_blank" rel="noopener noreferrer" aria-label="YouTube">
                  <i className="ri-youtube-fill" />
                </a>
               
              </div>
              <div className="kds-version text-center">
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
