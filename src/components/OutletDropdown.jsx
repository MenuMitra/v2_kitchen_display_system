import React, { useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "./cache";

const OutletDropdown = ({ onSelect, selectedOutlet }) => {
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(selectedOutlet || null);
  const [show, setShow] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [hideDropdown, setHideDropdown] = useState(false);
  const dropdownRef = useRef(null);

  // Sync local selected state with selectedOutlet prop
  useEffect(() => {
    if (selectedOutlet) {
      setSelected(selectedOutlet);
    } else {
      const savedName = localStorage.getItem("outlet_name");
      if (savedName && String(savedName).trim().length > 0) {
        setSelected({ name: savedName });
      }
    }
  }, [selectedOutlet]);

  // Fetch outlets list via TanStack Query
  const token = typeof window !== "undefined" ? localStorage.getItem("access_token") : null;
  const userId = typeof window !== "undefined" ? localStorage.getItem("user_id") || 0 : 0;

  const { data: outletsData, isLoading } = useQuery({
    queryKey: ["outlets", userId],
    enabled: !!token,
    queryFn: async () => {
      const res = await fetch("https://menu4.xyz/v2/common/get_outlet_list", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ owner_id: userId, app_source: "admin", outlet_id: 0 }),
      });
      const json = await res.json();
      return Array.isArray(json.outlets) ? json.outlets : [];
    },
  });

  useEffect(() => {
    setLoading(isLoading);
    if (Array.isArray(outletsData)) {
      setOutlets(outletsData);
      console.log("outletsData", outletsData);
      if (outletsData.length === 1) {
        const singleOutlet = outletsData[0];
        // If the only outlet is inactive, don't auto-select and keep dropdown visible
        if (singleOutlet && singleOutlet.outlet_status === false) {
          setHideDropdown(false);
        } else {
          setHideDropdown(true);
          handleSelect(singleOutlet);
        }
      } else {
        setHideDropdown(false);
      }
    }
  }, [isLoading, outletsData]);

  // Filter outlets by search term
  const filteredOutlets = outlets.filter((outlet) =>
    outlet.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Handle outlet selection
  const handleSelect = (outlet) => {
    console.log("handleSelect", outlet);
    // Block selection for inactive outlets
    if (outlet && outlet.outlet_status === false) {
      return;
    }
    localStorage.setItem("outlet_id", outlet.outlet_id);
    setSelected(outlet);
    setShow(false);
    setSearchTerm("");
    localStorage.setItem("outlet_id", outlet.outlet_id);
    localStorage.setItem("outlet_name", outlet.name);
    if (typeof onSelect === "function") {
      onSelect(outlet);
    }
    // Immediately refresh orders queries for the selected outlet
    try {
      queryClient.invalidateQueries({ queryKey: ["orders"], exact: false });
      queryClient.refetchQueries({ queryKey: ["orders", outlet.outlet_id], exact: false });
    } catch (e) {
      // no-op
    }
  };

  // Close dropdown on outside click and clear search
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShow(false);
        setSearchTerm("");
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const selectedLabel = selected && selected.name && String(selected.name).trim().length > 0 ? selected.name : "Select Outlet";

  if (hideDropdown && selected) {
    return (
      <div
        className="inline-block min-w-[220px]"
        style={{ position: "relative", borderRadius: "3px", width: "180px" }}
      >
        <div
          className="selected-outlet-label"
          style={{
            background: "#fff",
            color: "#000",
            fontSize: "1.12rem",
            fontWeight: "500",
            padding: "0.32rem 1rem",
            border: "1.5px solid #d0d5dd",
            borderRadius: "15px",
            minHeight: "40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "left",
            cursor: "default",
          }}
        >
          {selectedLabel}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={dropdownRef}
      className="relative inline-block min-w-[220px]"
      style={{ position: "relative", borderRadius: "3px", minWidth: "180px" }}
    >
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="w-100 select-outlet-btn"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "#fff",
          color: "#b4b6b9ff",
          fontSize: "1.12rem",
          fontWeight: "500",
          padding: "0.32rem 1rem",
          border: "1.5px solid #d0d5dd",
          borderRadius: "15px",
          minHeight: "40px",
          textAlign: "left",
          boxShadow: "none",
          outline: "none",
          cursor: "pointer",
          transition: "background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.backgroundColor = "#e6e6e6";
          e.currentTarget.style.color = "#939090ff";
          e.currentTarget.style.borderColor = "#dcd8d8ff";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.backgroundColor = "#fff";
          e.currentTarget.style.color = "#a5a6a9ff";
          e.currentTarget.style.borderColor = "#d0d5dd";
        }}
      >
        <span>{selectedLabel}</span>
        <span
          style={{
            display: "inline-block",
            width: "24px",
            height: "24px",
            verticalAlign: "middle",
            margin: "2px",
            transition: "transform 0.3s ease",
            transform: show ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            style={{ display: "block" }}
            xmlns="http://www.w3.org/2000/svg"
          >
            <polyline
              points="6 9 12 15 18 9"
              fill="none"
              stroke="#878a95"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>

      {show && (
        <div
          className="dropdown-menu show shadow overflow-hidden"
          style={{ maxHeight: 290, minWidth:290, maxWidth: 300, overflowY: "auto", backgroundColor: "#d1d3d4" }}
        >
          <div className="p-2">
            <input
              type="search"
              className="form-control form-control-sm"
              style={{ fontSize: "1.125rem", height: "2.5rem" }}
              placeholder="Search outlets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <ul
            className="list-unstyled mb-0"
            style={{ maxHeight: 250, overflowY: "auto", paddingLeft: 0 }}
          >
            {loading && <li className="dropdown-item">Loading...</li>}
            {!loading &&
              filteredOutlets.map((outlet, index) => {
                const isInactive = outlet && outlet.outlet_status === false;
                const isSelected = selected && selected.outlet_id === outlet.outlet_id;
                return (
                  <li className="outlet-list-items p-1 m-1" key={`${outlet.outlet_id}-${index}`}>
                    <button
                      type="button"
                      className={`dropdown-item-outlet w-100 p-1 m-0 ${
                        isSelected ? "font-bold text-gray-800 bg-blue-100" : "text-dark"
                      } ${isInactive ? "cursor-not-allowed" : ""}`}
                      onClick={() => handleSelect(outlet)}
                      disabled={isInactive}
                      style={{
                        borderRadius: 8,
                        textAlign: "left",
                        whiteSpace: "normal",
                        backgroundColor: isInactive ? "#ffe6e6" : undefined,
                        color: isInactive ? "#a30000" : undefined,
                        opacity: isInactive ? 0.9 : 1,
                      }}
                    >
                      <div className="d-flex align-items-center">
                        <p className="text-capitalize m-0 p-0 text-wrap" style={{ flex: 1, whiteSpace: "normal", wordBreak: "break-word" }}>{outlet.name}</p>
                        {isInactive && (
                          <span className="text-xs ms-2" style={{ color: "#a30000", fontWeight: 600 }}>
                            Inactive
                          </span>
                        )}
                        {outlet.outlet_code && (
                          <span className="text-xs text-secondary ms-1">({outlet.outlet_code})</span>
                        )}
                      </div>
                      {outlet.address && <div className="text-xs text-muted">{outlet.address}</div>}
                      {outlet.owner_name && (
                        <div className="text-xs text-secondary">{outlet.owner_name}</div>
                      )}
                    </button>
                  </li>
                );
              })}
            {!loading && filteredOutlets.length === 0 && (
              <li className="dropdown-item text-center text-muted">No outlets found</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default OutletDropdown;
