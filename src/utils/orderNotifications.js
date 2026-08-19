import {
  getSelectedAlertSound,
  playOrderAlertSound,
} from "./orderAlertSound";

function getOrderLabel(data = {}) {
  if (data.order_number) return String(data.order_number);
  if (data.order_id != null) return String(data.order_id);
  return "New";
}

export function getOrderEventMessage(payload) {
  const data = payload?.data && typeof payload.data === "object" ? payload.data : {};
  const orderLabel = getOrderLabel(data);
  const type = String(payload?.type || "");
  const action = String(data.action || "");

  if (type === "Success" && action === "create_order") {
    return {
      title: "New Order",
      body: `Order ${orderLabel} received`,
      toastMessage: `Order ${orderLabel} received`,
    };
  }

  if (type === "order_changed") {
    const status = data.order_status ? ` (${data.order_status})` : "";
    return {
      title: "Order Updated",
      body: `Order ${orderLabel} updated${status}`,
      toastMessage: `Order ${orderLabel} updated${status}`,
    };
  }

  return {
    title: "Order Update",
    body: `Order ${orderLabel} received`,
    toastMessage: `Order ${orderLabel} received`,
  };
}

export function notifyOrderEvent(payload) {
  const { title, body, toastMessage } = getOrderEventMessage(payload);

  playOrderAlertSound(getSelectedAlertSound());
  window.showToast?.("notification", toastMessage);

  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    try {
      new Notification(title, {
        body,
        icon: "/favicon.ico",
        tag: `kds-order-${Date.now()}`,
      });
    } catch {
      // ignore unsupported environments
    }
  }
}

export function requestNotificationPermission() {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") {
    Notification.requestPermission().catch(() => {});
  }
}
