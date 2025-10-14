import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import logo from "../assets/logo.png";
import OutletDropdown from "./OutletDropdown";
import SubscriptionRemainDay from "./SubscriptionRemainDay";
import { CURRENT_ENV } from "../config";

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
  const [isTodayHover, setIsTodayHover] = useState(false);
  const [isAllHover, setIsAllHover] = useState(false);

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

      await fetch("https://men4u.xyz/v2/common/logout", {
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

  const toggleBtnStyle = {
    border: "none",
    borderRadius: 0,
    minWidth: 80,
    fontWeight: 600,
    fontSize: 18,
    padding: "8px 26px",
    boxShadow: "none",
  };

  const activeBtnStyle = {
    ...toggleBtnStyle,
    background: "#1673ff",
    color: "#fff",
  };

  const nonActiveBtnStyle = {
    ...toggleBtnStyle,
    backgroundColor: "#fff",
    color: "#1673ff",
  };

  const changeFilter = (value) => {
    setLocalFilter(value);
    onFilterChange?.(value);
  };

  return (
    <>
      {!isFullscreen && CURRENT_ENV !== 'production' && (
        <div
          style={{
            width: "100%",
            backgroundColor: "#b22222",
            color: "#fff",
            textAlign: "center",
            padding: "3px 0",
            fontSize: "14px",
            fontWeight: "bold",
            position: "fixed",
            top: 0,
            left: 0,
            zIndex: 1100,
          }}
        >
          Testing Environment
        </div>
      )}
      {!isFullscreen && (
        <header className="bg-white shadow-sm" style={{ marginTop: "35px", position: "relative" }}>
          <nav className="navbar navbar-expand-lg navbar-light py-2">
            <div className="container-fluid px-3 d-flex justify-content-between align-items-center">
              <div className="navbar-brand d-flex align-items-center gap-2">
                <img
                  src={logo}
                  alt="Menumitra Logo"
                  style={{ height: "40px", width: "40px", objectFit: "contain" }}
                />
                <span className="fs-5 fw-bold text-dark">Menumitra</span>
                <div>
                  <OutletDropdown selectedOutlet={selectedOutlet} onSelect={onOutletSelect} />
                </div>
              </div>
              <div
                className="position-absolute top-50 start-50 translate-middle text-center"
                style={{ pointerEvents: "none" }}
              >
                <h1
                  className="mb-0 text-truncate"
                  style={{
                    fontSize: "clamp(20px, 5vw, 36px)",
                    fontWeight: "bold",
                    color: "#333",
                  }}
                >
                  K D S
                </h1>
              </div>
              <div className="d-flex align-items-center" style={{ gap: "12px" }}>
                <div className="custom-toggle-group">
                  <button
                    type="button"
                    style={{
                      ...(localFilter === "today" ? activeBtnStyle : nonActiveBtnStyle),
                      ...(localFilter !== "today" && isTodayHover ? { backgroundColor: "#e9ecef" } : {}),
                    }}
                    onMouseEnter={() => setIsTodayHover(true)}
                    onMouseLeave={() => setIsTodayHover(false)}
                    onClick={() => changeFilter("today")}
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    style={{
                      ...(localFilter === "all" ? activeBtnStyle : nonActiveBtnStyle),
                      ...(localFilter !== "all" && isAllHover ? { backgroundColor: "#e9ecef" } : {}),
                    }}
                    onMouseEnter={() => setIsAllHover(true)}
                    onMouseLeave={() => setIsAllHover(false)}
                    onClick={() => changeFilter("all")}
                  >
                    All
                  </button>
                </div>
                <button
                  className="header-icons-items btn btn-outline-secondary refresh-btn-heder"
                  title="Refresh"
                  onClick={() => onRefresh?.()}
                >
                  <i className="fa-solid fa-rotate" />
                </button>
                <button
                  className="header-icons-items btn btn-outline-secondary"
                  title="Fullscreen"
                  onClick={handleFullscreen}
                >
                  <i className={isFullscreen ? "bx bx-exit-fullscreen" : "bx bx-fullscreen"} />
                </button>
                <button
                  className="header-icons-items btn btn-outline-danger"
                  title="Logout"
                  onClick={() => setShowLogoutConfirm(true)}
                >
                  <i className="fa-solid fa-right-from-bracket"></i>
                </button>
              </div>
            </div>
          </nav>
          {showLogoutConfirm && (
            <>
              <div
                className="modal-backdrop fade show"
                style={{
                  position: "fixed",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100vh",
                  backgroundColor: "rgba(0, 0, 0, 0.5)",
                  zIndex: 1040,
                }}
              />
              <div
                className="modal"
                tabIndex="-1"
                style={{
                  display: "block",
                  position: "fixed",
                  top: "40%",
                  left: "50%",
                  transform: "translateX(-50%)",
                  zIndex: 1050,
                  width: "100%",
                  maxWidth: "320px",
                }}
              >
                <div className="modal-dialog" style={{ margin: 0 }}>
                  <div
                    className="modal-content"
                    style={{
                      border: "1px solidrgb(65, 65, 65)",
                      borderRadius: "8px",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.2)",
                    }}
                  >
                    <div className="modal-header d-flex justify-content-center fw-bold">
                      <h5 className="modal-title fw-bold text-center">
                        <i
                          className="fa-solid fa-right-from-bracket me-2 mb-3"
                          style={{ color: "red" }}
                        ></i>
                        Confirm Logout
                      </h5>
                    </div>
                    <div className="modal-body text-center ">
                      <p className="fw-bold pt-2">Are you sure you want to logout?</p>
                    </div>
                    <div className="modal-footer justify-content-between logout-box-container pt-3">
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={() => handleLogoutConfirm(false)}
                        style={{
                          background: "transparent",
                          borderRadius: 15,
                          padding: "6px 12px",
                          height: "40px",
                          width: "100px",
                          borderWidth: 1,
                          borderColor: "#6c757d",
                          color: "#6c757d",
                          boxShadow: "none",
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger "
                        style={{borderRadius: 15, padding: "6px 12px", height: "40px", borderWidth: 1, borderColor: "#dc3545", color: "#fff", boxShadow: "none"}}
                        onClick={() => handleLogoutConfirm(true)}
                      >
                        <i className="fa-solid fa-right-from-bracket me-2"></i> Exit Me
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
