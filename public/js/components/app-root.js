/**
 * <app-root> — shell component that manages routing and shared state.
 *
 * State machine:
 *   boot → login | capture
 *   login → capture (on success)
 *   capture → review (after analysis)
 *   review → success | capture (retake)
 *   success → capture (add another)
 */
class AppRoot extends HTMLElement {
  constructor() {
    super();
    /** @type {'boot'|'login'|'capture'|'review'|'success'} */
    this._view = "boot";
    this._imageUrl = null;
    this._nutrition = null;
  }

  connectedCallback() {
    this._render();
    this._checkAuth();
  }

  async _checkAuth() {
    try {
      const res = await fetch("/api/auth/status");
      const data = await res.json();
      this._navigate(data.authenticated ? "capture" : "login");
    } catch {
      this._navigate("login");
    }
  }

  /**
   * @param {'login'|'capture'|'review'|'success'} view
   * @param {object} [extra]
   */
  _navigate(view, extra = {}) {
    this._view = view;
    if (extra.imageUrl !== undefined) this._imageUrl = extra.imageUrl;
    if (extra.nutrition !== undefined) this._nutrition = extra.nutrition;
    this._render();
  }

  _render() {
    this.innerHTML = "";

    // Header (hidden during boot / login)
    if (this._view !== "boot" && this._view !== "login") {
      this.appendChild(this._buildHeader());
    }

    const viewEl = this._buildView();
    if (viewEl) this.appendChild(viewEl);
  }

  _buildHeader() {
    const header = document.createElement("header");
    header.className = "app-header";

    const title = document.createElement("h1");
    title.textContent = "NutriScan";
    header.appendChild(title);

    const logoutBtn = document.createElement("button");
    logoutBtn.className = "btn-secondary btn-sm";
    logoutBtn.textContent = "Log out";
    logoutBtn.addEventListener("click", () => this._logout());
    header.appendChild(logoutBtn);

    return header;
  }

  async _logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    this._navigate("login");
  }

  _buildView() {
    switch (this._view) {
      case "boot": {
        const el = document.createElement("loading-indicator");
        el.message = "Starting…";
        return el;
      }

      case "login": {
        const el = document.createElement("login-view");
        el.addEventListener("login-success", () => this._navigate("capture"));
        return el;
      }

      case "capture": {
        const el = document.createElement("capture-view");
        el.addEventListener("analysis-complete", (e) => {
          this._navigate("review", {
            imageUrl: e.detail.imageUrl,
            nutrition: e.detail.nutrition,
          });
        });
        return el;
      }

      case "review": {
        const el = document.createElement("review-view");
        el.imageUrl = this._imageUrl;
        el.nutrition = this._nutrition;
        el.addEventListener("save-success", () => this._navigate("success"));
        el.addEventListener("retake", () => this._navigate("capture"));
        return el;
      }

      case "success": {
        const el = document.createElement("success-view");
        el.addEventListener("add-another", () => this._navigate("capture"));
        return el;
      }

      default:
        return null;
    }
  }
}

customElements.define("app-root", AppRoot);
