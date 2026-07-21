/**
 * <foods-view> — displayed after login, shows list of existing Garmin custom foods.
 *
 * Emits:
 *   'view-food'  {detail: {foodId, food}} — user clicked a food to view details
 *   'add-new'                              — user clicked "Add new food" button
 */
class FoodsView extends HTMLElement {
  _foods = []; // list of {foodId, foodName, calories, brandName, ...}
  _loading = true;
  _error = "";

  async connectedCallback() {
    console.log("[FoodsView] connectedCallback");
    this._render();
    await this._loadFoods();
  }

  async _loadFoods() {
    console.log("[FoodsView] Loading custom foods from /api/garmin/foods");
    try {
      const res = await fetch("/api/garmin/foods");
      const data = await res.json();

      if (!res.ok) {
        console.error(
          "[FoodsView] Failed to load foods:",
          data.detail || res.statusText,
        );
        this._error = data.detail || "Failed to load foods";
        this._foods = [];
      } else {
        console.log("[FoodsView] Loaded", data.length, "foods");
        this._foods = data;
        this._error = "";
      }
    } catch (err) {
      console.error("[FoodsView] Exception loading foods:", err);
      this._error = err.message;
      this._foods = [];
    }

    this._loading = false;
    this._render();
  }

  _render() {
    console.log(
      "[FoodsView] _render(). loading:",
      this._loading,
      "foods:",
      this._foods.length,
      "error:",
      this._error || "none",
    );
    this.className = "view";
    this.innerHTML = "";

    const inner = document.createElement("div");
    inner.className = "view-inner";

    // Header
    const header = document.createElement("h2");
    header.style.cssText = "text-align:center; margin-bottom:var(--space-lg);";
    header.textContent = "Your Foods";
    inner.appendChild(header);

    // "Add new food" button at top
    const addBtn = document.createElement("button");
    addBtn.className = "btn-full";
    addBtn.style.marginBottom = "var(--space-lg)";
    addBtn.textContent = "Add a new food";
    addBtn.addEventListener("click", () => {
      console.log("[FoodsView] Add new food clicked");
      this.dispatchEvent(new CustomEvent("add-new", { bubbles: true }));
    });
    inner.appendChild(addBtn);

    // Loading state
    if (this._loading) {
      const loader = document.createElement("loading-indicator");
      loader.message = "Loading foods…";
      inner.appendChild(loader);
      this.appendChild(inner);
      return;
    }

    // Error state
    if (this._error) {
      const err = document.createElement("div");
      err.className = "error-banner";
      err.style.marginBottom = "var(--space-lg)";
      err.textContent = this._error;
      inner.appendChild(err);

      const retryBtn = document.createElement("button");
      retryBtn.className = "btn-full";
      retryBtn.textContent = "Try again";
      retryBtn.addEventListener("click", async () => {
        this._loading = true;
        this._render();
        await this._loadFoods();
      });
      inner.appendChild(retryBtn);

      this.appendChild(inner);
      return;
    }

    // Empty state
    if (this._foods.length === 0) {
      const empty = document.createElement("p");
      empty.style.cssText =
        "text-align:center; color:var(--color-text-muted); margin-bottom:var(--space-lg);";
      empty.textContent = "No custom foods yet. Add one to get started!";
      inner.appendChild(empty);
    } else {
      // Foods list
      const list = document.createElement("div");
      list.style.cssText =
        "display:flex; flex-direction:column; gap:var(--space-sm); margin-bottom:var(--space-lg); max-height:60vh; overflow-y:auto;";

      for (const food of this._foods) {
        const item = document.createElement("div");
        item.style.cssText = `
          padding:var(--space-md);
          border:var(--border);
          background:var(--color-surface);
          border-radius:4px;
          cursor:pointer;
          transition:background-color 0.2s;
          display:flex;
          gap:var(--space-md);
          align-items:flex-start;
        `;
        item.addEventListener("mouseenter", () => {
          item.style.backgroundColor = "var(--color-surface-alt)";
        });
        item.addEventListener("mouseleave", () => {
          item.style.backgroundColor = "var(--color-surface)";
        });
        item.addEventListener("click", () => {
          console.log("[FoodsView] View food clicked:", food.foodId);
          this.dispatchEvent(
            new CustomEvent("view-food", {
              bubbles: true,
              detail: { foodId: food.foodId, food },
            }),
          );
        });

        // Image
        if (food.imageUrl) {
          const img = document.createElement("img");
          img.src = food.imageUrl;
          img.style.cssText =
            "width:80px; height:80px; border-radius:4px; object-fit:cover; flex-shrink:0;";
          img.alt = food.foodName;
          item.appendChild(img);
        }

        const itemInner = document.createElement("div");
        itemInner.style.flex = "1";

        const name = document.createElement("p");
        name.style.cssText =
          "margin:0 0 var(--space-xs); font-weight:var(--font-weight-bold);";
        name.textContent = food.foodName || "Unnamed";
        itemInner.appendChild(name);

        const meta = document.createElement("p");
        meta.style.cssText =
          "margin:0 0 var(--space-sm); font-size:var(--font-size-sm); color:var(--color-text-muted);";
        const parts = [];
        if (food.brandName) parts.push(food.brandName);
        if (food.calories != null)
          parts.push(Math.round(food.calories) + " cal");
        meta.textContent = parts.join(" • ") || "No details";
        itemInner.appendChild(meta);

        item.appendChild(itemInner);
        list.appendChild(item);
      }

      inner.appendChild(list);
    }

    this.appendChild(inner);
  }
}

customElements.define("foods-view", FoodsView);
