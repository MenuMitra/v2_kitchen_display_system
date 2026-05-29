const DEVICE_ID_KEY = "kds_device_id";
const REMEMBER_DEVICE_KEY = "kds_remember_device";

function generateId(length = 20) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join("");
}

export function getDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = generateId(20);
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

export function getDeviceModel() {
  if (typeof navigator !== "undefined" && navigator.vendor) {
    return navigator.vendor;
  }
  const ua = navigator.userAgent;
  if (/Mobile|Android|iPhone/i.test(ua)) return "mobile_web";
  return "web";
}

export function setRememberDevice(remember) {
  if (remember) {
    localStorage.setItem(REMEMBER_DEVICE_KEY, "1");
  } else {
    localStorage.removeItem(REMEMBER_DEVICE_KEY);
  }
}

export function isRememberDevice() {
  return localStorage.getItem(REMEMBER_DEVICE_KEY) === "1";
}

export function getDevicePayload() {
  return {
    device_id: getDeviceId(),
    device_model: getDeviceModel(),
  };
}
