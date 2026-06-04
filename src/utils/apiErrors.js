const DEFAULT_MESSAGE = "Something went wrong. Please try again.";

export const MOBILE_NOT_FOUND_MESSAGE =
  "User with this mobile number does not exist";

/**
 * Extract a user-facing message from axios/API errors.
 */
export function getApiErrorMessage(error, fallback = DEFAULT_MESSAGE) {
  if (!error) return fallback;

  const data = error.response?.data;

  if (typeof data?.detail === "string" && data.detail.trim()) {
    return data.detail.trim();
  }

  if (Array.isArray(data?.detail)) {
    const fromArray = data.detail
      .map((item) => (typeof item === "string" ? item : item?.msg || item?.message || ""))
      .filter(Boolean)
      .join(", ");
    if (fromArray) return fromArray;
  }

  if (typeof data?.message === "string" && data.message.trim()) {
    return data.message.trim();
  }

  if (typeof error.message === "string" && error.message.trim()) {
    if (error.message === "Network Error") {
      return "Unable to reach server. Please check your connection and try again.";
    }
    return error.message.trim();
  }

  return fallback;
}

export function isMobileNotFoundMessage(text) {
  if (!text || typeof text !== "string") return false;
  const lower = text.toLowerCase();
  return (
    lower.includes("does not exist") ||
    lower.includes("not registered") ||
    lower.includes("user not found") ||
    lower.includes("not found with this mobile")
  );
}

export function isPinRequiredMessage(text) {
  if (!text || typeof text !== "string") return false;
  const lower = text.toLowerCase();
  return (
    lower.includes("provide pin") ||
    lower.includes("pin is required") ||
    lower.includes("pin required")
  );
}
