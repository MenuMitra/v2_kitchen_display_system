function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function showToast(type, message) {
  let toast = document.getElementById("toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }

  let duration = 3000;
  const safeMessage = escapeHtml(String(message || ""));

  if (type === "error") {
    toast.className = "toast error toast-compact";
    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-icon" aria-hidden="true">
          <i class="fas fa-times"></i>
        </span>
        <p class="toast-message">${safeMessage}</p>
      </div>
    `;
    duration = 4000;
  } else {
    let icon;
    let title;

    switch (type) {
      case "success":
        icon = '<i class="fas fa-check"></i>';
        title = "Success";
        break;
      case "info":
        icon = '<i class="fas fa-info"></i>';
        title = "Info";
        break;
      case "warning":
        icon = '<i class="fas fa-exclamation"></i>';
        title = "Warning";
        break;
      case "notification":
        icon = '<i class="fas fa-bell"></i>';
        title = "Notification";
        duration = 5000;
        break;
      default:
        icon = '<i class="fas fa-bell"></i>';
        title = "Notification";
    }

    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div class="toast-content">
        <span class="toast-icon">${icon}</span>
        <div class="message">
          <span class="text-title">${title}</span>
          <span class="text-body">${safeMessage}</span>
        </div>
      </div>
      <button type="button" class="close" aria-label="Dismiss" onclick="window.hideToast()">
        <i class="fas fa-times"></i>
      </button>
      <div class="progress-bar"></div>
    `;
  }

  toast.classList.add("show");

  if (toast._hideTimer) {
    clearTimeout(toast._hideTimer);
  }
  toast._hideTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, duration);
}

function hideToast() {
  const toast = document.getElementById("toast");
  if (toast) {
    toast.classList.remove("show");
  }
}

window.showToast = showToast;
window.hideToast = hideToast;
