const SERVING_UNITS = ["SERVING", "GRAM", "OUNCE", "MILLILITER", "CUP"];

/** @type {Array<{key:string, label:string, unit:string, required?:boolean}>} */
const MACRO_FIELDS = [
  { key: "calories", label: "Calories", unit: "kcal", required: true },
  { key: "carbs", label: "Carbohydrates", unit: "g", required: true },
  { key: "protein", label: "Protein", unit: "g", required: true },
  { key: "fat", label: "Total Fat", unit: "g", required: true },
];

const DETAIL_FIELDS = [
  { key: "fiber", label: "Dietary Fiber", unit: "g" },
  { key: "sugar", label: "Total Sugars", unit: "g" },
  { key: "addedSugars", label: "Added Sugars", unit: "g" },
  { key: "saturatedFat", label: "Saturated Fat", unit: "g" },
  { key: "monounsaturatedFat", label: "Monounsaturated Fat", unit: "g" },
  { key: "polyunsaturatedFat", label: "Polyunsaturated Fat", unit: "g" },
  { key: "transFat", label: "Trans Fat", unit: "g" },
  { key: "cholesterol", label: "Cholesterol", unit: "mg" },
  { key: "sodium", label: "Sodium", unit: "mg" },
  { key: "potassium", label: "Potassium", unit: "mg" },
];

const MICRONUTRIENT_FIELDS = [
  { key: "calcium", label: "Calcium", unit: "mg" },
  { key: "iron", label: "Iron", unit: "mg" },
  { key: "vitaminA", label: "Vitamin A", unit: "mg" },
  { key: "vitaminC", label: "Vitamin C", unit: "mg" },
  { key: "vitaminD", label: "Vitamin D", unit: "mg" },
];

class ReviewView extends HTMLElement {
  /** @type {object|null} */
  nutrition = null;
  /** @type {string|null} */
  imageUrl = null;

  _saving = false;
  _error = "";

  connectedCallback() {
    this._render();
  }

  _getValue(key) {
    return this.nutrition?.[key] ?? null;
  }

