import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./screens/Login";
import OrdersList from "./screens/OrdersList";
import React from "react";
import "./App.css";
import "./assets/toast/toast.js";
import "./assets/toast/toast.css";
import "remixicon/fonts/remixicon.css";
import { ENV } from "./config/env";


function App() {
  const isTestingEnv = String(ENV?.env || "").toLowerCase() === "testing";

  return (
    <BrowserRouter basename="/">
      {isTestingEnv && (
        <div className="env-top-banner" role="status" aria-live="polite">
          Testing Environment
        </div>
      )}
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/orders" element={<OrdersList />} />
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App; 