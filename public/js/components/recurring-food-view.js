class RecurringFoodView extends HTMLElement {
  _foods = [];
  _meals = [];
  _selectedType = "food";
  _selectedId = "";
  _selectedDays = new Set(["Mon", "Wed", "Fri"]);
  _time = "08:00";
  _schedules = [];
  _editingScheduleId = null;
  _loading = true;
  _saving = false;
  _error = "";
  _success = "";

  connectedCallback() {
    this._loadData();
  }

  async _loadData() {
    this._loading = true;
    this._error = "";
    this._render();

    try {
      const [foodsRes, mealsRes, schedulesRes] = await Promise.all([
        fetch("/api/garmin/foods"),
        fetch("/api/garmin/meals"),
        fetch("/api/recurring/schedules"),
      ]);

      if (!foodsRes.ok || !mealsRes.ok || !schedulesRes.ok) {
        throw new Error("Unable to load recurring schedule data.");
      }

      const [foodsData, mealsData, schedulesData] = await Promise.all([
        foodsRes.json(),
        mealsRes.json(),
        schedulesRes.json(),
      ]);

      this._foods = Array.isArray(foodsData) ? foodsData : [];
      this._meals = Array.isArray(mealsData) ? mealsData : [];
      this._schedules = Array.isArray(schedulesData) ? schedulesData : [];

      if (this._selectedType === "food") {
        const firstFood = this._foods[0];
        if (firstFood) this._selectedId = String(firstFood.foodId);
      } else {
        const firstMeal = this._meals[0];
        if (firstMeal) this._selectedId = String(firstMeal.id || firstMeal.customMealId);
      }

      if (!this._selectedId && this._foods.length === 0 && this._meals.length === 0) {
        this._error = "No foods or meals are available from Garmin yet.";
      }
    } catch (error) {
      console.error("[RecurringFoodView] Failed to load Garmin items:", error);
      this._error = error.message || "Unable to load Garmin foods and meals.";
      this._foods = [];
      this._meals = [];
    }

    this._loading = false;
    this._render();
  }

  _normalizeItem(item, type) {
    if (type === "meal") {
      const id = item.id || item.customMealId;
      return {
        id: id == null ? "" : String(id),
        name: item.name || item.mealName || item.title || "Meal",
        label: item.name || item.mealName || item.title || "Meal",
      };
    }

    return {
      id: String(item.foodId || item.id || ""),
      foodId: String(item.foodId || item.id || ""),
      foodName: item.foodName || item.name || "Unnamed food",
      name: item.foodName || item.name || "Unnamed food",
    };
  }

  _getItems() {
    return this._selectedType === "food" ? this._foods : this._meals;
  }

  _render() {
    this.className = "view";
    this.innerHTML = "";

    const inner = document.createElement("div");
    inner.className = "view-inner";

    const header = document.createElement("div");
    header.className = "mb-6";
    header.innerHTML = `
      <p class="text-xs font-semibold uppercase tracking-[0.2em] text-base-content/60">Recurring food</p>
      <h2 class="mt-2 text-3xl font-bold tracking-tight">Schedule Garmin logging</h2>
      <p class="mt-2 text-sm text-base-content/70">Schedules run at 4:00 AM Pacific. The selected time determines where the food appears in Garmin.</p>
    `;
    inner.appendChild(header);

    const card = document.createElement("div");
    card.className = "card bg-base-100 shadow-sm";

    const body = document.createElement("div");
    body.className = "card-body gap-6 p-5 md:p-6";

    const sourceWrap = document.createElement("div");
    sourceWrap.className = "space-y-3";
    sourceWrap.innerHTML = `
      <label class="label px-0 pb-0"><span class="label-text font-medium">Choose type</span></label>
      <div class="join w-full" role="group" aria-label="Choose food or meal">
        <button type="button" class="join-item btn ${this._selectedType === "food" ? "btn-primary" : "btn-outline"}" data-source-type="food" aria-pressed="${this._selectedType === "food"}">Food</button>
        <button type="button" class="join-item btn ${this._selectedType === "meal" ? "btn-primary" : "btn-outline"}" data-source-type="meal" aria-pressed="${this._selectedType === "meal"}">Meal</button>
      </div>
    `;
    body.appendChild(sourceWrap);

    const items = this._getItems();
    const itemListWrap = document.createElement("div");
    itemListWrap.className = "space-y-3";

    const itemLabel = document.createElement("label");
    itemLabel.className = "label px-0 pb-0";
    itemLabel.innerHTML = `<span class="label-text font-medium">Select ${this._selectedType}</span>`;
    itemListWrap.appendChild(itemLabel);

    if (this._loading) {
      const loader = document.createElement("div");
      loader.className = "alert alert-soft";
      loader.innerHTML = "<span>Loading Garmin foods and meals…</span>";
      itemListWrap.appendChild(loader);
    } else if (items.length > 0) {
      const select = document.createElement("select");
      select.className = "select select-bordered w-full";
      select.setAttribute("aria-label", `Select ${this._selectedType}`);

      const options = items.map((item) => {
        const normalized = this._normalizeItem(item, this._selectedType);
        const candidateId = normalized.id || normalized.foodId || "";
        const selected = this._selectedId === candidateId;
        const option = document.createElement("option");
        option.value = candidateId;
        option.textContent = normalized.foodName || normalized.name || "Unnamed item";
        if (selected) option.selected = true;
        return option;
      });

      options.forEach((option) => select.appendChild(option));
      select.value = this._selectedId || (items[0] ? this._normalizeItem(items[0], this._selectedType).id || this._normalizeItem(items[0], this._selectedType).foodId || "" : "");
      select.addEventListener("change", (event) => {
        this._selectedId = event.target.value;
      });
      itemListWrap.appendChild(select);
    } else {
      const empty = document.createElement("div");
      empty.className = "alert alert-info";
      empty.innerHTML = `<span>No ${this._selectedType}s found in your Garmin account.</span>`;
      itemListWrap.appendChild(empty);
    }

    body.appendChild(itemListWrap);

    const dayWrap = document.createElement("div");
    dayWrap.className = "space-y-3";
    dayWrap.innerHTML = `
      <label class="label px-0 pb-0"><span class="label-text font-medium">Days of week</span></label>
      <div class="flex flex-wrap gap-2" data-day-buttons>
        ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
          .map(
            (day) => `
              <button
                type="button"
                class="btn btn-sm ${this._selectedDays.has(day) ? "btn-primary" : "btn-outline"}"
                data-day="${day}"
                aria-pressed="${this._selectedDays.has(day)}"
              >
                ${day}
              </button>
            `,
          )
          .join("")}
      </div>
    `;
    body.appendChild(dayWrap);

    const timeWrap = document.createElement("div");
    timeWrap.className = "w-full max-w-xs";
    timeWrap.innerHTML = `
      <label class="label px-0 pb-2"><span class="label-text font-medium">Time of day</span></label>
      <input type="time" class="input input-bordered w-full" value="${this._time}" data-time-input />
    `;
    body.appendChild(timeWrap);

    const actions = document.createElement("div");
    actions.className = "flex gap-3 pt-2";
    actions.innerHTML = `
      <button type="button" class="btn btn-ghost flex-1" data-cancel>
        ${this._editingScheduleId ? "Cancel edit" : "Cancel"}
      </button>
      <button type="button" class="btn btn-primary flex-1" data-save ${this._saving ? "disabled" : ""}>
        ${
          this._saving
            ? '<span class="loading loading-spinner loading-sm"></span> Saving'
            : this._editingScheduleId
              ? "Update schedule"
              : "Save schedule"
        }
      </button>
    `;
    body.appendChild(actions);

    if (this._success) {
      const success = document.createElement("div");
      success.className = "alert alert-success mt-4";
      success.innerHTML = `<span>${this._success}</span>`;
      body.appendChild(success);
    }

    if (this._error) {
      const error = document.createElement("div");
      error.className = "alert alert-warning mt-4";
      error.innerHTML = `<span>${this._error}</span>`;
      body.appendChild(error);
    }

    card.appendChild(body);
    inner.appendChild(card);

    const savedCard = document.createElement("div");
    savedCard.className = "card mt-6 bg-base-100 shadow-sm";
    const savedBody = document.createElement("div");
    savedBody.className = "card-body gap-4 p-5 md:p-6";
    savedBody.innerHTML = `
      <div>
        <h3 class="card-title text-lg">Saved schedules</h3>
        <p class="mt-1 text-sm text-base-content/60">Automatically added to Garmin on the selected days.</p>
      </div>
    `;

    if (this._schedules.length === 0) {
      const empty = document.createElement("p");
      empty.className = "text-sm text-base-content/60";
      empty.textContent = "No recurring schedules yet.";
      savedBody.appendChild(empty);
    } else {
      const list = document.createElement("div");
      list.className = "divide-y divide-base-300";
      this._schedules.forEach((schedule) => {
        const row = document.createElement("div");
        row.className = "flex items-center gap-3 py-3 first:pt-0 last:pb-0";

        const details = document.createElement("div");
        details.className = "min-w-0 flex-1";
        const name = document.createElement("p");
        name.className = "truncate font-medium";
        name.textContent = schedule.name;
        const timing = document.createElement("p");
        timing.className = "mt-1 text-sm text-base-content/60";
        timing.textContent = `${schedule.type === "meal" ? "Meal" : "Food"} · ${schedule.days.join(", ")} at ${schedule.time}`;
        details.append(name, timing);

        const edit = document.createElement("button");
        edit.type = "button";
        edit.className = "btn btn-ghost btn-sm btn-square";
        edit.setAttribute("aria-label", `Edit ${schedule.name}`);
        edit.innerHTML = '<span data-lucide="pencil" class="h-4 w-4"></span>';
        edit.addEventListener("click", () => this._editSchedule(schedule));

        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "btn btn-ghost btn-sm btn-square";
        remove.setAttribute("aria-label", `Delete ${schedule.name}`);
        remove.innerHTML = '<span data-lucide="trash-2" class="h-4 w-4"></span>';
        remove.addEventListener("click", () => this._deleteSchedule(schedule.id));

        row.append(details, edit, remove);
        list.appendChild(row);
      });
      savedBody.appendChild(list);
    }

    savedCard.appendChild(savedBody);
    inner.appendChild(savedCard);
    this.appendChild(inner);

    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }

    const sourceButtons = this.querySelectorAll("[data-source-type]");
    sourceButtons.forEach((button) => {
      button.addEventListener("click", () => {
        this._selectedType = button.dataset.sourceType;
        const nextItems = this._selectedType === "food" ? this._foods : this._meals;
        const firstEntry = nextItems[0];
        this._selectedId = firstEntry
          ? String(firstEntry.foodId || firstEntry.id || firstEntry.customMealId || "")
          : "";
        this._success = "";
        this._render();
      });
    });

    this.querySelectorAll("[data-day]").forEach((button) => {
      button.addEventListener("click", () => {
        const day = button.dataset.day;
        if (this._selectedDays.has(day)) {
          this._selectedDays.delete(day);
        } else {
          this._selectedDays.add(day);
        }
        this._render();
      });
    });

    const timeInput = this.querySelector("[data-time-input]");
    if (timeInput) {
      timeInput.addEventListener("input", (event) => {
        this._time = event.target.value || "08:00";
      });
    }

    this.querySelector("[data-cancel]")?.addEventListener("click", () => {
      if (this._editingScheduleId) {
        this._resetEditor();
        this._render();
      } else {
        this.dispatchEvent(new CustomEvent("cancel", { bubbles: true }));
      }
    });

    this.querySelector("[data-save]")?.addEventListener("click", () => this._saveSchedule());
  }

  async _saveSchedule() {
    const selectedItem = this._getItems().find((item) => {
      const normalized = this._normalizeItem(item, this._selectedType);
      return normalized.id === this._selectedId;
    });
    const selectedDays = [...this._selectedDays];

    if (!selectedItem || selectedDays.length === 0) {
      this._error = "Choose a food or meal and at least one day before saving.";
      this._success = "";
      this._render();
      return;
    }

    const normalized = this._normalizeItem(selectedItem, this._selectedType);
    this._saving = true;
    this._error = "";
    this._success = "";
    this._render();

    try {
      const editingScheduleId = this._editingScheduleId;
      const url = editingScheduleId
        ? `/api/recurring/schedules/${editingScheduleId}`
        : "/api/recurring/schedules";
      const response = await fetch(url, {
        method: editingScheduleId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: this._selectedType,
          itemId: this._selectedId,
          name: normalized.foodName || normalized.name,
          days: selectedDays,
          time: this._time,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "Failed to save schedule.");
      }

      const schedule = await response.json();
      if (editingScheduleId) {
        this._schedules = this._schedules.map((existing) =>
          existing.id === schedule.id ? schedule : existing,
        );
        this._success = "Schedule updated.";
      } else {
        this._schedules.push(schedule);
        this._success = "Schedule saved. It will run at 4:00 AM Pacific.";
      }
      this._editingScheduleId = null;
      this.dispatchEvent(
        new CustomEvent("schedule-saved", {
          bubbles: true,
          detail: schedule,
        }),
      );
    } catch (error) {
      this._error = error.message || "Failed to save schedule.";
    } finally {
      this._saving = false;
      this._render();
    }
  }

  _editSchedule(schedule) {
    this._editingScheduleId = schedule.id;
    this._selectedType = schedule.type;
    this._selectedId = String(schedule.itemId);
    this._selectedDays = new Set(schedule.days);
    this._time = schedule.time;
    this._error = "";
    this._success = "";
    this._render();
    this.scrollTo({ top: 0, behavior: "smooth" });
  }

  _resetEditor() {
    this._editingScheduleId = null;
    this._selectedType = "food";
    const firstFood = this._foods[0];
    this._selectedId = firstFood ? String(firstFood.foodId) : "";
    this._selectedDays = new Set(["Mon", "Wed", "Fri"]);
    this._time = "08:00";
    this._error = "";
    this._success = "";
  }

  async _deleteSchedule(scheduleId) {
    this._error = "";
    this._success = "";

    try {
      const response = await fetch(`/api/recurring/schedules/${scheduleId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || "Failed to delete schedule.");
      }
      this._schedules = this._schedules.filter((schedule) => schedule.id !== scheduleId);
      this._success = "Schedule deleted.";
    } catch (error) {
      this._error = error.message || "Failed to delete schedule.";
    }

    this._render();
  }
}

customElements.define("recurring-food-view", RecurringFoodView);