  _render() {
    this.className = "view";
    this.innerHTML = "";

    if (this._saving) {
      const loading = document.createElement("div");
      loading.className = "flex min-h-full items-center justify-center bg-base-200 p-6";
      loading.innerHTML = `
        <div class="card w-full max-w-sm border border-base-300 bg-base-100 shadow-xl">
          <div class="card-body items-center py-12 text-center">
            <span class="loading loading-spinner loading-lg text-primary"></span>
            <h2 class="card-title mt-3">Saving to Garmin</h2>
            <p class="text-sm text-base-content/60">Creating your custom food…</p>
          </div>
        </div>
      `;
      this.appendChild(loading);
      return;
    }

    const inner = document.createElement("div");
    inner.className = "view-inner review-page";

    const header = document.createElement("header");
    header.className = "mb-6";
    header.innerHTML = `
      <div class="badge badge-primary badge-outline mb-3">Review</div>
      <h1 class="text-3xl font-bold tracking-tight">Review nutrition details</h1>
      <p class="mt-2 max-w-2xl text-base text-base-content/60">
        Check the values extracted from the label before saving the food to Garmin Connect.
      </p>
    `;
    inner.appendChild(header);

    if (this._error) {
      const err = document.createElement("div");
      err.className = "alert alert-error mb-6";
      err.setAttribute("role", "alert");
      const icon = document.createElement("span");
      icon.dataset.lucide = "circle-alert";
      icon.className = "h-5 w-5 shrink-0";
      const message = document.createElement("span");
      message.textContent = this._error;
      err.append(icon, message);
      inner.appendChild(err);
    }

    const workspace = document.createElement("div");
    workspace.className = this.imageUrl
      ? "grid items-start gap-6 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.2fr)]"
      : "mx-auto max-w-3xl";

    if (this.imageUrl) {
      const preview = document.createElement("aside");
      preview.className =
        "card overflow-hidden border border-base-300 bg-base-100 shadow-sm lg:sticky lg:top-28";
      const figure = document.createElement("figure");
      figure.className = "bg-neutral";
      const img = document.createElement("img");
      img.src = this.imageUrl;
      img.className = "max-h-[34rem] w-full object-contain";
      img.alt = "Scanned nutrition label";
      figure.appendChild(img);
      preview.appendChild(figure);

      const previewBody = document.createElement("div");
      previewBody.className = "card-body gap-1 p-4";
      previewBody.innerHTML = `
        <h2 class="card-title text-base">
          <span data-lucide="scan-text" class="h-4 w-4"></span>
          Scanned label
        </h2>
        <p class="text-sm text-base-content/60">Use the label to verify each extracted value.</p>
      `;
      preview.appendChild(previewBody);
      workspace.appendChild(preview);
    }

    const form = document.createElement("form");
    form.className = "space-y-6";
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      this._save(form);
    });

    const identity = this._section(
      "Food information",
      "Name the food and confirm its serving size.",
      "utensils",
    );

    const identityGrid = document.createElement("div");
    identityGrid.className = "grid gap-4 sm:grid-cols-2";
    identityGrid.appendChild(
      this._textField(
        "foodName",
        "Food name",
        this.nutrition?.foodName || "",
        true,
      ),
    );
    identityGrid.appendChild(
      this._textField(
        "brandName",
        "Brand",
        this.nutrition?.brandName || "Homemade",
        false,
      ),
    );
    identity.body.appendChild(identityGrid);

    const servingRow = document.createElement("div");
    servingRow.className = "grid gap-4 sm:grid-cols-2";

    servingRow.appendChild(
      this._numberField(
        "numberOfUnits",
        "Serving count",
        this.nutrition?.numberOfUnits ?? 1,
        0.01,
        false,
      ),
    );

    const unitField = document.createElement("fieldset");
    unitField.className = "fieldset";
    const unitLabel = document.createElement("legend");
    unitLabel.className = "fieldset-legend";
    unitLabel.textContent = "Serving unit";
    unitField.appendChild(unitLabel);
    const select = document.createElement("select");
    select.id = "field-servingUnit";
    select.name = "servingUnit";
    select.className = "select select-bordered w-full";
    SERVING_UNITS.forEach((u) => {
      const opt = document.createElement("option");
      opt.value = u;
      opt.textContent = u.charAt(0) + u.slice(1).toLowerCase();
      if (u === (this.nutrition?.servingUnit || "SERVING")) opt.selected = true;
      select.appendChild(opt);
    });
    unitField.appendChild(select);
    servingRow.appendChild(unitField);
    identity.body.appendChild(servingRow);

    if (this.nutrition?.servingSizeDescription) {
      const desc = document.createElement("p");
      desc.className = "flex items-center gap-2 text-sm text-base-content/60";
      const infoIcon = document.createElement("span");
      infoIcon.dataset.lucide = "info";
      infoIcon.className = "h-4 w-4 shrink-0";
      const description = document.createElement("span");
      description.textContent = `Label says: ${this.nutrition.servingSizeDescription}`;
      desc.append(infoIcon, description);
      identity.body.appendChild(desc);
    }
    form.appendChild(identity.card);

    const macros = this._section(
      "Macronutrients",
      "Core values required by Garmin.",
      "chart-no-axes-column",
    );
    const macroGrid = document.createElement("div");
    macroGrid.className = "grid gap-4 sm:grid-cols-2";
    MACRO_FIELDS.forEach((f) => {
      macroGrid.appendChild(
        this._numberField(
          f.key,
          `${f.label} (${f.unit})`,
          this._getValue(f.key),
          0,
          f.required,
        ),
      );
    });
    macros.body.appendChild(macroGrid);
    form.appendChild(macros.card);

    const details = this._section(
      "Nutrition details",
      "Optional fats, sugars, electrolytes, and minerals.",
      "list-plus",
    );
    const detailGrid = document.createElement("div");
    detailGrid.className = "grid gap-4 sm:grid-cols-2";
    DETAIL_FIELDS.forEach((f) => {
      detailGrid.appendChild(
        this._numberField(
          f.key,
          `${f.label} (${f.unit})`,
          this._getValue(f.key),
          0,
          false,
        ),
      );
    });
    details.body.appendChild(detailGrid);
    form.appendChild(details.card);

    const micronutrients = this._section(
      "Micronutrients",
      "Optional vitamins and minerals.",
      "sparkles",
    );
    const microGrid = document.createElement("div");
    microGrid.className = "grid gap-4 sm:grid-cols-2";
    MICRONUTRIENT_FIELDS.forEach((f) => {
      microGrid.appendChild(
        this._numberField(
          f.key,
          `${f.label} (${f.unit})`,
          this._getValue(f.key),
          0,
          false,
        ),
      );
    });
    micronutrients.body.appendChild(microGrid);
    form.appendChild(micronutrients.card);

    const actions = document.createElement("div");
    actions.className =
      "card sticky bottom-4 z-10 border border-base-300 bg-base-100/95 shadow-xl backdrop-blur";
    const actionBody = document.createElement("div");
    actionBody.className = "card-body flex-row gap-3 p-3";

    const retakeBtn = document.createElement("button");
    retakeBtn.type = "button";
    retakeBtn.className = "btn btn-outline flex-1";
    retakeBtn.innerHTML =
      '<span data-lucide="camera" class="h-4 w-4"></span> Retake';
    retakeBtn.addEventListener("click", () =>
      this.dispatchEvent(new CustomEvent("retake", { bubbles: true })),
    );
    actionBody.appendChild(retakeBtn);

    const saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.className = "btn btn-primary flex-[2]";
    saveBtn.innerHTML =
      '<span data-lucide="check" class="h-4 w-4"></span> Save to Garmin';
    actionBody.appendChild(saveBtn);

    actions.appendChild(actionBody);
    form.appendChild(actions);
    workspace.appendChild(form);
    inner.appendChild(workspace);
    this.appendChild(inner);
    this._createIcons();
  }

  _section(title, description, icon) {
    const card = document.createElement("section");
    card.className = "card border border-base-300 bg-base-100 shadow-sm";
    const body = document.createElement("div");
    body.className = "card-body gap-5 p-5 sm:p-6";
    body.innerHTML = `
      <div>
        <h2 class="card-title text-lg">
          <span data-lucide="${icon}" class="h-5 w-5 text-primary"></span>
          ${title}
        </h2>
        <p class="mt-1 text-sm text-base-content/60">${description}</p>
      </div>
    `;
    card.appendChild(body);
    return { card, body };
  }

  _textField(name, label, value, required) {
    const wrapper = document.createElement("fieldset");
    wrapper.className = "fieldset";

    const lbl = document.createElement("legend");
    lbl.className = "fieldset-legend";
    lbl.textContent = label;
    wrapper.appendChild(lbl);

    const inp = document.createElement("input");
    inp.type = "text";
    inp.id = `field-${name}`;
    inp.name = name;
    inp.value = value || "";
    inp.required = !!required;
    inp.className = "input input-bordered w-full";
    wrapper.appendChild(inp);

    return wrapper;
  }

  _numberField(name, label, value, min = 0, required = false) {
    const wrapper = document.createElement("fieldset");
    wrapper.className = "fieldset";

    const lbl = document.createElement("legend");
    lbl.className = "fieldset-legend";
    lbl.textContent = label;
    wrapper.appendChild(lbl);

    const inp = document.createElement("input");
    inp.type = "number";
    inp.id = `field-${name}`;
    inp.name = name;
    inp.min = String(min);
    inp.step = "any";
    inp.required = !!required;
    inp.className = "input input-bordered w-full";
    if (value !== null && value !== undefined) inp.value = value;
    else inp.placeholder = "—";
    wrapper.appendChild(inp);

    return wrapper;
  }

  _createIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  _collectForm(form) {
    const fd = new FormData(form);
    const num = (k) => {
      const v = fd.get(k);
      if (v === null || v === "") return null;
      const n = parseFloat(v);
      return isNaN(n) ? null : n;
    };

    return {
      foodName: fd.get("foodName") || "",
      brandName: fd.get("brandName") || "Homemade",
      nutrition: {
        servingUnit: fd.get("servingUnit") || "SERVING",
        numberOfUnits: fd.get("numberOfUnits") || "1",
        calories: num("calories") ?? 0,
        carbs: num("carbs") ?? 0,
        protein: num("protein") ?? 0,
        fat: num("fat") ?? 0,
        fiber: num("fiber"),
        sugar: num("sugar"),
        addedSugars: num("addedSugars"),
        saturatedFat: num("saturatedFat"),
        monounsaturatedFat: num("monounsaturatedFat"),
        polyunsaturatedFat: num("polyunsaturatedFat"),
        transFat: num("transFat"),
        cholesterol: num("cholesterol"),
        sodium: num("sodium"),
        potassium: num("potassium"),
        vitaminA: num("vitaminA"),
        vitaminC: num("vitaminC"),
        vitaminD: num("vitaminD"),
        calcium: num("calcium"),
        iron: num("iron"),
      },
    };
  }

  async _save(form) {
    this._saving = true;
    this._error = "";

    const payload = this._collectForm(form);
    this._render();

    try {
      const res = await fetch("/api/garmin/food", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Failed to save food");
      }

      // Extract the food ID so the success view can offer a photo upload
      const foodId =
        data?.foodMetaData?.foodId ??
        data?.foodId ??
        data?.customFoodId ??
        null;

      if (!foodId) {
        console.error(
          "ERROR: Failed to extract foodId from response. Cannot proceed to photo upload.",
          data,
        );
      }

      this.dispatchEvent(
        new CustomEvent("save-success", {
          bubbles: true,
          detail: { foodId, imageUrl: this.imageUrl },
        }),
      );
    } catch (err) {
      this._saving = false;
      this._error = err.message;
      this._render();
      // Scroll to top to show error
      this.querySelector(".view-inner")?.scrollIntoView({ behavior: "smooth" });
    }
  }
}

customElements.define("review-view", ReviewView);
