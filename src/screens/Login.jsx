import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import { APP_INFO } from "../config";
import { authService } from "../services/authService";
import { saveAuthSession, isAuthenticated } from "../utils/authStorage";
import { getDevicePayload } from "../utils/deviceService";
import PinInput from "../components/auth/PinInput";

const STEPS = {
  MOBILE: "mobile",
  PIN_ENTRY: "pin_entry",
  OTP_VERIFY: "otp_verify",
  PIN_SETUP: "pin_setup",
};

const OTP_PURPOSE = {
  SETUP: "setup",
  RESET: "reset",
};

function Login() {
  const [step, setStep] = useState(STEPS.MOBILE);
  const [mobileNumber, setMobileNumber] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [otpValues, setOtpValues] = useState(["", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpPurpose, setOtpPurpose] = useState(OTP_PURPOSE.SETUP);
  const [setupToken, setSetupToken] = useState("");
  const [pinSetupPhase, setPinSetupPhase] = useState("create");

  const navigate = useNavigate();
  const otpRefs = [useRef(), useRef(), useRef(), useRef()];

  useEffect(() => {
    if (isAuthenticated()) {
      navigate("/orders", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleMobileChange = (e) => {
    const input = e.target.value.replace(/\D/g, "").slice(0, 10);
    if (/^[0-5]/.test(input)) {
      setError("Mobile number must start with 6-9");
      return;
    }
    setError("");
    setMobileNumber(input);
  };

  const finishLogin = (data) => {
    saveAuthSession({
      ...data,
      ...getDevicePayload(),
      fcm_token: data.fcm_token || "dummy_fcm_token",
    });
    navigate("/orders");
  };

  const handleMobileContinue = async (e) => {
    e?.preventDefault();
    setError("");

    if (!mobileNumber || mobileNumber.length !== 10) {
      setError("Please enter a valid 10-digit mobile number");
      return;
    }

    setLoading(true);
    try {
      const status = await authService.checkMobile(mobileNumber);

      if (status.locked) {
        setError(
          status.locked_until
            ? `Account locked. Try again after ${new Date(status.locked_until).toLocaleTimeString()}`
            : "Account temporarily locked. Please try again later."
        );
        return;
      }

      if (status.exists === false) {
        setError("User not found with this mobile number");
        return;
      }

      if (!status.has_pin) {
        setOtpPurpose(OTP_PURPOSE.SETUP);
        const otpResult = await authService.sendSetupOtp(mobileNumber);
        if (otpResult.success) {
          setStep(STEPS.OTP_VERIFY);
          setResendCooldown(30);
        } else {
          setError(otpResult.message);
        }
        return;
      }

      setPin("");
      setStep(STEPS.PIN_ENTRY);
    } finally {
      setLoading(false);
    }
  };

  const handlePinLogin = async (pinValue) => {
    const pinToUse = pinValue || pin;
    setError("");

    if (!pinToUse || (pinToUse.length !== 4 && pinToUse.length !== 6)) {
      setError("Please enter your 4 or 6 digit PIN");
      return;
    }

    setLoading(true);

    try {
      const result = await authService.loginWithPin(mobileNumber, pinToUse);

      if (result.success) {
        finishLogin(result);
        return;
      }

      if (result.code === "PIN_NOT_SET" || result.requiresOtp || result.requiresPinSetup) {
        setOtpPurpose(OTP_PURPOSE.SETUP);
        const otpResult = await authService.sendSetupOtp(mobileNumber);
        if (otpResult.success) {
          setStep(STEPS.OTP_VERIFY);
          setResendCooldown(30);
          setError("");
        } else {
          setError(otpResult.message);
        }
        return;
      }

      if (result.code === "ACCOUNT_LOCKED") {
        setError(`Account locked. Try again after ${new Date(result.lockedUntil).toLocaleTimeString()}`);
        return;
      }

      if (result.attemptsRemaining !== undefined) {
        setError(`${result.message}. ${result.attemptsRemaining} attempt(s) remaining.`);
        setPin("");
        return;
      }

      setError(result.message || "Invalid PIN");
      setPin("");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (otp) => {
    if (loading) return;
    setError("");

    if (!otp || otp.length !== 4) {
      setError("Please enter a valid 4-digit OTP");
      return;
    }

    setLoading(true);
    try {
      const verifyFn =
        otpPurpose === OTP_PURPOSE.RESET
          ? authService.verifyResetOtp
          : authService.verifySetupOtp;

      const result = await verifyFn(mobileNumber, otp);

      if (!result.success) {
        setError(result.message || "Invalid OTP");
        setOtpValues(["", "", "", ""]);
        return;
      }

      if (result.setupToken) {
        setSetupToken(result.setupToken);
        setStep(STEPS.PIN_SETUP);
        setPinSetupPhase("create");
        setPin("");
        setConfirmPin("");
        return;
      }

      if (result.needsPinSetup) {
        finishLogin(result);
      }
    } finally {
      setLoading(false);
    }
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

    const otp = newOtpValues.join("");
    if (otp.length === 4 && !loading) {
      verifyOtp(otp);
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otpValues[index] && index > 0) {
      otpRefs[index - 1].current.focus();
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    setError("");
    setLoading(true);
    try {
      const fn =
        otpPurpose === OTP_PURPOSE.RESET
          ? authService.sendResetOtp
          : authService.sendSetupOtp;
      const result = await fn(mobileNumber);
      if (result.success) {
        setResendCooldown(30);
      } else {
        setError(result.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePinSetupContinue = () => {
    setError("");
    if (!pin || (pin.length !== 4 && pin.length !== 6)) {
      setError("PIN must be 4 or 6 digits");
      return;
    }
    setPinSetupPhase("confirm");
    setConfirmPin("");
  };

  const handlePinSetupSubmit = async (e) => {
    e?.preventDefault();
    setError("");

    if (pin !== confirmPin) {
      setError("PINs do not match");
      return;
    }

    setLoading(true);
    try {
      const fn =
        otpPurpose === OTP_PURPOSE.RESET
          ? authService.resetPin
          : authService.setupPin;

      const result = await fn(setupToken, pin, confirmPin);

      if (!result.success) {
        setError(result.message);
        return;
      }

      if (result.access_token) {
        finishLogin(result);
        return;
      }

      const loginResult = await authService.loginWithPin(mobileNumber, pin);
      if (loginResult.success) {
        finishLogin(loginResult);
      } else {
        setStep(STEPS.MOBILE);
        setError("PIN created. Please sign in with your new PIN.");
      }
    } finally {
      setLoading(false);
    }
  };

  const goBackToLogin = () => {
    setStep(STEPS.MOBILE);
    setOtpValues(["", "", "", ""]);
    setPin("");
    setConfirmPin("");
    setSetupToken("");
    setError("");
  };

  const isSubmitDisabled =
    loading ||
    (step === STEPS.MOBILE && mobileNumber.length !== 10) ||
    (step === STEPS.PIN_ENTRY && pin.length !== 4 && pin.length !== 6);

  const submitLabel = () => {
    if (loading) return "Please wait...";
    if (step === STEPS.OTP_VERIFY) return "Verify OTP";
    if (step === STEPS.PIN_SETUP) {
      return pinSetupPhase === "create" ? "Continue" : "Set PIN & Sign In";
    }
    if (step === STEPS.PIN_ENTRY) return "Sign In";
    return "Sign In";
  };

  const handleFormSubmit = (e) => {
    e.preventDefault();
    if (step === STEPS.MOBILE) handleMobileContinue(e);
    else if (step === STEPS.PIN_ENTRY) handlePinLogin();
    else if (step === STEPS.OTP_VERIFY) verifyOtp(otpValues.join(""));
    else if (step === STEPS.PIN_SETUP) {
      if (pinSetupPhase === "create") handlePinSetupContinue();
      else handlePinSetupSubmit(e);
    }
  };

  return (
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
            <p className="mt-2 text-gray-500 text-sm sm:text-base">
              {step === STEPS.PIN_SETUP
                ? pinSetupPhase === "create"
                  ? "Create your secure PIN"
                  : "Confirm your PIN"
                : step === STEPS.OTP_VERIFY
                ? "Verify your mobile number"
                : step === STEPS.PIN_ENTRY
                ? "Enter your PIN to sign in"
                : "Sign in to continue to your account"}
            </p>
          </div>

          <div className="w-full mt-1">
            <form id="formAuthentication" className="mb-1 w-full p-1" onSubmit={handleFormSubmit} noValidate>
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

              {step === STEPS.MOBILE && (
                <div className="mb-3 w-full px-0 sm:px-4">
                  <label htmlFor="mobile" className="block text-gray-700 font-medium mb-1">
                    Mobile Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="w-full h-[55px] px-4 py-3 text-xl border border-gray-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent placeholder-gray-400"
                    id="mobile"
                    name="mobile"
                    placeholder="Enter your mobile number"
                    value={mobileNumber}
                    onChange={handleMobileChange}
                    autoFocus
                    disabled={loading}
                  />
                </div>
              )}

              {step === STEPS.PIN_ENTRY && (
                <>
                  <div className="text-center mt-2 mb-3 text-gray-700">
                    Enter your 4-digit PIN for {mobileNumber}
                  </div>
                  <div className="mb-4 px-0 sm:px-4">
                    <PinInput
                      length={4}
                      value={pin}
                      onChange={setPin}
                      onComplete={(value) => {
                        if (!loading) handlePinLogin(value);
                      }}
                      disabled={loading}
                      error={!!error}
                      autoFocus
                    />
                  </div>
                  <div className="flex justify-end w-full px-2 sm:px-8 mb-4">
                    <button
                      type="button"
                      onClick={goBackToLogin}
                      className="text-base font-medium rounded-3xl focus:outline-none hover:underline bg-transparent border-none p-0 text-blue-600 cursor-pointer"
                    >
                      Back to login
                    </button>
                  </div>
                </>
              )}

              {step === STEPS.OTP_VERIFY && (
                <>
                  <div className="text-center mt-2 mb-3 text-gray-700">
                    Enter 4-digit verification code sent to {mobileNumber}
                  </div>
                  <div className="flex justify-center gap-4 mb-4 px-2">
                    {otpValues.map((value, index) => (
                      <input
                        key={index}
                        ref={otpRefs[index]}
                        type="text"
                        className="w-[40px] h-[40px] sm:w-[60px] sm:h-[60px] text-center text-2xl sm:text-3xl border border-2 border-gray-300 rounded-3xl focus:outline-none focus:ring-2 focus:ring-primary"
                        value={value}
                        onChange={(e) => handleOtpChange(index, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(index, e)}
                        maxLength={1}
                        autoFocus={index === 0}
                        disabled={loading}
                        inputMode="numeric"
                      />
                    ))}
                  </div>
                  <div className="flex flex-col sm:flex-row justify-between items-center w-full px-2 sm:px-8 mb-4 gap-2">
                    <button
                      type="button"
                      onClick={handleResendOtp}
                      disabled={resendCooldown > 0 || loading}
                      className={`text-base font-medium rounded-3xl focus:outline-none hover:underline bg-transparent border-none p-0 ${
                        resendCooldown > 0 ? "text-gray-400 cursor-not-allowed" : "text-blue-600 cursor-pointer"
                      }`}
                    >
                      {resendCooldown > 0 ? `Resend OTP (${resendCooldown}s)` : "Resend OTP"}
                    </button>
                    <button
                      type="button"
                      onClick={goBackToLogin}
                      className="text-base font-medium rounded-3xl focus:outline-none hover:underline bg-transparent border-none p-0 text-blue-600 cursor-pointer"
                    >
                      Back to login
                    </button>
                  </div>
                </>
              )}

              {step === STEPS.PIN_SETUP && (
                <div className="mb-3 w-full px-0 sm:px-4">
                  <label className="block text-gray-700 font-medium mb-1 text-center">
                    {pinSetupPhase === "create" ? "Create PIN" : "Confirm PIN"}
                  </label>
                  <PinInput
                    length={4}
                    value={pinSetupPhase === "create" ? pin : confirmPin}
                    onChange={pinSetupPhase === "create" ? setPin : setConfirmPin}
                    disabled={loading}
                    error={!!error}
                  />
                  {pinSetupPhase === "confirm" && (
                    <button
                      type="button"
                      onClick={() => {
                        setPinSetupPhase("create");
                        setConfirmPin("");
                        setError("");
                      }}
                      className="text-sm text-blue-600 hover:underline bg-transparent border-none p-0 mt-2 cursor-pointer"
                    >
                      Change PIN
                    </button>
                  )}
                </div>
              )}

              <div className="mb-1 w-full px-0 sm:px-4">
                <button
                  className={`w-full h-[55px] rounded-3xl text-white text-lg font-medium transition-colors duration-200 ${
                    isSubmitDisabled
                      ? "bg-secondary cursor-not-allowed"
                      : "bg-primary hover:bg-blue-700"
                  }`}
                  type="submit"
                  disabled={isSubmitDisabled}
                >
                  {loading && (
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2 align-middle" />
                  )}
                  {submitLabel()}
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
  );
}

export default Login;
