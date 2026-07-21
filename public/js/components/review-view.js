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
      const loader = document.createElement("loading-indicator");
      loader.message = "Saving to Garmin Connect…";
      this.appendChild(loader);
      return;
    }

    const inner = document.createElement("div");
    inner.className = "view-inner";

    // Error banner
    if (this._error) {
      const err = document.createElement("div");
      err.className = "error-banner";
      err.textContent = this._error;
      inner.appendChild(err);
    }

    // Image thumbnail
    if (this.imageUrl) {
      const img = document.createElement("img");
      img.src = this.imageUrl;
      img.className = "image-preview";
      img.alt = "Scanned nutrition label";
      img.style.maxHeight = "160px";
      img.style.marginBottom = "var(--space-md)";
      inner.appendChild(img);
    }

    const form = document.createElement("form");
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      this._save(form);
    });

    // ── Food identity ──────────────────────────────────────────────
    this._appendSectionTitle(form, "Food information");

    form.appendChild(
      this._textField(
        "foodName",
        "Food name",
        this.nutrition?.foodName || "",
        true,
      ),
    );
    form.appendChild(
      this._textField(
        "brandName",
        "Brand",
        this.nutrition?.brandName || "Homemade",
        false,
      ),
    );

    // Serving
    const servingRow = document.createElement("div");
    servingRow.style.cssText =
      "display:grid; grid-template-columns:1fr 1fr; gap:var(--space-sm);";

    servingRow.appendChild(
      this._numberField(
        "numberOfUnits",
        "Serving count",
        this.nutrition?.numberOfUnits ?? 1,
        0.01,
        false,
      ),
    );

    const unitField = document.createElement("div");
    unitField.className = "field";
    const unitLabel = document.createElement("label");
    unitLabel.setAttribute("for", "field-servingUnit");
    unitLabel.textContent = "Serving unit";
    unitField.appendChild(unitLabel);
    const select = document.createElement("select");
    select.id = "field-servingUnit";
    select.name = "servingUnit";
    SERVING_UNITS.forEach((u) => {
      const opt = document.createElement("option");
      opt.value = u;
      opt.textContent = u.charAt(0) + u.slice(1).toLowerCase();
      if (u === (this.nutrition?.servingUnit || "SERVING")) opt.selected = true;
      select.appendChild(opt);
    });
    unitField.appendChild(select);
    servingRow.appendChild(unitField);
    form.appendChild(servingRow);

    if (this.nutrition?.servingSizeDescription) {
      const desc = document.createElement("p");
      desc.style.cssText =
        "font-size:var(--font-size-sm); color:var(--color-text-muted); margin-bottom:var(--space-md);";
      desc.textContent = `Label says: ${this.nutrition.servingSizeDescription}`;
      form.appendChild(desc);
    }

    // ── Context/Notes ─────────────────────────────────────────────
    form.appendChild(
      this._textField(
        "parsingContext",
        "Parsing context (optional)",
        "",
        false,
      ),
    );
    const contextHint = document.createElement("p");
    contextHint.style.cssText =
      "font-size:var(--font-size-sm); color:var(--color-text-muted); margin-bottom:var(--space-md);";
    contextHint.textContent =
      "E.g., 'multiply by 2.5 servings' or 'whole package' to help adjust the parsed values";
    form.appendChild(contextHint);

    // ── Macros ────────────────────────────────────────────────────
    this._appendSectionTitle(form, "Macronutrients");
    const macroGrid = document.createElement("div");
    macroGrid.className = "nutrition-grid";
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
    form.appendChild(macroGrid);

    // ── Details ───────────────────────────────────────────────────
    this._appendSectionTitle(form, "Details");
    const detailGrid = document.createElement("div");
    detailGrid.className = "nutrition-grid";
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
    form.appendChild(detailGrid);

    // ── Micronutrients ────────────────────────────────────────────
    this._appendSectionTitle(form, "Micronutrients");
    const microGrid = document.createElement("div");
    microGrid.className = "nutrition-grid";
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
    form.appendChild(microGrid);

    // ── Actions ───────────────────────────────────────────────────
    const actions = document.createElement("div");
    actions.style.cssText =
      "display:flex; gap:var(--space-sm); margin-top:var(--space-xl); margin-bottom:var(--space-xl);";

    const retakeBtn = document.createElement("button");
    retakeBtn.type = "button";
    retakeBtn.className = "btn-secondary";
    retakeBtn.style.flex = "1";
    retakeBtn.textContent = "Retake";
    retakeBtn.addEventListener("click", () =>
      this.dispatchEvent(new CustomEvent("retake", { bubbles: true })),
    );
    actions.appendChild(retakeBtn);

    const saveBtn = document.createElement("button");
    saveBtn.type = "submit";
    saveBtn.style.flex = "2";
    saveBtn.textContent = "Save to Garmin";
    actions.appendChild(saveBtn);

    form.appendChild(actions);
    inner.appendChild(form);
    this.appendChild(inner);
  }

  _appendSectionTitle(parent, text) {
    const el = document.createElement("p");
    el.className = "section-title";
    el.textContent = text;
    parent.appendChild(el);
  }

  _textField(name, label, value, required) {
    const wrapper = document.createElement("div");
    wrapper.className = "field";

    const lbl = document.createElement("label");
    lbl.setAttribute("for", `field-${name}`);
    lbl.textContent = label;
    wrapper.appendChild(lbl);

    const inp = document.createElement("input");
    inp.type = "text";
    inp.id = `field-${name}`;
    inp.name = name;
    inp.value = value || "";
    inp.required = !!required;
    wrapper.appendChild(inp);

    return wrapper;
  }

  _numberField(name, label, value, min = 0, required = false) {
    const wrapper = document.createElement("div");
    wrapper.className = "field";

    const lbl = document.createElement("label");
    lbl.setAttribute("for", `field-${name}`);
    lbl.textContent = label;
    wrapper.appendChild(lbl);

    const inp = document.createElement("input");
    inp.type = "number";
    inp.id = `field-${name}`;
    inp.name = name;
    inp.min = String(min);
    inp.step = "any";
    inp.required = !!required;
    if (value !== null && value !== undefined) inp.value = value;
    else inp.placeholder = "—";
    wrapper.appendChild(inp);

    return wrapper;
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
      parsingContext: fd.get("parsingContext") || "",
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
