import React, { useEffect, useState, useRef } from "react";
import { V2_COMMON_BASE } from "../config";
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
      const res = await fetch(`${V2_COMMON_BASE}/get_outlet_list`, {
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
        if (singleOutlet && singleOutlet.outlet_status === 0) {
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
    if (outlet && outlet.outlet_status === 0) {
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
      <div className="inline-block relative w-full max-w-[180px] rounded-3xl">
        <div className="bg-white text-black font-medium px-3 py-1 border-[1.5px] border-[#d0d5dd] rounded-3xl min-h-[40px] flex items-center justify-start cursor-default overflow-hidden whitespace-nowrap text-ellipsis text-[clamp(0.875rem,2vw,1.12rem)]">
          {selectedLabel}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={dropdownRef}
      className="relative inline-block w-full max-w-[420px] min-w-[120px] sm:min-w-[300px] rounded-3xl"
    >
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="w-full flex items-center justify-between bg-white text-[#b4b6b9] font-medium px-3 py-1 border-[1.5px] border-[#d0d5dd] rounded-3xl min-h-[40px] text-left shadow-none outline-none cursor-pointer transition-all duration-300 overflow-hidden whitespace-nowrap text-ellipsis text-[clamp(0.875rem,2vw,1.12rem)] hover:bg-[#e6e6e6] hover:text-[#939090] hover:border-[#dcd8d8]"
      >
        <span>{selectedLabel}</span>
        <span
          className={`inline-block w-6 h-6 align-middle m-[2px] transition-transform duration-300 ${show ? "rotate-180" : "rotate-0"}`}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            className="block"
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
        <div className="absolute top-full left-0 mt-1 w-full min-w-[200px] max-w-[300px] max-h-[320px] overflow-y-auto bg-[#d1d3d4] z-[1000] shadow rounded overflow-hidden">
          <div className="p-2">
            <input
              type="search"
              className="w-full h-10 px-3 py-1.5 text-[clamp(0.875rem,2vw,1.125rem)] border border-gray-300 rounded-3xl focus:outline-none focus:border-blue-500"
              placeholder="Search outlets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <ul className="list-none m-0 p-0 max-h-[260px] overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-gray-200 [&::-webkit-scrollbar-thumb]:bg-gray-400 [&::-webkit-scrollbar-thumb]:rounded">
            {loading && <li className="px-4 py-2 text-gray-700">Loading...</li>}
            {!loading &&
              filteredOutlets.map((outlet, index) => {
                const isInactive = outlet && outlet.outlet_status === 0;
                const isSelected = selected && selected.outlet_id === outlet.outlet_id;
                return (
                  <li
                    className={`p-1 m-1 border-[1.5px] rounded-[10px] transition-all duration-150 ${isInactive ? "bg-[#ffe6e6] border-[#ffe6e6]" : "bg-[#f8f9fa] border-[#bbb] hover:bg-white hover:border-[#0d6efd] hover:shadow-[0_4px_16px_rgba(13,110,253,0.18)]"}`}
                    key={`${outlet.outlet_id}-${index}`}
                  >
                    <button
                      type="button"
                      className={`w-full p-1 m-0 text-left whitespace-normal border-none bg-transparent rounded-lg text-base ${isSelected ? "font-bold text-gray-800 bg-blue-100" : isInactive ? "text-[#a30000] cursor-not-allowed" : "text-gray-800"}`}
                      onClick={() => handleSelect(outlet)}
                      disabled={isInactive}
                    >
                      <div className="flex items-center">
                        <p className="capitalize m-0 p-0 flex-1 whitespace-normal break-words">{outlet.name}</p>
                        {isInactive && (
                          <span className="text-xs ml-2 text-[#a30000] font-semibold">
                            Inactive
                          </span>
                        )}
                        {outlet.outlet_code && (
                          <span className="text-xs text-gray-500 ml-1">({outlet.outlet_code})</span>
                        )}
                      </div>
                      {outlet.address && <div className="text-xs capitalize text-gray-500">{outlet.address}</div>}
                      {outlet.owner_name && (
                        <div className="text-xs text-gray-500">{outlet.owner_name}</div>
                      )}
                    </button>
                  </li>
                );
              })}
            {!loading && filteredOutlets.length === 0 && (
              <li className="px-4 py-2 text-center text-gray-500">No outlets found</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default OutletDropdown;
