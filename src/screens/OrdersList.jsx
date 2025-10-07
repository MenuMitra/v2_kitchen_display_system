import React, {
  useEffect,
  useState,
  useRef,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import { useQuery } from "@tanstack/react-query";
import { ENV } from "../config/env";

const styles = `
  .circular-countdown {
    position: relative;
    width: 40px;
    height: 40px;
    margin: 0 auto;
  }
  .circular-timer { transform: rotate(-90deg); width: 100%; height: 100%; }
  .timer-text-overlay {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -50%); font-size: 12px; font-weight: bold;
  }
  .font_size_14 { font-size: 14px; }
  .font_size_12 { font-size: 12px; }
  .menu-item-text { font-size: 18px !important; }
  .menu-items-scroll {
    max-height: 400px;
    overflow-y: auto;
    padding-right: 2px;
  }
  .menu-items-scroll::-webkit-scrollbar {
    width: 4px;
  }
  .menu-items-scroll::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 2px;
  }
  .menu-items-scroll::-webkit-scrollbar-thumb {
    background: #888;
    border-radius: 2px;
  }
  .menu-items-scroll::-webkit-scrollbar-thumb:hover {
    background: #555;
  }
`;
const styleSheet = document.createElement("style");
styleSheet.innerText = styles;
document.head.appendChild(styleSheet);

const OrdersList = forwardRef(({ outletId, onSubscriptionDataChange }, ref) => {
  const navigate = useNavigate();
  const userRole = localStorage.getItem("user_role") || "";

  const [placedOrders, setPlacedOrders] = useState([]);
  const [cookingOrders, setCookingOrders] = useState([]);
  const [paidOrders, setPaidOrders] = useState([]);
  const [servedOrders, setServedOrders] = useState([]);
  const [subscriptionData, setSubscriptionData] = useState(null);

  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState(null);
  const [previousMenuItems, setPreviousMenuItems] = useState({});
  const [filter, setFilter] = useState("today");
  const [lastRefreshTime, setLastRefreshTime] = useState(null);

  const autoProcessingRef = useRef(new Set());

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
  const {
    data: ordersResponse,
    refetch,
    isFetching,
    isLoading: queryLoading,
    error: queryError,
  } = useQuery({
    queryKey: ["orders", isValidOutletId ? numericOutletId : null, filter],
    enabled: !!accessToken && isValidOutletId,
    refetchInterval: false,
    queryFn: async () => {
      const response = await fetch(`${ENV.V2_COMMON_BASE}/cds_kds_order_listview`, {
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

  // Update orders lists locally for immediate UI update on status change
  const updateOrdersStateLocal = useCallback((orderId, nextStatus) => {
    const moveOrder = (orders, setter) => {
      const index = orders.findIndex((o) => o.order_id === orderId);
      if (index === -1) return null;
      const order = orders[index];
      order.order_status = nextStatus;
      const newOrders = [...orders];
      newOrders.splice(index, 1);
      setter(newOrders);
      return order;
    };

    if (nextStatus === "served") {
      let order = moveOrder(cookingOrders, setCookingOrders);
      if (order) {
        setServedOrders((prev) => [...prev, order]);
        return;
      }
      order = moveOrder(placedOrders, setPlacedOrders);
      if (order) {
        setServedOrders((prev) => [...prev, order]);
        return;
      }
    } else if (nextStatus === "cooking") {
      const order = moveOrder(placedOrders, setPlacedOrders);
      if (order) {
        setCookingOrders((prev) => [...prev, order]);
      }
    } else if (nextStatus === "cancelled") {
      setPlacedOrders((prev) => prev.filter((o) => o.order_id !== orderId));
      setCookingOrders((prev) => prev.filter((o) => o.order_id !== orderId));
      setPaidOrders((prev) => prev.filter((o) => o.order_id !== orderId));
      setServedOrders((prev) => prev.filter((o) => o.order_id !== orderId));
    }
  }, [cookingOrders, placedOrders, setCookingOrders, setPlacedOrders, setServedOrders, setPaidOrders]);

  // Update order status on server, then update UI immediately
  const updateOrderStatus = useCallback(async (orderId, nextStatus = "served") => {
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

      const response = await fetch(`${ENV.V2_COMMON_BASE}/update_order_status`, {
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
          if (ok) return updateOrderStatus(orderId, nextStatus);
          navigate("/login");
          return;
        }
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
      updateOrdersStateLocal(orderId, nextStatus);
    } catch (error) {
      console.error("Error updating order status:", error.message);
      refetch();
    }
  }, [accessToken, currentOutletId, userId, deviceId, navigate, refetch, updateOrdersStateLocal]);

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
      setPlacedOrders(result.placed_orders || []);
      setCookingOrders(result.cooking_orders || []);
      setPaidOrders(result.paid_orders || []);
      setServedOrders(result.served_orders || []);
      setSubscriptionData(result.subscription_details || null);
      setLastRefreshTime(new Date().toLocaleTimeString());
      setError(null);
      setInitialLoading(false);

      if (onSubscriptionDataChange) {
        onSubscriptionDataChange(result.subscription_details || null);
      }

      if (!manualMode && Array.isArray(result.placed_orders) && result.placed_orders.length) {
        autoAcceptPlacedOrders(result.placed_orders);
      }
    }
  }, [ordersResponse, queryLoading, queryError, manualMode, onSubscriptionDataChange, autoAcceptPlacedOrders]);

  // Add periodic refresh for faster updates
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isFetching && !queryLoading) {
        console.log('Periodic refresh triggered...');
        refetch();
      }
    }, 2000); // Refresh every 30 seconds

    return () => clearInterval(interval);
  }, [isFetching, queryLoading, refetch]);

  const refreshToken = async () => {
    const refreshToken = localStorage.getItem("refresh_token");
    if (!refreshToken) return false;
    try {
      const response = await fetch(`${ENV.COMMON_API_BASE}/token/refresh`, {
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
  };

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

  // CircularCountdown component (unchanged except for using updated updateOrderStatus)
  const CircularCountdown = React.memo(({ orderId, order }) => {
    const [timeLeft, setTimeLeft] = useState(40);
    const [isExpired, setIsExpired] = useState(false);
    const timerRef = useRef(null);
    const userRole = localStorage.getItem("user_role") || "";

    useEffect(() => {
      if (!order?.date_time) {
        setIsExpired(true);
        return;
      }
      try {
        const [day, month, year, time, period] = order.date_time.split(" ");
        const [hours, minutes, seconds] = time.split(":");
        let hrs = parseInt(hours, 10);
        if (period === "PM" && hrs !== 12) hrs += 12;
        if (period === "AM" && hrs === 12) hrs = 0;

        const months = {
          Jan: 0,
          Feb: 1,
          Mar: 2,
          Apr: 3,
          May: 4,
          Jun: 5,
          Jul: 6,
          Aug: 7,
          Sep: 8,
          Oct: 9,
          Nov: 10,
          Dec: 11,
        };
        const orderDate = new Date(
          parseInt(year, 10),
          months[month],
          parseInt(day, 10),
          hrs,
          parseInt(minutes, 10),
          parseInt(seconds, 10)
        );
        const expiryTime = orderDate.getTime() + 90 * 1000;
        const now = Date.now();

        if (expiryTime > now) {
          const tick = () => {
            const remaining = Math.max(Math.floor((expiryTime - Date.now()) / 1000), 0);
            if (remaining <= 0) {
              setIsExpired(true);
              clearInterval(timerRef.current);
              return;
            }
            setTimeLeft(remaining);
          };
          tick();
          timerRef.current = setInterval(tick, 1000);
        } else {
          setIsExpired(true);
        }
      } catch (error) {
        console.error("Error in countdown:", error);
        setIsExpired(true);
      }
      return () => timerRef.current && clearInterval(timerRef.current);
    }, [orderId, order?.date_time]);

    if (isExpired) return null;

    const percentage = (timeLeft / 90) * 100;

    const handleRejectOrder = async () => {
      if (userRole === "super_owner") return;
      const token = localStorage.getItem("access_token");
      if (!token) {
        navigate("/login");
        return;
      }
      try {
        const response = await fetch(`${ENV.V2_COMMON_BASE}/update_order_status`, {
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
      <div className="d-flex align-items-center gap-2">
        <div className="circular-countdown">
          <svg viewBox="0 0 36 36" className="circular-timer">
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
          <div className="timer-text-overlay text-dark">{timeLeft}s</div>
        </div>
        {userRole !== "super_owner" && order.kds_button_enabled === 1 && (
          <button className="btn btn-danger btn-sm" onClick={handleRejectOrder}>
            Reject
          </button>
        )}
      </div>
    );
  });

  const foodTypeColors = {
    veg: "#00c82fff",
    nonveg: "#cc0000ff",
    vegan: "#c09000ff",
  };

  const renderOrders = useCallback(
    (orders, type) => {
      if (!Array.isArray(orders)) return null;
      const isSuperOwner = userRole === "super_owner";

      return orders.map((order) => {
        const prevMenuItems = previousMenuItems[order.order_id] || [];
        const cssType = type === "placed" ? "secondary" : type;

        return (
          <div className="col-12" key={order.order_id}>
            <div
              className="card bg-white rounded-3"
              style={{
                height: "auto",
                minHeight: "unset",
                display: "inline-block",
                width: "100%",
              }}
            >
              <div className={`bg-${cssType} bg-opacity-10 py-2`}>
                <div className="d-flex justify-content-between align-items-center">
                  <p className="fs-3 fw-bold mb-0 order-tables-orders">
                    <i className="bx bx-hash"></i>{order.order_number}
                  </p>
                  <p className="mb-0 fs-5 text-capitalize fw-semibold order-tables-orders-number">
                    {order.section_name
                      ? order.section_name
                      : `${order.order_type}${
                          order.table_number?.length
                            ? ` - ${order.table_number.join(", ")}`
                            : ""
                        }`}
                  </p>
                </div>
              </div>
              <div className="card-body p-1">
                {Array.isArray(order.menu_details) && (
                  <div className={order.menu_details.length > 6 ? "menu-items-scroll" : ""}>
                    {order.menu_details.map((menu, index) => {
                      const isNewItem =
                        prevMenuItems.length > 0 &&
                        !prevMenuItems.includes(menu.menu_name);

                      const hrColor =
                        foodTypeColors[menu.food_type.toLowerCase()] || "#f21717";

                      return (
                        <div
                          className={`d-flex flex-wrap justify-content-between align-items-center border-${cssType} border-3 ps-2 mb-2`}
                          key={index}
                          style={{ margin: "0px", padding: "0px" }}
                        >
                          <div
                            className={`d-flex fw-semibold text-capitalize menu-item-text ${
                              isNewItem ? "text-danger" : ""
                            }`}
                            style={{ alignItems: "center" }}
                          >
                            <hr
                              style={{
                                height: "20px",
                                backgroundColor: hrColor,
                                border: "none",
                                width: "3px",
                                margin: "0 5px 0 0",
                                padding: "0px",
                              }}
                            />
                            <p className="mb-0">{menu.menu_name}</p>
                          </div>
                          <div
                            className={`fw-semibold text-capitalize menu-item-text ${
                              isNewItem ? "text-danger" : ""
                            }`}
                          >
                            {menu.half_or_full}
                          </div>
                          <div
                            className="d-flex align-items-center text-end gap-2"
                            style={{ paddingRight: "10px" }}
                          >
                            <span className="fw-semibold menu-item-text">
                              × {menu.quantity}
                            </span>
                          </div>
                          {menu.comment && (
                            <div
                              className="w-100 text-start text-muted"
                              style={{ fontSize: "0.75rem" }}
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
                    className="btn btn-success w-100"
                    onClick={() => updateOrderStatus(order.order_id, "served")}
                  >
                    Complete Order
                  </button>
                )}

                {/* Render countdown */}
                {manualMode && order.order_status === "placed" && !isSuperOwner && (
                  <div className="d-flex justify-content-end mt-2">
                    <CircularCountdown orderId={order.order_id} order={order} />
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      });
    },
    [manualMode, previousMenuItems, updateOrderStatus, userRole]
  );

  const outletName = localStorage.getItem("outlet_name");

  return (
    <div className="min-vh-100 d-flex flex-column bg-light">
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
        <div className="d-flex flex-column min-vh-100 justify-content-between">
          <div>
            <div className="alert alert-warning text-center mb-0 rounded-0">
              Please select an outlet to view orders.
            </div>
          </div>
        </div>
      ) : (
        <div className="d-flex flex-column flex-grow-1">
          <div className="flex-grow-1 p-3">
            {initialLoading && (
              <div className="text-center mt-5">Loading orders...</div>
            )}
            {error && (
              <div className="alert alert-danger text-center mt-5">{error}</div>
            )}

            {!initialLoading && !error && (
              <div className="row g-3  main-kds-view-container">
              
                <div className="col-4 child-container">
                  <h4 className="display-5 text-white text-center fw-bold mb-3 mb-md-4 bg-secondary py-2 d-flex align-items-center justify-content-center rounded-4">
                    Placed ({placedOrders.length})
                  </h4>
                  <div className="row g-3">{renderOrders(placedOrders, "secondary")}</div>
                </div>
                <div className="col-4 child-container">
                  <h4 className="display-5 text-white text-center fw-bold mb-3 mb-md-4 bg-warning py-2 d-flex align-items-center justify-content-center rounded-4">
                    Cooking ({cookingOrders.length})
                  </h4>
                  
                  <div className="row g-3 justify-content-center">{renderOrders(cookingOrders, "warning")}</div>
                </div>
                <div className="col-4 child-container">
                  <h4 className="display-5 text-white text-center fw-bold mb-3 mb-md-4 bg-success py-2 d-flex align-items-center justify-content-center rounded-4">
                    Pick Up ({servedOrders.length})
                  </h4>
                  <div className="row g-3">{renderOrders(servedOrders, "success")}</div>
                </div>
                {lastRefreshTime && (
                  <div className="text-center mt-2 text-muted">Last refreshed at: {lastRefreshTime}</div>
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
