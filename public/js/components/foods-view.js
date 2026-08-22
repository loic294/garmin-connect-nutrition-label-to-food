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

    const header = document.createElement("h2");
    header.className = "mb-4 text-center text-2xl font-bold";
    header.textContent = "Your Foods";
    inner.appendChild(header);

    const addBtn = document.createElement("button");
    addBtn.className = "btn btn-primary mb-5 w-full";
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
      err.className = "alert alert-error mb-5";
      err.textContent = this._error;
      inner.appendChild(err);

      const retryBtn = document.createElement("button");
      retryBtn.className = "btn btn-primary w-full";
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

    if (this._foods.length === 0) {
      const empty = document.createElement("p");
      empty.className = "mb-5 text-center text-sm text-base-content/70";
      empty.textContent = "No custom foods yet. Add one to get started!";
      inner.appendChild(empty);
    } else {
      const list = document.createElement("div");
      list.className = "flex max-h-[60vh] flex-col gap-3 overflow-y-auto";

      for (const food of this._foods) {
        const item = document.createElement("div");
        item.className = "card card-compact border border-base-300 bg-base-100 shadow-sm transition hover:bg-base-200 cursor-pointer";
        item.addEventListener("click", () => {
          console.log("[FoodsView] View food clicked:", food.foodId);
          this.dispatchEvent(
            new CustomEvent("view-food", {
              bubbles: true,
              detail: { foodId: food.foodId, food },
            }),
          );
        });

        const body = document.createElement("div");
        body.className = "card-body flex-row items-start gap-3 p-4";

        if (food.imageUrl) {
          const img = document.createElement("img");
          img.src = food.imageUrl;
          img.className = "h-20 w-20 rounded-box object-cover";
          img.alt = food.foodName;
          body.appendChild(img);
        }

        const itemInner = document.createElement("div");
        itemInner.className = "min-w-0 flex-1";

        const name = document.createElement("p");
        name.className = "mb-1 truncate font-semibold";
        name.textContent = food.foodName || "Unnamed";
        itemInner.appendChild(name);

        const meta = document.createElement("p");
        meta.className = "text-sm text-base-content/70";
        const parts = [];
        if (food.brandName) parts.push(food.brandName);
        if (food.calories != null)
          parts.push(Math.round(food.calories) + " cal");
        meta.textContent = parts.join(" • ") || "No details";
        itemInner.appendChild(meta);

        body.appendChild(itemInner);
        item.appendChild(body);
        list.appendChild(item);
      }

      inner.appendChild(list);
    }

    this.appendChild(inner);
  }
}

customElements.define("foods-view", FoodsView);
