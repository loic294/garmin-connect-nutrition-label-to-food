/**
 * <app-root> — shell component that manages routing and shared state.
 * Uses History API with real URLs for browser navigation + back button support.
 *
 * URL Routing:
 *   /login                          — login page
 *   /foods, /                       — foods list
 *   /foods/{foodId}                 — food detail view
 *   /capture                        — photo capture
 *   /review                         — review nutrition data
 *   /success                        — photo upload/edit complete
 *
 * State machine:
 *   boot → login | foods
 *   login → /foods (on success)
 *   /foods → /foods/{foodId} (click food)
 *   /foods → /capture (add new)
 *   /foods/{foodId} → /foods (back)
 *   /foods/{foodId} → /success (edit photo)
 *   /capture → /review (after analysis)
 *   /review → /success | /capture (save or retake)
 *   /success → /foods (all done)
 */
class AppRoot extends HTMLElement {
  constructor() {
    super();
    /** @type {'boot'|'login'|'foods'|'food-detail'|'capture'|'review'|'success'} */
    this._view = "boot";
    this._imageUrl = null;
    this._imageFile = null; // Store original File for photo upload
    this._nutrition = null;
    this._foodId = null;
    this._food = null; // Current food being viewed
    this._isEditingPhoto = false; // true when navigating from edit photo in detail view
  }

  connectedCallback() {
    this._render();
    this._checkAuth();
    // Handle back button - restore state from URL
    window.addEventListener("popstate", (e) => {
      this._parseUrlAndNavigate(window.location.pathname);
    });
  }

  /**
   * Parse the current URL and update internal state accordingly
   */
  async _parseUrlAndNavigate(pathname) {
    const path = pathname === "/" ? "/foods" : pathname;

    if (path === "/login") {
      this._view = "login";
    } else if (path === "/foods" || path === "/") {
      this._view = "foods";
      this._foodId = null;
      this._food = null;
    } else if (path.startsWith("/foods/")) {
      const foodId = path.replace("/foods/", "");
      this._foodId = foodId;
      this._view = "food-detail";
      // Fetch the food data for this URL
      try {
        const res = await fetch(`/api/garmin/food/${foodId}`);
        if (res.ok) {
          this._food = await res.json();
        }
      } catch (err) {
        console.error("[AppRoot] Failed to fetch food:", err);
      }
    } else if (path === "/capture") {
      this._view = "capture";
    } else if (path === "/review") {
      this._view = "review";
    } else if (path === "/success") {
      this._view = "success";
    }

    this._render();
  }

  /**
   * Generate URL for a given view
   */
  _getUrl(view, extra = {}) {
    switch (view) {
      case "login":
        return "/login";
      case "foods":
        return "/foods";
      case "food-detail":
        return `/foods/${extra.foodId || ""}`;
      case "capture":
        return "/capture";
      case "review":
        return "/review";
      case "success":
        return "/success";
      default:
        return "/";
    }
  }

  async _checkAuth() {
    try {
      const res = await fetch("/api/auth/status");
      const data = await res.json();
      const initialPath = data.authenticated
        ? window.location.pathname
        : "/login";
      await this._parseUrlAndNavigate(initialPath);
    } catch {
      await this._parseUrlAndNavigate("/login");
    }
  }

  /**
   * @param {'login'|'foods'|'food-detail'|'capture'|'review'|'success'} view
   * @param {object} [extra]
   */
  _navigate(view, extra = {}) {
    this._view = view;
    if (extra.imageUrl !== undefined) this._imageUrl = extra.imageUrl;
    if (extra.imageFile !== undefined) this._imageFile = extra.imageFile;
    if (extra.nutrition !== undefined) this._nutrition = extra.nutrition;
    if (extra.foodId !== undefined) this._foodId = extra.foodId;
    if (extra.food !== undefined) this._food = extra.food;
    if (extra.isEditingPhoto !== undefined)
      this._isEditingPhoto = extra.isEditingPhoto;

    // Generate URL based on view
    const url = this._getUrl(view, { foodId: this._foodId });

    // Push state to history with full state object
    const state = {
      view,
      imageUrl: this._imageUrl,
      imageFile: this._imageFile,
      nutrition: this._nutrition,
      foodId: this._foodId,
      food: this._food,
      isEditingPhoto: this._isEditingPhoto,
    };
    window.history.pushState(state, "", url);

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

    const titleLink = document.createElement("a");
    titleLink.href = "/foods";
    titleLink.style.cursor = "pointer";
    titleLink.style.textDecoration = "none";
    titleLink.style.color = "inherit";
    titleLink.addEventListener("click", (e) => {
      e.preventDefault();
      this._navigate("foods");
    });

    const title = document.createElement("h1");
    title.textContent = "NutriScan";
    title.style.margin = "0";
    titleLink.appendChild(title);
    header.appendChild(titleLink);

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
        el.addEventListener("login-success", () => this._navigate("foods"));
        return el;
      }

      case "foods": {
        const el = document.createElement("foods-view");
        el.addEventListener("add-new", () => {
          console.log("[AppRoot] add-new from foods → navigate to capture");
          this._navigate("capture");
        });
        el.addEventListener("view-food", (e) => {
          console.log(
            "[AppRoot] view-food:",
            e.detail.foodId,
            "→ navigate to food-detail",
          );
          this._navigate("food-detail", {
            foodId: e.detail.foodId,
            food: e.detail.food,
          });
        });
        return el;
      }

      case "food-detail": {
        const el = document.createElement("food-detail");
        el.food = this._food;
        el.addEventListener("back", () => {
          console.log("[AppRoot] back from food-detail → navigate to foods");
          this._navigate("foods");
        });
        el.addEventListener("edit-photo", (e) => {
          console.log("[AppRoot] edit-photo from detail → navigate to success");
          this._navigate("success", {
            foodId: e.detail.foodId,
            food: e.detail.food,
            isEditingPhoto: true,
          });
        });
        el.addEventListener("edit-food", (e) => {
          console.log("[AppRoot] edit-food from detail → navigate to capture");
          this._navigate("capture");
        });
        return el;
      }

      case "capture": {
        const el = document.createElement("capture-view");
        el.addEventListener("analysis-complete", (e) => {
          this._navigate("review", {
            imageUrl: e.detail.imageUrl,
            imageFile: e.detail.imageFile,
            nutrition: e.detail.nutrition,
          });
        });
        return el;
      }

      case "review": {
        const el = document.createElement("review-view");
        el.imageUrl = this._imageUrl;
        el.imageFile = this._imageFile;
        el.nutrition = this._nutrition;
        el.addEventListener("save-success", (e) =>
          this._navigate("success", {
            foodId: e.detail?.foodId ?? null,
            imageUrl: e.detail?.imageUrl ?? this._imageUrl,
            imageFile: this._imageFile,
          }),
        );
        el.addEventListener("retake", () => this._navigate("capture"));
        return el;
      }

      case "success": {
        const el = document.createElement("success-view");
        el.foodId = this._foodId;
        el.imageUrl = this._imageUrl;
        el.imageFile = this._imageFile;
        el.isUpdate = !!this._foodId;
        el.isEditingPhoto = this._isEditingPhoto;
        el.addEventListener("add-another", () => this._navigate("foods"));
        return el;
      }

      default:
        return null;
    }
  }
}

customElements.define("app-root", AppRoot);
