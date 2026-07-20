// Register web components and service worker

import "./components/app-root.js";
import "./components/login-view.js";
import "./components/capture-view.js";
import "./components/loading-indicator.js";
import "./components/review-view.js";
import "./components/success-view.js";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Service worker registration failure is non-fatal
    });
  });
}
