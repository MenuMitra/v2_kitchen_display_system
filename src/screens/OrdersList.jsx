import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { useQuery } from "@tanstack/react-query";
import { V2_COMMON_BASE, COMMON_API_BASE } from "../config";

const OrdersList = forwardRef(({ outletId, onSubscriptionDataChange }, ref) => {
  const navigate = useNavigate();
  const userRole = localStorage.getItem("user_role") || "";

  const [placedOrders, setPlacedOrders] = useState([]);
  const [cookingOrders, setCookingOrders] = useState([]);
  const [, setPaidOrders] = useState([]);
  const [servedOrders, setServedOrders] = useState([]);
  const [subscriptionData, setSubscriptionData] = useState(null);

  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [previousMenuItems, setPreviousMenuItems] = useState({});
  const [filter, setFilter] = useState("today");
  const [lastRefreshTime, setLastRefreshTime] = useState(null);

  const autoProcessingRef = useRef(new Set());
  
  // Helper functions to manage served orders in localStorage
  const getLocalServedOrders = useCallback(() => {
    try {
      const stored = localStorage.getItem("kds_served_orders");
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }, []);

  const saveLocalServedOrder = useCallback((order) => {
    try {
      const served = getLocalServedOrders();
      served[String(order.order_id)] = order;
      localStorage.setItem("kds_served_orders", JSON.stringify(served));
    } catch (e) {
      console.error("Error saving served order:", e);
    }
  }, [getLocalServedOrders]);

  const removeLocalServedOrder = useCallback((orderId) => {
    try {
      const served = getLocalServedOrders();
      delete served[String(orderId)];
      localStorage.setItem("kds_served_orders", JSON.stringify(served));
    } catch (e) {
      console.error("Error removing served order:", e);
    }
  }, [getLocalServedOrders]);

  const [manualMode, setManualMode] = useState(() => {
    const saved = localStorage.getItem("kds_manual_mode");
    return saved ? JSON.parse(saved) : true;
  });

  // Use only localStorage as the single source of truth to avoid mismatches
  const currentOutletId = localStorage.getItem("outlet_id") || null;
  const numericOutletId = typeof currentOutletId === "string" ? parseInt(currentOutletId, 10) : Number(currentOutletId);
  const isValidOutletId = Number.isFinite(numericOutletId) && numericOutletId > 0;
  const userId = localStorage.getItem("user_id");
  const accessToken = localStorage.getItem("access_token");
  const deviceId = localStorage.getItem("device_id");

  // TanStack Query: fetch orders every 30s, cached 30s
  // Note: queryKey does NOT include filter to prevent cache invalidation on filter change
  const {
    data: ordersResponse,
    refetch,
    isFetching,
    isLoading: queryLoading,
    error: queryError,
  } = useQuery({
    queryKey: ["orders", isValidOutletId ? numericOutletId : null],
    enabled: !!accessToken && isValidOutletId,
    refetchInterval: false,
    queryFn: async () => {
      const response = await fetch(`${V2_COMMON_BASE}/cds_kds_order_listview`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ outlet_id: numericOutletId, date_filter: filter }),
      });
      if (response.status === 401) {
        navigate("/login");
        return {
          placed_orders: [],
          cooking_orders: [],
          paid_orders: [],
          served_orders: [],
          subscription_details: null,
        };
      }
      const result = await response.json();
      return result || {};
    },
  });

  const optimisticOrdersRef = useRef(new Map());

  const recordOptimisticOrder = useCallback((order) => {
    if (!order || !order.order_id) return;
    optimisticOrdersRef.current.set(String(order.order_id), order);
  }, []);

  const clearOptimisticOrder = useCallback((orderId) => {
    if (!orderId) return;
    optimisticOrdersRef.current.delete(String(orderId));
  }, []);

  // Update orders lists locally for immediate UI update on status change
  const updateOrdersStateLocal = useCallback((orderId, nextStatus) => {
    if (!orderId) return;
    const stringOrderId = String(orderId);

    const formatOrderForStatus = (order) => {
      if (!order) return null;
      const updatedOrder = { ...order, order_status: nextStatus };
      if (nextStatus === "served" && Array.isArray(order.menu_details)) {
        updatedOrder.menu_details = order.menu_details.map((m) => ({
          ...m,
          menu_status: "served",
        }));
      }
      return updatedOrder;
    };

    const extractOrder = (setter) => {
      let extracted = null;
      setter((prev) => {
        const index = prev.findIndex((o) => String(o.order_id) === stringOrderId);
        if (index === -1) {
          return prev;
        }
        const next = [...prev];
        extracted = next.splice(index, 1)[0];
        return next;
      });
      return extracted;
    };

    if (nextStatus === "served") {
      let order = extractOrder(setCookingOrders);
      if (!order) {
        order = extractOrder(setPlacedOrders);
      }
      if (!order) {
        order = extractOrder(setPaidOrders);
      }
      const updatedOrder = formatOrderForStatus(order);
      if (updatedOrder) {
        recordOptimisticOrder(updatedOrder);
        // Cache the served order in localStorage
        saveLocalServedOrder(updatedOrder);
        setServedOrders((prev) => {
          const filtered = prev.filter((o) => String(o.order_id) !== stringOrderId);
          return [...filtered, updatedOrder];
        });
      }
      return;
    }

    if (nextStatus === "cooking") {
      const order = extractOrder(setPlacedOrders);
      const updatedOrder = formatOrderForStatus(order);
      if (updatedOrder) {
        recordOptimisticOrder(updatedOrder);
        setCookingOrders((prev) => {
          const filtered = prev.filter((o) => String(o.order_id) !== stringOrderId);
          return [...filtered, updatedOrder];
        });
      }
      return;
    }

    if (nextStatus === "cancelled") {
      clearOptimisticOrder(stringOrderId);
      removeLocalServedOrder(stringOrderId);
      setPlacedOrders((prev) => prev.filter((o) => String(o.order_id) !== stringOrderId));
      setCookingOrders((prev) => prev.filter((o) => String(o.order_id) !== stringOrderId));
      setPaidOrders((prev) => prev.filter((o) => String(o.order_id) !== stringOrderId));
      setServedOrders((prev) => prev.filter((o) => String(o.order_id) !== stringOrderId));
    }
  }, [clearOptimisticOrder, recordOptimisticOrder, setCookingOrders, setPlacedOrders, setPaidOrders, setServedOrders, saveLocalServedOrder, removeLocalServedOrder]);

  const refreshToken = useCallback(async () => {
    const refreshToken = localStorage.getItem("refresh_token");
    if (!refreshToken) return false;
    try {
      const response = await fetch(`${COMMON_API_BASE}/token/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: refreshToken }),
      });
      if (response.ok) {
        const data = await response.json();
        localStorage.setItem("access_token", data.access);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Error refreshing token:", error);
      return false;
    }
  }, []);

  // Update order status on server, then update UI immediately
  const sendOrderStatusUpdate = useCallback(async (orderId, nextStatus = "served") => {
    if (!accessToken || !orderId) {
      navigate("/login");
      return;
    }
    try {
      const data = {
        order_id: String(orderId),
        order_status: nextStatus,
        outlet_id: currentOutletId,
        user_id: userId,
        device_token: deviceId,
        app_source: "kds_app",
      };

      const response = await fetch(`${V2_COMMON_BASE}/update_order_status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        if (response.status === 401) {
          const ok = await refreshToken();
          if (ok) return sendOrderStatusUpdate(orderId, nextStatus);
          navigate("/login");
          return;
        }
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
    } catch (error) {
      console.error("Error updating order status:", error.message);
      clearOptimisticOrder(String(orderId));
      refetch();
    }
  }, [accessToken, clearOptimisticOrder, currentOutletId, deviceId, navigate, refetch, refreshToken, userId]);

  const updateOrderStatus = useCallback(
    (orderId, nextStatus = "served") => {
      updateOrdersStateLocal(orderId, nextStatus);
      sendOrderStatusUpdate(orderId, nextStatus);
    },
    [sendOrderStatusUpdate, updateOrdersStateLocal]
  );

  // Automatically accept placed orders (change to cooking)
  const autoAcceptPlacedOrders = useCallback((orders) => {
    orders.forEach((o) => {
      const id = String(o.order_id);
      if (!autoProcessingRef.current.has(id)) {
        autoProcessingRef.current.add(id);
        updateOrderStatus(id, "cooking").finally(() => {
          autoProcessingRef.current.delete(id);
        });
      }
    });
  }, [updateOrderStatus]);

  // Mirror query data into local UI state
  useEffect(() => {
    if (queryLoading) {
      setInitialLoading(true);
      return;
    }
    if (queryError) {
      setError("Error fetching orders");
      setInitialLoading(false);
      return;
    }
    if (ordersResponse) {
      const result = ordersResponse;
      const optimisticOrders = optimisticOrdersRef.current;
      const optimisticValues = Array.from(optimisticOrders.values());
      const optimisticByStatus = (status) =>
        optimisticValues.filter((order) => order.order_status === status);

      const resolveOptimistic = (orders) => {
        if (!Array.isArray(orders)) return;
        orders.forEach((order) => {
          const optimistic = optimisticOrders.get(String(order.order_id));
          if (optimistic && optimistic.order_status === order.order_status) {
            optimisticOrders.delete(String(order.order_id));
          }
        });
      };

      resolveOptimistic(result.placed_orders);
      resolveOptimistic(result.cooking_orders);
      resolveOptimistic(result.paid_orders);
      resolveOptimistic(result.served_orders);

      const withoutOptimistic = (orders) =>
        Array.isArray(orders)
          ? orders.filter((order) => !optimisticOrders.has(String(order.order_id)))
          : [];

      setPlacedOrders(() => [
        ...withoutOptimistic(result.placed_orders),
        ...optimisticByStatus("placed"),
      ]);
      setCookingOrders(() => [
        ...withoutOptimistic(result.cooking_orders),
        ...optimisticByStatus("cooking"),
      ]);
      setPaidOrders(() => [
        ...withoutOptimistic(result.paid_orders),
        ...optimisticByStatus("paid"),
      ]);
      setServedOrders(() => {
        const serverServed = withoutOptimistic(result.served_orders);
        const optimisticServed = optimisticByStatus("served");
        
        // Ensure all menu items in served orders have menu_status: "served"
        const normalizeServedOrder = (order) => {
          if (order.order_status !== "served") return order;
          return {
            ...order,
            menu_details: Array.isArray(order.menu_details)
              ? order.menu_details.map((m) => ({
                  ...m,
                  menu_status: "served",
                }))
              : [],
          };
        };
        
        const normalizedServerServed = serverServed.map(normalizeServedOrder);
        
        // Update localStorage with server served orders
        normalizedServerServed.forEach((order) => {
          saveLocalServedOrder(order);
        });
        
        // Merge: server served + optimistic + locally cached served orders
        const merged = new Map();
        
        // Add server served orders
        normalizedServerServed.forEach((order) => {
          merged.set(String(order.order_id), order);
        });
        
        // Add optimistic served orders
        optimisticServed.forEach((order) => {
          merged.set(String(order.order_id), order);
        });
        
        // Add locally cached served orders from localStorage (persist them even if server doesn't return them)
        const localServed = getLocalServedOrders();
        Object.values(localServed).forEach((order) => {
          if (!merged.has(String(order.order_id))) {
            merged.set(String(order.order_id), order);
          }
        });
        
        return Array.from(merged.values());
      });
      setSubscriptionData(result.subscription_details || null);
      setLastRefreshTime(new Date().toLocaleTimeString());
      setError(null);
      setInitialLoading(false);

      // snapshot current menus by order for "new item" detection on the NEXT refresh
      try {
        const currentMenusMap = {};
        const collect = (list) => {
          if (!Array.isArray(list)) return;
          list.forEach((o) => {
            currentMenusMap[o.order_id] = Array.isArray(o.menu_details)
              ? o.menu_details.map((m) => m.menu_name)
              : [];
          });
        };
        collect(result.placed_orders);
        collect(result.cooking_orders);
        collect(result.paid_orders);
        collect(result.served_orders);
        setPreviousMenuItems(currentMenusMap);
      } catch (e) {
        // ignore mapping errors
      }

      if (onSubscriptionDataChange) {
        onSubscriptionDataChange(result.subscription_details || null);
      }

      if (!manualMode && Array.isArray(result.placed_orders) && result.placed_orders.length) {
        autoAcceptPlacedOrders(result.placed_orders);
      }
    }
  }, [ordersResponse, queryLoading, queryError, manualMode, onSubscriptionDataChange, autoAcceptPlacedOrders, getLocalServedOrders, saveLocalServedOrder]);

  // Add periodic refresh for faster updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isFetching && !queryLoading) {
        console.log('Periodic refresh triggered...');
        refetch();
      }
    }, 10000); // Refresh every 10 seconds

    return () => clearInterval(interval);
  }, [isFetching, queryLoading, refetch]);

  // Refetch when filter changes
  useEffect(() => {
    refetch();
  }, [filter, refetch]);

  // Update a single menu item status using update_menu_status API
  const handleServeMenuItem = useCallback(
    async (orderId, menu) => {
      if (!accessToken || !orderId || !menu || !menu.menu_id) {
        navigate("/login");
        return;
      }
      try {
        // Build menu_items array with menu_id and optional portion_id
        const menuItem = {
          menu_id: Number(menu.menu_id),
        };
        if (menu.portion_id) {
          menuItem.portion_id = Number(menu.portion_id);
        }

        const data = {
          outlet_id: String(currentOutletId),
          order_id: String(orderId),
          menu_items: [menuItem],
          menu_status: "served",
          app_source: "kds_app",
        };

        const response = await fetch(`${V2_COMMON_BASE}/update_menu_status`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(data),
        });

        if (!response.ok) {
          if (response.status === 401) {
            const ok = await refreshToken();
            if (ok) return handleServeMenuItem(orderId, menu);
            navigate("/login");
            return;
          }
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        // Update local state immediately for responsive UI
        setCookingOrders((prev) =>
          prev.map((order) => {
            if (order.order_id !== orderId) return order;
            if (!Array.isArray(order.menu_details)) return order;
            const updatedMenus = order.menu_details.map((m) =>
              String(m.menu_id) === String(menu.menu_id) ? { ...m, menu_status: "served" } : m
            );
            return { ...order, menu_details: updatedMenus };
          })
        );
      } catch (error) {
        console.error("Error updating menu item status:", error.message);
        // Fallback to refetch to reconcile with server
        refetch();
      }
    },
    [accessToken, currentOutletId, navigate, refetch, refreshToken]
  );

  useImperativeHandle(ref, () => ({
    fetchOrders: refetch,
    subscriptionData,
  }));

  // Separate handler for manual refresh button
  const handleManualRefresh = () => {
    refetch();
  };

  useEffect(() => {
    // Only redirect if authentication essentials are missing; allow staying without outlet
    if (!accessToken || !userId || !deviceId) {
      navigate("/login");
      return;
    }
  }, [accessToken, userId, deviceId, navigate]);

  // CircularCountdown component
  const CircularCountdown = React.memo(({ orderId, order }) => {
    const [timeLeft, setTimeLeft] = useState(90);
    const [isExpired, setIsExpired] = useState(false);
    const timerRef = useRef(null);
    const userRole = localStorage.getItem("user_role") || "";

    useEffect(() => {
      if (!order?.date_time) {
        setIsExpired(true);
        return;
      }

      // Start countdown from 90 seconds immediately
      setTimeLeft(90);
      setIsExpired(false);

      const tick = () => {
        setTimeLeft((prev) => {
          const next = prev - 1;
          if (next <= 0) {
            setIsExpired(true);
            clearInterval(timerRef.current);
            return 0;
          }
          return next;
        });
      };

      // Start the countdown immediately
      timerRef.current = setInterval(tick, 1000);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }, [orderId, order?.date_time]);

    if (isExpired) return null;

    // Clamp timeLeft to ensure percentage stays within 0-100% range
    const clampedTimeLeft = Math.min(Math.max(timeLeft, 0), 90);
    const percentage = (clampedTimeLeft / 90) * 100;

    const handleRejectOrder = async () => {
      if (userRole === "super_owner") return;
      const token = localStorage.getItem("access_token");
      if (!token) {
        navigate("/login");
        return;
      }
      try {
        const response = await fetch(`${V2_COMMON_BASE}/update_order_status`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            outlet_id: currentOutletId,
            order_id: String(orderId),
            order_status: "cancelled",
            user_id: userId,
            device_token: deviceId,
            app_source: "kds_app",
          }),
        });

        if (response.status === 401) {
          navigate("/login");
          return;
        }
      } catch (error) {
        console.error("Error cancelling order:", error);
        alert("Error cancelling order");
      }
    };

    return (
      <div className="flex items-center gap-2">
        <div className="relative w-10 h-10 sm:w-8 sm:h-8 mx-auto">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="#eee"
              strokeWidth="3"
            />
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="#2196f3"
              strokeWidth="3"
              strokeDasharray={`${percentage}, 100`}
            />
          </svg>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-xs sm:text-[10px] font-bold text-gray-800">{timeLeft}s</div>
        </div>
        {userRole !== "super_owner" && order.kds_button_enabled === 1 && (
          <button className="px-2 py-1 text-sm bg-red-500 text-white rounded-3xl hover:bg-red-600 transition-colors" onClick={handleRejectOrder}>
            Reject
          </button>
        )}
      </div>
    );
  });

  const foodTypeColors = useMemo(
    () => ({
      veg: "#00c82fff",
      nonveg: "#cc0000ff",
      vegan: "#c09000ff",
    }),
    []
  );

  const renderOrders = useCallback(
    (orders, type) => {
      if (!Array.isArray(orders)) return null;
      const isSuperOwner = userRole === "super_owner";

      return orders.map((order) => {
        const prevMenuItems = previousMenuItems[order.order_id] || [];
        // Map type to Tailwind colors
        let borderColorClass = "border-[#6c757d]";
        let bgOpacityClass = "bg-gray-500/10";

        if (type === "warning") {
          borderColorClass = "border-[#ffc107]";
          bgOpacityClass = "bg-yellow-500/10";
        } else if (type === "success") {
          borderColorClass = "border-[#198754]";
          bgOpacityClass = "bg-green-500/10";
        }

        // Filter menus per section
        let visibleMenus = Array.isArray(order.menu_details) ? order.menu_details : [];
        if (type === "warning") {
          // Cooking column shows non-served items
          visibleMenus = visibleMenus.filter(
            (m) => (m.menu_status || "cooking") !== "served"
          );
        } else if (type === "success") {
          // Pick Up column shows served items
          visibleMenus = visibleMenus.filter((m) => m.menu_status === "served");
        }

        // Sort: new items first in Cooking
        if (type === "warning" && prevMenuItems.length) {
          visibleMenus = [...visibleMenus].sort((a, b) => {
            const aNew = !prevMenuItems.includes(a.menu_name);
            const bNew = !prevMenuItems.includes(b.menu_name);
            if (aNew === bNew) return 0;
            return aNew ? -1 : 1;
          });
        }

        // Skip rendering card if no visible items for this section
        if (!visibleMenus.length) return null;

        return (
          <div className="w-full" key={order.order_id}>
            <div
              className="bg-white rounded-lg shadow h-auto w-full inline-block overflow-hidden"
            >
              <div className={`${bgOpacityClass} py-2 md:py-2 px-3`}>
                <div className="flex justify-between items-center flex-wrap gap-1 md:gap-0">
                  <p className="text-xl md:text-2xl font-bold mb-0 flex items-center">
                    <i className="bx bx-hash mr-1"></i>{order.order_number}
                  </p>
                  <p className="mb-0 text-base md:text-xl capitalize font-semibold">
                    {order.section_name
                      ? order.section_name
                      : `${order.order_type}${order.table_number?.length
                        ? ` - ${order.table_number.join(", ")}`
                        : ""
                      }`}
                  </p>
                </div>
              </div>
              <div className="p-1">
                {Array.isArray(visibleMenus) && (
                  <div className={visibleMenus.length > 6 ? "overflow-y-auto pr-[2px] max-h-[250px] sm:max-h-[350px] lg:max-h-[400px] [&::-webkit-scrollbar]:w-[4px] [&::-webkit-scrollbar-track]:bg-[#f1f1f1] [&::-webkit-scrollbar-track]:rounded-[2px] [&::-webkit-scrollbar-thumb]:bg-[#888] [&::-webkit-scrollbar-thumb]:rounded-[2px] hover:[&::-webkit-scrollbar-thumb]:bg-[#555]" : ""}>
                    {visibleMenus.map((menu, index) => {
                      const isNewItem =
                        prevMenuItems.length > 0 &&
                        !prevMenuItems.includes(menu.menu_name);

                      const hrColor =
                        foodTypeColors[menu.food_type.toLowerCase()] || "#f21717";

                      return (
                        <div
                          className={`flex flex-wrap justify-between items-center ${type === "placed" ? "border-l-[3px]" : ""} pl-2 mb-0 ${borderColorClass}`}
                          key={index}

                        >
                          <div
                            className={`flex font-semibold capitalize items-center flex-auto min-w-[120px] text-[14px] sm:text-[14px] md:text-[16px] lg:text-[18px] ${isNewItem ? "text-red-500" : ""
                              }`}
                          >
                            <hr
                              className="h-[10px] w-[3px] mr-[5px] p-0 border-0"
                              style={{
                                backgroundColor: hrColor,
                              }}
                            />
                            <p className="mb-0 p-0">{menu.menu_name}</p>
                          </div>
                          <div
                            className={`font-semibold capitalize text-[12px] sm:text-[12px] md:text-[14px] lg:text-[18px] ${isNewItem ? "text-red-500" : ""
                              }`}
                          >
                            {menu.half_or_full}
                          </div>
                          <div
                            className="flex items-center text-right gap-1 md:gap-2 pr-2.5"
                          >
                            <span className="font-semibold text-[14px] sm:text-[14px] md:text-[16px] lg:text-[18px]">
                              × {menu.quantity}
                            </span>
                            {manualMode &&
                              type === "warning" &&
                              !isSuperOwner &&
                              order.kds_button_enabled === 1 && (
                                <button
                                  className="px-2 py-1 text-xs sm:text-xs bg-green-800 text-white rounded-3xl hover:bg-green-600 transition-colors"
                                  onClick={() => handleServeMenuItem(order.order_id, menu)}
                                >
                                  <span className="hidden sm:inline">Served</span>
                                  <span className="sm:hidden">✓</span>
                                </button>
                              )}
                          </div>
                          {menu.comment && (
                            <div
                              className="w-full text-left text-gray-500 text-xs"
                            >
                              <span>{menu.comment}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Only show Complete Order button if kds_button_enabled = 1 */}
                {manualMode && type === "warning" && !isSuperOwner && order.kds_button_enabled === 1 && (
                  <button
                    className="w-full py-2 bg-green-800 text-white rounded-3xl hover:bg-green-600 transition-colors text-sm md:text-base font-medium mt-2"
                    onClick={() => updateOrderStatus(order.order_id, "served")}
                  >
                    <span className="hidden sm:inline">Complete Order</span>
                    <span className="sm:hidden">Complete</span>
                  </button>
                )}

                {/* Render countdown */}
                {manualMode && order.order_status === "placed" && !isSuperOwner && (
                  <div className="flex justify-end mt-2">
                    <CircularCountdown orderId={order.order_id} order={order} />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      });
    },
    [foodTypeColors, handleServeMenuItem, manualMode, previousMenuItems, updateOrderStatus, userRole]
  );

  const outletName = localStorage.getItem("outlet_name");

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <Header
        outletName={localStorage.getItem("outlet_name") || ""}
        filter={filter}
        onFilterChange={setFilter}
        onRefresh={handleManualRefresh} // Use separated manual refresh
        manualMode={manualMode}
        onToggleManualMode={setManualMode}
        selectedOutlet={{ outlet_id: currentOutletId, name: outletName }}
        subscriptionData={subscriptionData}
      />
      {!outletName ? (
        <div className="flex flex-col min-h-screen justify-between">
          <div>
            <div className="bg-yellow-100 border-l-4 border-yellow-500 text-yellow-700 p-4 text-center mb-0">
              Please select an outlet to view orders.
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col flex-grow">
          <div className="flex-grow p-3">
            {initialLoading && (
              <div className="text-center mt-5 text-gray-600">Loading orders...</div>
            )}
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative text-center mt-5">{error}</div>
            )}

            {!initialLoading && !error && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">

                <div className="mb-3 md:mb-0">
                  <h4 className="text-3xl text-white text-center font-bold mb-2 md:mb-3 lg:mb-4 bg-gray-500 py-2 md:py-3 flex items-center justify-center rounded-lg">
                    <span className="text-xl md:text-2xl lg:text-3xl">Placed ({placedOrders.length})</span>
                  </h4>
                  <div className="grid grid-cols-1 gap-2 md:gap-3">{renderOrders(placedOrders, "placed")}</div>
                </div>
                <div className="mb-3 md:mb-0">
                  <h4 className="text-3xl text-white text-center font-bold mb-2 md:mb-3 lg:mb-4 bg-yellow-500 py-2 md:py-3 flex items-center justify-center rounded-lg">
                    <span className="text-xl md:text-2xl lg:text-3xl">Cooking ({cookingOrders.length})</span>
                  </h4>
                  {/*
                    For Cooking: only show items that are not yet served in each order
                  */}
                  <div className="grid grid-cols-1 gap-2 md:gap-3 justify-center">
                    {renderOrders(
                      cookingOrders.map((o) => ({
                        ...o,
                        menu_details: Array.isArray(o.menu_details)
                          ? o.menu_details.filter((m) => (m.menu_status || "cooking") !== "served")
                          : [],
                      })),
                      "warning"
                    )}
                  </div>
                </div>
                <div className="mb-3 md:mb-0">
                  <h4 className="text-3xl text-white text-center font-bold mb-2 md:mb-3 lg:mb-4 bg-green-800 py-2 md:py-3 flex items-center justify-center rounded-lg">
                    <span className="text-xl md:text-2xl lg:text-3xl">Pick Up ({servedOrders.length})</span>
                  </h4>
                  {/*
                    For Pick Up: show served items from both servedOrders and cookingOrders
                  */}
                  <div className="grid grid-cols-1 gap-2 md:gap-3">
                    {renderOrders(
                      // merge cooking and served by order_id, prefer servedOrders base when duplicates
                      (() => {
                        const map = new Map();
                        [...cookingOrders, ...servedOrders].forEach((o) => {
                          const existing = map.get(o.order_id);
                          if (!existing || existing.order_status !== "served") {
                            map.set(o.order_id, o);
                          }
                        });
                        const orders = Array.from(map.values()).map((o) => ({
                          ...o,
                          order_status: o.order_status === "served" ? "served" : "cooking",
                          menu_details: Array.isArray(o.menu_details)
                            ? o.menu_details.filter((m) => m.menu_status === "served")
                            : [],
                        }));
                        
                        // Sort by date_time in descending order (latest first)
                        return orders.sort((a, b) => {
                          const dateA = new Date(a.date_time || 0).getTime();
                          const dateB = new Date(b.date_time || 0).getTime();
                          return dateB - dateA;
                        });
                      })(),
                      "success"
                    )}
                  </div>
                </div>
                {lastRefreshTime && (
                  <div className="col-span-1 md:col-span-2 lg:col-span-3 text-center mt-2 text-gray-500 text-xs">Last refreshed at: {lastRefreshTime}</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default React.memo(OrdersList);