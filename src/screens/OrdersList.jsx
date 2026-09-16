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
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { V2_COMMON_BASE, COMMON_API_BASE, WS_ORDER_BASE } from "../config";
import { buildAuthHeaders, getDeviceSessionFields } from "../utils/apiClient";
import { logoutAndRedirect } from "../utils/authStorage";
import { createOrderWebSocket } from "../utils/orderWebSocket";
import { notifyOrderEvent, requestNotificationPermission } from "../utils/orderNotifications";

const OrdersList = forwardRef(({ outletId, onSubscriptionDataChange }, ref) => {
  const navigate = useNavigate();
  const userRole = localStorage.getItem("user_role") || "";

  const [placedOrders, setPlacedOrders] = useState([]);
  const [cookingOrders, setCookingOrders] = useState([]);
  const [, setPaidOrders] = useState([]);
  const [servedOrders, setServedOrders] = useState([]);
  const [subscriptionData, setSubscriptionData] = useState(null);

  const [initialLoading, setInitialLoading] = useState(true);
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [error, setError] = useState(null);
  const [previousMenuItems, setPreviousMenuItems] = useState({});
  const [filter, setFilter] = useState("today");
  const [lastRefreshTime, setLastRefreshTime] = useState(null);
  const [activeTab, setActiveTab] = useState("ALL");
  const [, setOutletSelectKey] = useState(0); // Forces re-render when outlet selected

  const autoProcessingRef = useRef(new Set());
  const hasInitialOrdersLoadedRef = useRef(false);

  // Backend may return inconsistent item-level statuses during refresh.
  // Remember which specific menu/combo items the user marked as "served",
  // and re-apply those overrides to every cds_kds_order_listview response.
  const locallyServedItemsRef = useRef(new Map());
  const getLocalServedEntry = (orderId) => {
    const key = String(orderId);
    let entry = locallyServedItemsRef.current.get(key);
    if (!entry) {
      entry = { menuIds: new Set(), comboIds: new Set() };
      locallyServedItemsRef.current.set(key, entry);
    }
    return entry;
  };
  const markLocalMenuServed = (orderId, menuId) => {
    if (!orderId || !menuId) return;
    getLocalServedEntry(orderId).menuIds.add(String(menuId));
  };
  const unmarkLocalMenuServed = (orderId, menuId) => {
    if (!orderId || !menuId) return;
    const entry = locallyServedItemsRef.current.get(String(orderId));
    if (!entry) return;
    entry.menuIds.delete(String(menuId));
  };
  const markLocalComboServed = (orderId, comboIdentifier) => {
    if (!orderId || !comboIdentifier) return;
    getLocalServedEntry(orderId).comboIds.add(String(comboIdentifier));
  };
  const unmarkLocalComboServed = (orderId, comboIdentifier) => {
    if (!orderId || !comboIdentifier) return;
    const entry = locallyServedItemsRef.current.get(String(orderId));
    if (!entry) return;
    entry.comboIds.delete(String(comboIdentifier));
  };
  const applyLocalServedOverridesToOrder = (order) => {
    if (!order || !order.order_id) return order;
    const orderKey = String(order.order_id);
    const entry = locallyServedItemsRef.current.get(orderKey);
    if (!entry) return order;

    let next = order;

    if (Array.isArray(order.menu_details) && entry.menuIds.size > 0) {
      next = {
        ...next,
        menu_details: order.menu_details.map((m) => {
          const id = m?.order_menu_mapping_id ?? m?.menu_id ?? "";
          return entry.menuIds.has(String(id)) ? { ...m, menu_status: "served" } : m;
        }),
      };
    }

    if (Array.isArray(order.combo_details) && entry.comboIds.size > 0) {
      next = {
        ...next,
        combo_details: order.combo_details.map((c) => {
          // Use per-order mapping id first to avoid serving duplicate combo masters together.
          const id =
            c?.order_combo_mapping_id ??
            c?.combo_master_id ??
            c?.combo_id ??
            c?.menu_id ??
            "";
          return entry.comboIds.has(String(id)) ? { ...c, menu_status: "served" } : c;
        }),
      };
    }

    return next;
  };

  const onOutletSelect = useCallback(() => {
    locallyServedItemsRef.current = new Map();
    setOutletSelectKey((k) => k + 1);
  }, []);
  const servingMenuItemsRef = useRef(new Set());

  const getServedOrdersStorageKey = useCallback(() => {
    const outletId = localStorage.getItem("outlet_id") || "none";
    return `kds_served_orders_${outletId}`;
  }, []);

  // Helper functions to manage served orders in localStorage (scoped per outlet)
  const getLocalServedOrders = useCallback(() => {
    try {
      const stored = localStorage.getItem(getServedOrdersStorageKey());
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  }, [getServedOrdersStorageKey]);

  const saveLocalServedOrder = useCallback((order) => {
    try {
      const served = getLocalServedOrders();
      served[String(order.order_id)] = order;
      localStorage.setItem(getServedOrdersStorageKey(), JSON.stringify(served));
    } catch (e) {
      console.error("Error saving served order:", e);
    }
  }, [getLocalServedOrders, getServedOrdersStorageKey]);

  const removeLocalServedOrder = useCallback((orderId) => {
    try {
      const served = getLocalServedOrders();
      delete served[String(orderId)];
      localStorage.setItem(getServedOrdersStorageKey(), JSON.stringify(served));
    } catch (e) {
      console.error("Error removing served order:", e);
    }
  }, [getLocalServedOrders, getServedOrdersStorageKey]);

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

  // Block orders API until outlet is selected AND the live WebSocket is connected.
  const isFreshLogin = typeof sessionStorage !== "undefined" && !!sessionStorage.getItem("kds_fresh_login");
  const canConnectWs = !!accessToken && isValidOutletId && !isFreshLogin;
  const shouldFetchOrders = canConnectWs && isWsConnected;

  const previousOutletRef = useRef(currentOutletId);

  // Reset UI state immediately when outlet changes to avoid stale cards from previous outlet.
  useEffect(() => {
    if (previousOutletRef.current === currentOutletId) return;
    previousOutletRef.current = currentOutletId;

    optimisticOrdersRef.current = new Map();
    locallyServedItemsRef.current = new Map();
    autoProcessingRef.current = new Set();

    setPlacedOrders([]);
    setCookingOrders([]);
    setPaidOrders([]);
    setServedOrders([]);
    setPreviousMenuItems({});
    setSubscriptionData(null);
    setLastRefreshTime(null);
    setError(null);
    setIsWsConnected(false);
    setInitialLoading(canConnectWs);
    hasInitialOrdersLoadedRef.current = false;
  }, [currentOutletId, canConnectWs]);

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // Fetch cds_kds_order_listview only after the outlet WebSocket is connected.
  // Note: queryKey does NOT include filter to prevent cache invalidation on filter change
  const {
    data: ordersResponse,
    refetch,
    isLoading: queryLoading,
    error: queryError,
  } = useQuery({
    queryKey: ["orders", isValidOutletId ? numericOutletId : null],
    enabled: shouldFetchOrders,
    staleTime: 0,
    refetchInterval: false,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const response = await fetch(`${V2_COMMON_BASE}/cds_kds_order_listview`, {
        method: "POST",
        headers: buildAuthHeaders(),
        body: JSON.stringify({
          outlet_id: numericOutletId,
          date_filter: filter,
          app_source: "kds_app",
          ...getDeviceSessionFields(),
        }),
      });
      if (response.status === 401) {
        logoutAndRedirect(navigate);
        throw new Error("Session expired");
      }
      if (!response.ok) {
        // e.g. 400 when KDS is not assigned for this outlet
        const json = await response.json().catch(() => ({}));
        const detail = typeof json?.detail === "string" ? json.detail : `HTTP ${response.status}`;
        throw new Error(detail);
      }

      const result = await response.json();
      return result || {};
    },
  });

  // Connect live order socket first; listview is gated on isWsConnected.
  useEffect(() => {
    if (!canConnectWs || !currentOutletId || !accessToken) {
      setIsWsConnected(false);
      return undefined;
    }

    const connection = createOrderWebSocket({
      wsBaseUrl: WS_ORDER_BASE,
      outletId: currentOutletId,
      accessToken,
      onOpen: () => setIsWsConnected(true),
      onClose: () => setIsWsConnected(false),
      onOrderEvent: (payload) => {
        if (hasInitialOrdersLoadedRef.current) {
          notifyOrderEvent(payload);
        }
        refetch();
      },
    });

    return () => {
      connection?.close();
      setIsWsConnected(false);
    };
  }, [accessToken, canConnectWs, currentOutletId, refetch]);

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
      if (nextStatus === "served" && Array.isArray(order.combo_details)) {
        updatedOrder.combo_details = order.combo_details.map((c) => ({
          ...c,
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
      logoutAndRedirect(navigate);
      return;
    }
    try {
      const data = {
        order_id: String(orderId),
        order_status: nextStatus,
        outlet_id: currentOutletId,
        user_id: userId,
        device_token: deviceId,
        device_id: deviceId,
        app_source: "kds_app",
      };

      const response = await fetch(`${V2_COMMON_BASE}/update_order_status`, {
        method: "PATCH",
        headers: buildAuthHeaders(),
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        if (response.status === 401) {
          const ok = await refreshToken();
          if (ok) return sendOrderStatusUpdate(orderId, nextStatus);
          logoutAndRedirect(navigate);
          return;
        }
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      // Hard-sync after successful "served" transition so Pickup updates immediately
      // and does not wait for manual refresh/next polling tick.
      if (nextStatus === "served") {
        refetch();
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
    if (canConnectWs && ordersResponse === undefined && (!isWsConnected || queryLoading)) {
      setInitialLoading(true);
      return;
    }
    if (queryError) {
      const message = typeof queryError?.message === "string" ? queryError.message : "Error fetching orders";
      setError(message);
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

      // Apply locally-served item overrides to every order from the server.
      // This prevents served items from disappearing/reverting after refresh.
      const withLocalOverrides = (orders) =>
        Array.isArray(orders) ? orders.map((o) => applyLocalServedOverridesToOrder(o)) : [];

      const placedOrdersFromServer = withLocalOverrides(result.placed_orders);
      const cookingOrdersFromServer = withLocalOverrides(result.cooking_orders);
      const paidOrdersFromServer = withLocalOverrides(result.paid_orders);
      const servedOrdersFromServer = withLocalOverrides(result.served_orders);

      const isOrderFullyServed = (order) => {
        const menus = Array.isArray(order?.menu_details) ? order.menu_details : [];
        const combos = Array.isArray(order?.combo_details) ? order.combo_details : [];
        const totalItems = menus.length + combos.length;
        if (totalItems === 0) return false; // don't promote orders with no items

        const allMenusServed = menus.every((m) => (m?.menu_status || "cooking") === "served");
        const allCombosServed = combos.every((c) => (c?.menu_status || "cooking") === "served");
        return allMenusServed && allCombosServed;
      };

      const promoteOrderToServed = (order) => ({
        ...order,
        order_status: "served",
        menu_details: Array.isArray(order?.menu_details)
          ? order.menu_details.map((m) => ({ ...m, menu_status: "served" }))
          : [],
        combo_details: Array.isArray(order?.combo_details)
          ? order.combo_details.map((c) => ({ ...c, menu_status: "served" }))
          : [],
      });

      // Frontend safeguard: server may keep order_status as "cooking"
      // even when all items are served. Promote those orders into served.
      const fullyServedFromCooking = cookingOrdersFromServer.filter(isOrderFullyServed).map(promoteOrderToServed);
      const remainingCookingOrdersFromServer = cookingOrdersFromServer.filter((o) => !isOrderFullyServed(o));

      setPlacedOrders(() => [
        ...withoutOptimistic(placedOrdersFromServer),
        ...optimisticByStatus("placed"),
      ]);
      setCookingOrders(() => [
        ...withoutOptimistic(remainingCookingOrdersFromServer),
        ...optimisticByStatus("cooking"),
      ]);
      setPaidOrders(() => [
        ...withoutOptimistic(paidOrdersFromServer),
        ...optimisticByStatus("paid"),
      ]);
      setServedOrders(() => {
        const promotedAndServerServed = [...fullyServedFromCooking, ...servedOrdersFromServer];
        const serverServed = withoutOptimistic(promotedAndServerServed);
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
            combo_details: Array.isArray(order.combo_details)
              ? order.combo_details.map((c) => ({
                  ...c,
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
      hasInitialOrdersLoadedRef.current = true;

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
  }, [canConnectWs, isWsConnected, ordersResponse, queryLoading, queryError, manualMode, onSubscriptionDataChange, autoAcceptPlacedOrders, getLocalServedOrders, saveLocalServedOrder]);

  // Refetch when the date filter changes. Do not refetch just because the
  // WebSocket connected — enabling the query already loads the list.
  const previousFilterRef = useRef(filter);
  useEffect(() => {
    const filterChanged = previousFilterRef.current !== filter;
    previousFilterRef.current = filter;
    if (filterChanged && shouldFetchOrders) {
      refetch();
    }
  }, [filter, refetch, shouldFetchOrders]);

  // Update a single menu item status using update_order_status API
  const handleServeMenuItem = useCallback(
    async (orderId, menu) => {
      const menuIdentifier =
        menu?.order_menu_mapping_id ?? menu?.menu_id ?? null;

      if (!accessToken || !orderId || !menu || !menuIdentifier) {
        logoutAndRedirect(navigate);
        return;
      }

      // Prevent double-clicks
      const menuKey = `${orderId}_${menuIdentifier}`;
      if (servingMenuItemsRef.current.has(menuKey)) return;
      servingMenuItemsRef.current.add(menuKey);

      // Optimistic UI update BEFORE the API call
      markLocalMenuServed(orderId, menuIdentifier);
      setCookingOrders((prev) =>
        prev.map((order) => {
          if (String(order.order_id) !== String(orderId)) return order;
          if (!Array.isArray(order.menu_details)) return order;
          const updatedMenus = order.menu_details.map((m) =>
            String(m?.order_menu_mapping_id ?? m?.menu_id ?? "") === String(menuIdentifier)
              ? { ...m, menu_status: "served" }
              : m
          );
          return { ...order, menu_details: updatedMenus };
        })
      );

      try {
        const data = {
          order_id: String(orderId),
          ...(menu?.menu_id ? { menu_id: String(menu.menu_id) } : {}),
          ...(menu?.order_menu_mapping_id
            ? { order_menu_mapping_id: String(menu.order_menu_mapping_id) }
            : {}),
          order_status: "served",
          outlet_id: currentOutletId,
          user_id: userId,
          device_token: deviceId,
          app_source: "kds_app",
        };

        const response = await fetch(`${V2_COMMON_BASE}/update_order_status`, {
          method: "PATCH",
          headers: buildAuthHeaders(),
          body: JSON.stringify({ ...getDeviceSessionFields(), ...data }),
        });

        if (!response.ok) {
          if (response.status === 401) {
            const ok = await refreshToken();
            if (ok) {
              servingMenuItemsRef.current.delete(menuKey);
              return handleServeMenuItem(orderId, menu);
            }
            logoutAndRedirect(navigate);
            return;
          }
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
      } catch (error) {
        console.error("Error updating menu item status:", error.message);
        // Revert optimistic update on error
        unmarkLocalMenuServed(orderId, menuIdentifier);
        setCookingOrders((prev) =>
          prev.map((order) => {
            if (String(order.order_id) !== String(orderId)) return order;
            if (!Array.isArray(order.menu_details)) return order;
            const revertedMenus = order.menu_details.map((m) =>
              String(m?.order_menu_mapping_id ?? m?.menu_id ?? "") === String(menuIdentifier)
                ? { ...m, menu_status: "cooking" }
                : m
            );
            return { ...order, menu_details: revertedMenus };
          })
        );
        refetch();
      } finally {
        servingMenuItemsRef.current.delete(menuKey);
      }
    },
    [accessToken, currentOutletId, deviceId, navigate, refetch, refreshToken, userId]
  );

  // Update a single combo item status using update_order_status API
  const handleServeComboItem = useCallback(
    async (orderId, combo) => {
      // Only guard on essential auth/order fields here.
      // Combo items from API use `combo_master_id` (not `combo_id`), so we must NOT
      // treat missing `combo_id` as an auth failure that forces logout.
      if (!accessToken || !orderId || !combo) {
        logoutAndRedirect(navigate);
        return;
      }

      // Prefer per-order unique identifier to avoid duplicate combo collisions.
      const comboIdentifier =
        combo?.order_combo_mapping_id ??
        combo?.combo_master_id ??
        combo?.combo_id ??
        combo?.menu_id ??
        "";

      // Prevent double-clicks
      const comboKey = `combo_${orderId}_${comboIdentifier}`;
      if (servingMenuItemsRef.current.has(comboKey)) return;
      servingMenuItemsRef.current.add(comboKey);

      // Optimistic UI update BEFORE the API call
      markLocalComboServed(orderId, comboIdentifier);
      setCookingOrders((prev) =>
        prev.map((order) => {
          if (String(order.order_id) !== String(orderId)) return order;
          if (!Array.isArray(order.combo_details)) return order;
          const updatedCombos = order.combo_details.map((c) =>
            String(
              c?.order_combo_mapping_id ??
                c?.combo_master_id ??
                c?.combo_id ??
                c?.menu_id ??
                ""
            ) === String(comboIdentifier)
              ? { ...c, menu_status: "served" }
              : c
          );
          return { ...order, combo_details: updatedCombos };
        })
      );

      try {
        const orderComboMappingId = combo?.order_combo_mapping_id ?? null;
        const data = {
          order_id: String(orderId),
          order_status: "served",
          ...(orderComboMappingId ? { order_combo_mapping_id: String(orderComboMappingId) } : {}),
          outlet_id: currentOutletId,
          user_id: userId,
          device_token: deviceId,
          app_source: "kds_app",
        };

        const response = await fetch(`${V2_COMMON_BASE}/update_order_status`, {
          method: "PATCH",
          headers: buildAuthHeaders(),
          body: JSON.stringify({ ...getDeviceSessionFields(), ...data }),
        });

        if (!response.ok) {
          if (response.status === 401) {
            const ok = await refreshToken();
            if (ok) {
              servingMenuItemsRef.current.delete(comboKey);
              return handleServeComboItem(orderId, combo);
            }
            logoutAndRedirect(navigate);
            return;
          }
          const errorText = await response.text();
          throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
      } catch (error) {
        console.error("Error updating combo item status:", error.message);
        // Revert optimistic update on error
        unmarkLocalComboServed(orderId, comboIdentifier);
        setCookingOrders((prev) =>
          prev.map((order) => {
            if (String(order.order_id) !== String(orderId)) return order;
            if (!Array.isArray(order.combo_details)) return order;
            const revertedCombos = order.combo_details.map((c) =>
              String(
                c?.order_combo_mapping_id ??
                  c?.combo_master_id ??
                  c?.combo_id ??
                  c?.menu_id ??
                  ""
              ) === String(comboIdentifier)
                ? { ...c, menu_status: "cooking" }
                : c
            );
            return { ...order, combo_details: revertedCombos };
          })
        );
        refetch();
      } finally {
        servingMenuItemsRef.current.delete(comboKey);
      }
    },
    [accessToken, currentOutletId, deviceId, navigate, refetch, refreshToken, userId]
  );

  useImperativeHandle(ref, () => ({
    fetchOrders: refetch,
    subscriptionData,
  }));

  // Separate handler for manual refresh button
  const handleManualRefresh = () => {
    if (shouldFetchOrders) refetch();
  };

  useEffect(() => {
    // Only redirect if authentication essentials are missing; allow staying without outlet
    if (!accessToken || !userId || !deviceId) {
      logoutAndRedirect(navigate);
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

      // If backend has already disabled KDS buttons, hide the counter.
      if (order.kds_button_enabled !== 1) {
        setIsExpired(true);
        return;
      }

      // Initialize countdown based on server order creation time.
      // Start from remaining seconds inside the 90s window.
      const createdAtMs = new Date(order.date_time).getTime();
      if (Number.isNaN(createdAtMs)) {
        setIsExpired(true);
        return;
      }
      const elapsedSeconds = Math.floor((Date.now() - createdAtMs) / 1000);
      const remainingSeconds = 90 - elapsedSeconds;

      if (remainingSeconds <= 0) {
        setIsExpired(true);
        return;
      }

      setTimeLeft(remainingSeconds);
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

      timerRef.current = setInterval(tick, 1000);

      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    }, [orderId, order?.date_time, order?.kds_button_enabled]);

    if (isExpired) return null;

    // Clamp timeLeft to ensure percentage stays within 0-100% range
    const clampedTimeLeft = Math.min(Math.max(timeLeft, 0), 90);
    const percentage = (clampedTimeLeft / 90) * 100;

    const handleRejectOrder = async () => {
      if (userRole === "super_owner") return;
      const token = localStorage.getItem("access_token");
      if (!token) {
        logoutAndRedirect(navigate);
        return;
      }
      try {
        const response = await fetch(`${V2_COMMON_BASE}/update_order_status`, {
          method: "PATCH",
          headers: buildAuthHeaders(),
          body: JSON.stringify({
            outlet_id: currentOutletId,
            order_id: String(orderId),
            order_status: "cancelled",
            user_id: userId,
            device_token: deviceId,
            device_id: deviceId,
            app_source: "kds_app",
          }),
        });

        if (response.status === 401) {
          logoutAndRedirect(navigate);
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

        // In Pick Up (success), only show served items. In warning/placed, keep all items.
        let visibleMenus = Array.isArray(order.menu_details) ? order.menu_details : [];
        if (type === "success") {
          visibleMenus = visibleMenus.filter((m) => m.menu_status === "served");
        }
        // Place unserved (about to serve) items on top, and served items at the bottom
        visibleMenus = [...visibleMenus].sort((a, b) => {
          const aServed = (a.menu_status || "cooking") === "served";
          const bServed = (b.menu_status || "cooking") === "served";
          if (aServed === bServed) return 0;
          return aServed ? 1 : -1;
        });

        let visibleCombos = Array.isArray(order.combo_details) ? order.combo_details : [];
        if (type === "success") {
          visibleCombos = visibleCombos.filter((c) => c.menu_status === "served");
        }
        visibleCombos = [...visibleCombos].sort((a, b) => {
          const aServed = (a.menu_status || "cooking") === "served";
          const bServed = (b.menu_status || "cooking") === "served";
          if (aServed === bServed) return 0;
          return aServed ? 1 : -1;
        });

        const isPrimaryColumn =
          (type === "placed" && order.order_status === "placed") ||
          (type === "warning" && order.order_status === "cooking") ||
          (type === "success" && order.order_status === "served");

        if (type === "warning" && !visibleMenus.length && !visibleCombos.length) return null;
        if (!visibleMenus.length && !visibleCombos.length && !isPrimaryColumn) return null;

        return (
          <div className="bg-[#dcdcdc] rounded-xl p-4 flex flex-col h-[400px]" key={order.order_id}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="text-xl font-bold text-gray-800 flex items-center gap-2">
                  {order.order_number}
                  {order.order_type && (
                    <span className="bg-[#d27e26] text-white text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">
                      {order.order_type}
                    </span>
                  )}
                </div>
                {order.section_name && (
                  <div className="text-sm font-bold text-gray-700 mt-1">{order.section_name} {order.table_number?.length ? ` - ${order.table_number.join(", ")}` : ""}</div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="text-xl font-bold text-gray-800">
                  {order.date_time ? new Date(order.date_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ""}
                </div>
                {manualMode && order.order_status === "placed" && !isSuperOwner ? (
                  <CircularCountdown orderId={order.order_id} order={order} />
                ) : null}
              </div>
            </div>
            
            <div className="flex-grow overflow-y-auto pr-1">
              {visibleMenus.map((menu, index) => {
                const isServed = (menu.menu_status || "cooking") === "served";
                const isNewItem = !isServed && prevMenuItems.length > 0 && !prevMenuItems.includes(menu.menu_name);
                return (
                  <div className={`flex items-start gap-3 border-b border-gray-300 pb-2 mb-2 ${isServed ? "opacity-75" : ""}`} key={index}>
                    <span className="text-gray-500 bg-gray-200 rounded-full px-2 py-0.5 text-xs font-bold mt-1">x{menu.quantity}</span>
                    <div className="flex-grow">
                      <div className={`font-bold text-lg ${isServed ? "text-gray-500" : isNewItem ? "text-red-600" : "text-gray-800"}`}>
                        {menu.menu_name}
                      </div>
                      {(menu.portions_name || menu.comment || menu.half_or_full) && (
                        <div className="mt-1 pl-1">
                          {menu.portions_name && <div className="text-xs text-blue-600 font-bold uppercase mb-1">SIZE: {menu.portions_name}</div>}
                          {menu.half_or_full && menu.half_or_full.toLowerCase() !== 'combo' && <div className="text-xs text-blue-600 font-bold uppercase mb-1">{menu.half_or_full}</div>}
                          {menu.comment && <div className="text-xs text-gray-500 font-bold mt-1">{menu.comment}</div>}
                        </div>
                      )}
                    </div>
                    {manualMode && type === "warning" && !isSuperOwner && order.kds_button_enabled === 1 && (
                      isServed ? (
                        <button
                          disabled
                          className="px-2 py-1 text-xs bg-gray-400 text-white rounded shadow cursor-not-allowed opacity-80"
                        >
                          Served
                        </button>
                      ) : (
                        <button
                          className="px-2 py-1 text-xs bg-green-700 text-white rounded shadow hover:bg-green-600"
                          onClick={() => handleServeMenuItem(order.order_id, menu)}
                        >
                          Served
                        </button>
                      )
                    )}
                  </div>
                );
              })}
              
              {visibleCombos.map((combo, index) => {
                const isServed = (combo.menu_status || "cooking") === "served";
                return (
                  <div className={`flex items-start gap-3 border-b border-gray-300 pb-2 mb-2 ${isServed ? "opacity-75" : ""}`} key={`combo-${index}`}>
                    <span className="text-gray-500 bg-gray-200 rounded-full px-2 py-0.5 text-xs font-bold mt-1">x{combo.quantity}</span>
                    <div className="flex-grow">
                      <div className={`font-bold text-lg ${isServed ? "text-gray-500" : "text-gray-800"}`}>{combo.combo_name}</div>
                      {combo.comment && <div className="text-xs text-gray-500 font-bold mt-1">{combo.comment}</div>}
                    </div>
                    {manualMode && type === "warning" && !isSuperOwner && order.kds_button_enabled === 1 && (
                      isServed ? (
                        <button
                          disabled
                          className="px-2 py-1 text-xs bg-gray-400 text-white rounded shadow cursor-not-allowed opacity-80"
                        >
                          Served
                        </button>
                      ) : (
                        <button
                          className="px-2 py-1 text-xs bg-green-700 text-white rounded shadow hover:bg-green-600"
                          onClick={() => handleServeComboItem(order.order_id, combo)}
                        >
                          Served
                        </button>
                      )
                    )}
                  </div>
                );
              })}
            </div>
            
            {manualMode && type === "warning" && !isSuperOwner && order.kds_button_enabled === 1 && (
              <div className="mt-auto pt-4">
                <button 
                  className="w-full bg-[#242c38] text-white rounded-lg py-2 text-sm font-bold shadow hover:bg-gray-800"
                  onClick={() => updateOrderStatus(order.order_id, "served")}
                >
                  COMPLETE ORDER
                </button>
              </div>
            )}
          </div>
        );
      });
    },
    [handleServeComboItem, handleServeMenuItem, manualMode, previousMenuItems, updateOrderStatus, userRole]
  );

  const outletName = localStorage.getItem("outlet_name");

  // Prepare merged pick up array
  const mergedPickUp = useMemo(() => {
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
      menu_details: Array.isArray(o.menu_details) ? o.menu_details.filter((m) => m.menu_status === "served") : [],
      combo_details: Array.isArray(o.combo_details) ? o.combo_details.filter((c) => c.menu_status === "served") : [],
    }));
    return orders.sort((a, b) => new Date(b.date_time || 0).getTime() - new Date(a.date_time || 0).getTime());
  }, [cookingOrders, servedOrders]);

  const allOrders = useMemo(() => {
    // Unique list of all orders for the ALL tab
    const map = new Map();
    [...placedOrders, ...cookingOrders, ...servedOrders].forEach(o => map.set(o.order_id, o));
    return Array.from(map.values()).sort((a, b) => new Date(b.date_time || 0).getTime() - new Date(a.date_time || 0).getTime());
  }, [placedOrders, cookingOrders, servedOrders]);

  const getFilteredOrders = () => {
    if (activeTab === "ALL") {
      // Just showing them as placed for display purposes if we don't have a mixed renderer
      // But actually we might need to map them with their actual type.
      return allOrders.map(o => {
        let t = "placed";
        if (o.order_status === "cooking") t = "warning";
        if (o.order_status === "served") t = "success";
        return renderOrders([o], t);
      });
    }
    if (activeTab === "PLACED") return renderOrders(placedOrders, "placed");
    if (activeTab === "COOKING") return renderOrders(cookingOrders, "warning");
    if (activeTab === "PICK UP") return renderOrders(mergedPickUp, "success");
    return null;
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#1c2128] font-sans">
      <Header
        outletName={localStorage.getItem("outlet_name") || ""}
        filter={filter}
        onFilterChange={setFilter}
        onRefresh={handleManualRefresh}
        onOutletSelect={onOutletSelect}
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
          {/* Black Tabs Bar */}
          <div className="bg-[#121418] text-white px-4 py-2 flex items-center border-b border-[#2c313a]">
            <div className="flex gap-2 flex-grow overflow-x-auto text-sm font-bold tracking-wider">
              <button 
                onClick={() => setActiveTab("ALL")}
                className={`px-4 py-1.5 rounded-full ${activeTab === "ALL" ? "bg-gray-200 text-gray-900" : "text-gray-400 hover:text-white"}`}
              >
                ALL ({allOrders.length})
              </button>
              <button 
                onClick={() => setActiveTab("PLACED")}
                className={`px-4 py-1.5 rounded-full ${activeTab === "PLACED" ? "bg-gray-200 text-gray-900" : "text-gray-400 hover:text-white"}`}
              >
                PLACED ({placedOrders.length})
              </button>
              <button 
                onClick={() => setActiveTab("COOKING")}
                className={`px-4 py-1.5 rounded-full ${activeTab === "COOKING" ? "bg-gray-200 text-gray-900" : "text-gray-400 hover:text-white"}`}
              >
                COOKING ({cookingOrders.length})
              </button>
              <button 
                onClick={() => setActiveTab("PICK UP")}
                className={`px-4 py-1.5 rounded-full ${activeTab === "PICK UP" ? "bg-gray-200 text-gray-900" : "text-gray-400 hover:text-white"}`}
              >
                PICK UP ({mergedPickUp.length})
              </button>
            </div>
          </div>

          <div className="flex-grow p-4">
            {initialLoading && (
              <div className="text-center mt-5 text-gray-400">
                {isWsConnected ? "Loading orders..." : "Connecting to live orders..."}
              </div>
            )}
            {error && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative text-center mt-5">{error}</div>
            )}

            {!initialLoading && !error && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 flex-grow content-start">
                {getFilteredOrders()}
              </div>
            )}
            {lastRefreshTime && (
              <div className="text-center mt-4 text-gray-500 text-xs">Last refreshed at: {lastRefreshTime}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default React.memo(OrdersList);