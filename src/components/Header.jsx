import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import OutletDropdown from "./OutletDropdown";
import SubscriptionRemainDay from "./SubscriptionRemainDay";
import { ENV } from "../config/env";
import { V2_COMMON_BASE } from "../config";

console.log("current environment", ENV.env);

function Header({
  filter,
  onFilterChange,
  onRefresh,
  onOutletSelect,
  selectedOutlet,      // <--- Now controlled from parent!
  subscriptionData     // <--- New prop for subscription data
}) {
  const [localFilter, setLocalFilter] = useState(filter || "today");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const userId = localStorage.getItem("user_id");
  const navigate = useNavigate();

  useEffect(() => {
    setLocalFilter(filter || "today");
  }, [filter]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const handleFullscreen = async () => {
    const elem = document.documentElement;
    try {
      if (!document.fullscreenElement) {
        await elem.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (err) {
      console.warn("Fullscreen error:", err);
    }
  };

  const handleLogout = async () => {
    try {
      const logoutData = {
        user_id: userId,
        role: "chef",
        app: "chef",
        device_token: "some-device-token",
        app_source: "kds_app"
      };

      await fetch(`${V2_COMMON_BASE}/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(logoutData),
      });

      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("user_id");
      localStorage.removeItem("user_role");
      localStorage.removeItem("device_id");
      localStorage.removeItem("outlet_id");
      localStorage.removeItem("outlet_name");

      navigate("/login");
    } catch (error) {
      console.error("Error logging out:", error);
      window.showToast?.("error", error.message || "Failed to log out.");
    }
  };

  const handleLogoutConfirm = (confirm) => {
    if (confirm) handleLogout();
    else setShowLogoutConfirm(false);
  };

  const changeFilter = (value) => {
    setLocalFilter(value);
    onFilterChange?.(value);
  };

  return (
    <>
      {!isFullscreen && ENV.env !== 'production' && (
        <div className="w-full bg-[#b22222] text-white text-center py-[1px] text-sm font-bold sticky top-0 z-[1100]">
          Testing Environment
        </div>
      )}
      {!isFullscreen && (
        <header className="bg-white shadow-lg relative mt-0 mb-4">
          <nav className="bg-white w-full py-0 md:py-0">
            <div className="w-full px-1 md:px-1 flex items-center justify-between">

              {/* Brand Section */}
              <div className="flex items-center gap-0.5 md:gap-1">
                <img
                  src={logo}
                  alt="Menumitra Logo"
                  className="h-8 w-8 md:h-10 md:w-10 object-contain"
                />
                <span className="hidden sm:inline text-base md:text-2xl font-bold text-black">Menumitra</span>
                <span className="sm:hidden text-sm font-bold text-black">MM</span>
                <div className="max-w-[120px] md:max-w-none">
                  <OutletDropdown selectedOutlet={selectedOutlet} onSelect={onOutletSelect} />
                </div>
              </div>

              {/* Centered Title (Desktop only) */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 hidden md:block pointer-events-none">
                <h1 className="m-0 truncate font-bold  text-black text-[clamp(18px,3.5vw,28px)]">
                  K D S
                </h1>
              </div>

              {/* Mobile Menu Toggle */}
              <button
                className="md:hidden border-none p-0.5 text-black focus:outline-none"
                type="button"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              >
                <span className="block w-5 h-0.5 bg-black mb-1"></span>
                <span className="block w-5 h-0.5 bg-black mb-1"></span>
                <span className="block w-5 h-0.5 bg-black"></span>
              </button>

              {/* Actions Section */}
              <div className={`${isMobileMenuOpen ? 'flex' : 'hidden'} md:flex flex-col md:flex-row absolute md:static top-full left-0 w-full md:w-auto bg-white md:bg-transparent shadow-md md:shadow-none p-4 md:p-0 z-50 gap-2 md:gap-3 items-start md:items-center`}>

                {/* Filter Toggle Group */}
                <div className="flex w-full md:w-auto rounded-l-3xl border border-2 rounded-r-3xl overflow-hidden">
                  <button
                    type="button"
                    className={`flex-1 md:flex-none min-w-[70px] md:min-w-[90px] py-1.5 md:py-2 px-4 md:px-6 text-sm md:text-base font-semibold transition-colors duration-200 ${localFilter === "today"
                      ? "bg-[#1673ff] text-white"
                      : "bg-white text-[#1673ff] hover:bg-gray-100"
                      }`}
                    onClick={() => changeFilter("today")}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    className={`flex-1 md:flex-none min-w-[70px] md:min-w-[90px] py-1.5 md:py-2 px-4 md:px-6 text-sm md:text-base font-semibold transition-colors duration-200 ${localFilter === "all"
                      ? "bg-[#1673ff] text-white"
                      : "bg-white text-[#1673ff] hover:bg-gray-100"
                      }`}
                    onClick={() => changeFilter("all")}
                  >
                    All
                  </button>
                </div>

                {/* Action Icons */}
                <div className="flex items-center justify-between w-full md:w-auto gap-2">
                  <button
                    className="w-[45px] h-[45px] flex items-center justify-center border-2 border-gray-400 rounded-3xl text-gray-500 bg-transparent hover:bg-gray-100 transition-colors"
                    title="Refresh"
                    onClick={(event) => {
                      onRefresh?.();
                      event.currentTarget.blur();
                    }}
                  >
                    <i className="fa-solid fa-rotate text-lg" />
                  </button>
                  <button
                    className="w-[45px] h-[45px] flex items-center justify-center border-2 border-gray-400 rounded-3xl text-gray-500 bg-transparent hover:bg-gray-100 transition-colors"
                    title="Fullscreen"
                    onClick={handleFullscreen}
                  >
                    <i className={`${isFullscreen ? "bx bx-exit-fullscreen" : "bx bx-fullscreen"} text-xl`} />
                  </button>
                  <button
                    className="w-[45px] h-[45px] flex items-center justify-center border-2 border-red-500 rounded-3xl text-red-500 bg-transparent hover:bg-red-50 transition-colors"
                    title="Logout"
                    onClick={() => setShowLogoutConfirm(true)}
                  >
                    <i className="fa-solid fa-right-from-bracket text-lg"></i>
                  </button>
                </div>
              </div>

            </div>
          </nav>

          {/* Logout Confirmation Modal */}
          {showLogoutConfirm && (
            <>
              <div className="fixed inset-0 bg-black/50 z-[1040]" />
              <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[1050] w-full max-w-[380px]">
                <div className="bg-white rounded-lg shadow-xl overflow-hidden mx-4 md:mx-0">
                  <div className="py-4 border-b border-gray-200">
                    <h5 className="text-xl font-bold text-center flex items-center justify-center gap-2 m-0 text-gray-800">
                      <i className="fa-solid fa-right-from-bracket text-[#dc3545]"></i>
                      Confirm Logout
                    </h5>
                  </div>
                  <div className="py-6 px-4 text-center">
                    <p className="font-semibold text-gray-800 text-base m-0">Are you sure you want to logout?</p>
                  </div>
                  <div className="px-8 pb-6">
                    <hr className="border-gray-300 mb-6" />
                    <div className="flex justify-between items-center gap-4">
                      <button
                        type="button"
                        className="flex-1 py-2 rounded-full border border-gray-400 text-gray-500 bg-white hover:bg-gray-50 transition-colors font-medium"
                        onClick={() => handleLogoutConfirm(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="flex-1 py-2 rounded-full bg-[#dc3545] text-white hover:bg-red-700 transition-colors font-medium flex items-center justify-center gap-2"
                        onClick={() => handleLogoutConfirm(true)}
                      >
                        <i className="fa-solid fa-right-from-bracket"></i> Exit Me
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </header>
      )}
      {/* Subscription Component - Only show when outlet is selected and subscription data is available */}
      {!isFullscreen && selectedOutlet && selectedOutlet.outlet_id && subscriptionData && selectedOutlet.name && (
        <SubscriptionRemainDay
          selectedOutlet={selectedOutlet}
          subscriptionData={subscriptionData}
          dateRange={filter}
        />
      )}
    </>
  );
}

export default Header;
