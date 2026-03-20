import React, { useEffect, useMemo, useState, useRef } from "react";
import { V2_COMMON_BASE } from "../config";
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "./cache";

const toTitleCase = (str) => {
  if (!str || typeof str !== "string") return str || "";
  return str.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
};


const OutletDropdown = ({ onSelect, selectedOutlet }) => {
  const [outlets, setOutlets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(selectedOutlet || null);
  const [show, setShow] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [hideDropdown, setHideDropdown] = useState(false);
  const dropdownRef = useRef(null);
  const [kdsStatusByOutletId, setKdsStatusByOutletId] = useState({});

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

  const outletIdsKey = useMemo(() => {
    if (!Array.isArray(outletsData)) return "";
    return outletsData
      .map((o) => o?.outlet_id)
      .filter((id) => id !== null && id !== undefined)
      .join(",");
  }, [outletsData]);

  // Preload "KDS assigned?" status per outlet by probing cds_kds_order_listview once.
  // If API says "KDS module has not been assigned for this outlet", mark that outlet as disabled.
  // This is cached by React Query and prevents users from selecting unsupported outlets.
  const { isLoading: isKdsStatusLoading } = useQuery({
    queryKey: ["outlet_kds_assigned", userId, outletIdsKey],
    enabled: !!token && Array.isArray(outletsData) && outletsData.length > 0,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const ids = Array.isArray(outletsData)
        ? outletsData
            .map((o) => o?.outlet_id)
            .filter((id) => id !== null && id !== undefined)
        : [];

      const results = {};

      // Simple concurrency limiter to avoid spamming the backend
      const concurrency = 5;
      let index = 0;
      const worker = async () => {
        while (index < ids.length) {
          const current = ids[index++];
          try {
            const res = await fetch(`${V2_COMMON_BASE}/cds_kds_order_listview`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ outlet_id: current, date_filter: "today" }),
            });

            // If auth fails, treat as unknown; OrdersList will handle redirect.
            if (res.status === 401) {
              results[String(current)] = { assigned: true };
              continue;
            }

            const json = await res.json().catch(() => ({}));
            const detail = typeof json?.detail === "string" ? json.detail : "";
            const notAssigned =
              detail.toLowerCase().includes("kds module has not been assigned");

            results[String(current)] = notAssigned
              ? { assigned: false, reason: "KDS module not assigned" }
              : { assigned: true };
          } catch (e) {
            // Network error: don't block selection; allow user to try.
            results[String(current)] = { assigned: true };
          }
        }
      };

      await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, () => worker()));
      return results;
    },
  });

  useEffect(() => {
    if (outletIdsKey && typeof outletIdsKey === "string") {
      const cached = queryClient.getQueryData(["outlet_kds_assigned", userId, outletIdsKey]);
      if (cached && typeof cached === "object") {
        setKdsStatusByOutletId(cached);
      }
    }
  }, [outletIdsKey, userId]);

  // Keep local state in sync when query resolves
  useEffect(() => {
    const cached = queryClient.getQueryData(["outlet_kds_assigned", userId, outletIdsKey]);
    if (cached && typeof cached === "object") {
      setKdsStatusByOutletId(cached);
    }
  }, [isKdsStatusLoading, outletIdsKey, userId]);

  useEffect(() => {
    setLoading(isLoading);
    if (Array.isArray(outletsData)) {
      setOutlets(outletsData);
      console.log("outletsData", outletsData);
      if (outletsData.length === 1) {
        const singleOutlet = outletsData[0];
        const singleOutletId = String(singleOutlet?.outlet_id);
        const singleKdsStatus = kdsStatusByOutletId?.[singleOutletId];
        const isSingleKdsStatusKnown = singleKdsStatus && typeof singleKdsStatus.assigned === "boolean";

        // Avoid auto-selecting before KDS status is loaded.
        // Otherwise OrdersList will start calling cds_kds_order_listview and spam 400 for invalid outlets.
        const isSingleKdsNotAssigned = isSingleKdsStatusKnown ? singleKdsStatus.assigned === false : false;
        const shouldAutoSelect =
          singleOutlet &&
          singleOutlet.outlet_status !== 0 &&
          isSingleKdsStatusKnown &&
          !isSingleKdsNotAssigned;

        if (shouldAutoSelect) {
          setHideDropdown(true);
          handleSelect(singleOutlet);
        } else {
          setHideDropdown(false);
        }
      } else {
        setHideDropdown(false);
      }
    }
  }, [isLoading, outletsData, kdsStatusByOutletId]);

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

    const outletIdStr = String(outlet?.outlet_id);
    const kdsStatus = kdsStatusByOutletId?.[outletIdStr];
    const isKdsStatusKnown = kdsStatus && typeof kdsStatus.assigned === "boolean";

    // If we haven't finished checking KDS assignment yet, block selection
    // to avoid loading OrdersList with an outlet that will 400.
    if (!isKdsStatusKnown && isKdsStatusLoading) {
      return;
    }

    if (kdsStatus && kdsStatus.assigned === false) return;
    localStorage.setItem("outlet_id", outlet.outlet_id);
    localStorage.setItem("outlet_name", outlet.name);
    sessionStorage.removeItem("kds_fresh_login"); // Allow orders API after outlet selection
    setSelected(outlet);
    setShow(false);
    setSearchTerm("");
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

  const selectedLabel = selected && selected.name && String(selected.name).trim().length > 0 ? toTitleCase(selected.name) : "Select Outlet";

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
                const kdsStatus = kdsStatusByOutletId?.[String(outlet?.outlet_id)];
                const isKdsStatusKnown = kdsStatus && typeof kdsStatus.assigned === "boolean";
                const isKdsNotAssigned = isKdsStatusKnown && kdsStatus.assigned === false;
                const isKdsStatusUnknownAndLoading = !isKdsStatusKnown && isKdsStatusLoading;
                const isDisabled = isInactive || isKdsNotAssigned || isKdsStatusUnknownAndLoading;
                const isSelected = selected && selected.outlet_id === outlet.outlet_id;
                return (
                  <li
                    className={`p-1 m-1 border-[1.5px] rounded-[10px] transition-all duration-150 ${
                      isDisabled
                        ? isInactive
                          ? "bg-[#ffe6e6] border-[#ffe6e6] opacity-70"
                          : "bg-[#f1f1f1] border-[#ddd] opacity-70"
                        : "bg-[#f8f9fa] border-[#bbb] hover:bg-white hover:border-[#0d6efd] hover:shadow-[0_4px_16px_rgba(13,110,253,0.18)]"
                    }`}
                    key={`${outlet.outlet_id}-${index}`}
                  >
                    <button
                      type="button"
                      className={`w-full p-1 m-0 text-left whitespace-normal border-none bg-transparent rounded-lg text-base ${
                        isSelected
                          ? "font-bold text-gray-800 bg-blue-100"
                          : isDisabled
                            ? "text-gray-500 cursor-not-allowed"
                            : "text-gray-800"
                      }`}
                      onClick={() => handleSelect(outlet)}
                      disabled={isDisabled}
                      title={
                        isKdsNotAssigned
                          ? "KDS module not assigned"
                          : isInactive
                            ? "Outlet inactive"
                            : isKdsStatusUnknownAndLoading
                              ? "Checking KDS assignment..."
                              : ""
                      }
                    >
                      <div className="flex items-center">
                        <p className="m-0 p-0 flex-1 whitespace-normal break-words">{toTitleCase(outlet.name)}</p>
                        {isInactive && (
                          <span className="text-xs ml-2 text-[#a30000] font-semibold">
                            Inactive
                          </span>
                        )}
                        {isKdsNotAssigned && (
                          <span className="text-xs ml-2 text-gray-600 font-semibold">
                            No KDS
                          </span>
                        )}
                        {isKdsStatusUnknownAndLoading && (
                          <span className="text-xs ml-2 text-gray-500 font-semibold">...</span>
                        )}
                        {outlet.outlet_code && (
                          <span className="text-xs text-gray-500 ml-1">({outlet.outlet_code})</span>
                        )}
                      </div>
                      {outlet.address && <div className="text-xs text-gray-500">{toTitleCase(outlet.address)}</div>}
                      {outlet.owner_name && (
                        <div className="text-xs text-gray-500">{toTitleCase(outlet.owner_name)}</div>
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
