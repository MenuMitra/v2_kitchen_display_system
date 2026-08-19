const RECONNECT_DELAY_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 30000;
const EVENT_DEBOUNCE_MS = 150;

function normalizeOutletId(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parsePayload(raw) {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!text || text === "pong" || text === "ping") return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isOrderEvent(payload, outletId) {
  if (!payload || typeof payload !== "object") return false;

  const data = payload.data && typeof payload.data === "object" ? payload.data : {};
  const eventOutletId = normalizeOutletId(data.outlet_id);
  const currentOutletId = normalizeOutletId(outletId);

  if (eventOutletId != null && currentOutletId != null && eventOutletId !== currentOutletId) {
    return false;
  }

  const type = String(payload.type || "");
  if (type === "order_changed") return true;

  const action = String(data.action || "");
  if (type === "Success" && (action === "create_order" || data.order_id != null)) {
    return true;
  }

  return false;
}

/**
 * Real-time KDS order channel.
 *
 * URL: wss://<host>/v2.3/common/ws/<outlet_id>
 * Auth: access token sent as Sec-WebSocket-Protocol (browser WebSocket protocols arg)
 */
export function createOrderWebSocket({
  wsBaseUrl,
  outletId,
  accessToken,
  onOpen,
  onClose,
  onOrderEvent,
} = {}) {
  if (!wsBaseUrl || !outletId || !accessToken) return null;

  let ws = null;
  let destroyed = false;
  let reconnectTimer = null;
  let debounceTimer = null;
  let reconnectDelay = RECONNECT_DELAY_MS;

  const url = `${String(wsBaseUrl).replace(/\/$/, "")}/${outletId}`;

  function emitOrderEvent(payload) {
    if (destroyed || typeof onOrderEvent !== "function") return;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (!destroyed) onOrderEvent(payload);
    }, EVENT_DEBOUNCE_MS);
  }

  function scheduleReconnect() {
    if (destroyed) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(Math.round(reconnectDelay * 1.5), MAX_RECONNECT_DELAY_MS);
      connect();
    }, reconnectDelay);
  }

  function connect() {
    if (destroyed) return;

    try {
      ws = new WebSocket(url, [accessToken]);
    } catch (err) {
      console.error("KDS WebSocket construction error:", err);
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      if (destroyed) return;
      reconnectDelay = RECONNECT_DELAY_MS;
      onOpen?.();
    };

    ws.onmessage = (event) => {
      if (destroyed) return;
      const payload = parsePayload(event.data);
      if (isOrderEvent(payload, outletId)) {
        emitOrderEvent(payload);
      }
    };

    ws.onerror = () => {
      // onclose handles retry; avoid duplicate reconnects here
    };

    ws.onclose = () => {
      ws = null;
      if (destroyed) return;
      onClose?.();
      scheduleReconnect();
    };
  }

  connect();

  return {
    close() {
      destroyed = true;
      clearTimeout(reconnectTimer);
      clearTimeout(debounceTimer);
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onerror = null;
        ws.onclose = null;
        try {
          ws.close();
        } catch {
          // ignore
        }
        ws = null;
      }
    },
  };
}
