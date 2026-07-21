/**
 * <food-detail> — shows detailed nutrition information for a food.
 *
 * Props:
 *   food - {foodId, foodName, brandName, imageUrl, calories, protein, fat, carbs, ...}
 *
 * Emits:
 *   'back'                                       — user clicked back button
 *   'edit-photo' {detail: {foodId, food}}       — user clicked edit photo button
 *   'edit-food' {detail: {foodId, food}}        — user clicked edit food button
 */
class FoodDetail extends HTMLElement {
  food = null;

  connectedCallback() {
    this._render();
  }

  _render() {
    this.className = "view";
    this.innerHTML = "";

    if (!this.food) {
      this.textContent = "No food data";
      return;
    }

    const inner = document.createElement("div");
    inner.className = "view-inner";

    // Back button
    const backBtn = document.createElement("button");
    backBtn.className = "btn-secondary btn-sm";
    backBtn.style.marginBottom = "var(--space-lg)";
    backBtn.textContent = "← Back";
    backBtn.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("back", { bubbles: true }));
    });
    inner.appendChild(backBtn);

    // Image
    if (this.food.imageUrl) {
      const img = document.createElement("img");
      img.src = this.food.imageUrl;
      img.style.cssText =
        "width:100%; max-width:300px; max-height:300px; border-radius:8px; object-fit:cover; margin-bottom:var(--space-lg); display:block; margin-left:auto; margin-right:auto;";
      img.alt = this.food.foodName;
      inner.appendChild(img);
    }

    // Name and brand
    const name = document.createElement("h2");
    name.style.cssText = "margin:0 0 var(--space-xs); text-align:center;";
    name.textContent = this.food.foodName || "Unnamed";
    inner.appendChild(name);

    if (this.food.brandName) {
      const brand = document.createElement("p");
      brand.style.cssText =
        "margin:0 0 var(--space-lg); text-align:center; color:var(--color-text-muted); font-size:var(--font-size-sm);";
      brand.textContent = this.food.brandName;
      inner.appendChild(brand);
    }

    // Nutrition info
    const nutriSection = document.createElement("div");
    nutriSection.style.cssText =
      "background:var(--color-surface-alt); padding:var(--space-md); border-radius:8px; margin-bottom:var(--space-lg);";

    const nutriTitle = document.createElement("h3");
    nutriTitle.style.cssText = "margin:0 0 var(--space-md);";
    nutriTitle.textContent = "Nutrition (per serving)";
    nutriSection.appendChild(nutriTitle);

    const nutrients = [
      { label: "Calories", value: this.food.calories },
      { label: "Protein", value: this.food.protein, unit: "g" },
      { label: "Carbs", value: this.food.carbs, unit: "g" },
      { label: "Fat", value: this.food.fat, unit: "g" },
      { label: "Fiber", value: this.food.fiber, unit: "g" },
      { label: "Sugar", value: this.food.sugar, unit: "g" },
    ];

    for (const { label, value, unit } of nutrients) {
      if (value != null && value !== "") {
        const row = document.createElement("div");
        row.style.cssText =
          "display:flex; justify-content:space-between; margin-bottom:var(--space-sm); font-size:var(--font-size-sm);";

        const labelEl = document.createElement("span");
        labelEl.textContent = label;
        labelEl.style.color = "var(--color-text-muted)";

        const valueEl = document.createElement("span");
        valueEl.style.fontWeight = "var(--font-weight-bold)";
        valueEl.textContent = `${Math.round(value * 10) / 10}${unit ? " " + unit : ""}`;

        row.appendChild(labelEl);
        row.appendChild(valueEl);
        nutriSection.appendChild(row);
      }
    }

    inner.appendChild(nutriSection);

    // Edit photo button
    const editPhotoBtn = document.createElement("button");
    editPhotoBtn.className = "btn-secondary btn-full";
    editPhotoBtn.style.marginBottom = "var(--space-sm)";
    editPhotoBtn.textContent = "Add/Change Photo";
    editPhotoBtn.addEventListener("click", () => {
      this.dispatchEvent(
        new CustomEvent("edit-photo", {
          bubbles: true,
          detail: { foodId: this.food.foodId, food: this.food },
        }),
      );
    });
    inner.appendChild(editPhotoBtn);

    // Edit button
    const editBtn = document.createElement("button");
    editBtn.className = "btn-full";
    editBtn.textContent = "Edit Food";
    editBtn.addEventListener("click", () => {
      this.dispatchEvent(
        new CustomEvent("edit-food", {
          bubbles: true,
          detail: { foodId: this.food.foodId, food: this.food },
        }),
      );
    });
    inner.appendChild(editBtn);

    this.appendChild(inner);
  }
}

customElements.define("food-detail", FoodDetail);
