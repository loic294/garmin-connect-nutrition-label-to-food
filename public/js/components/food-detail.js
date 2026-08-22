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
    console.log("[FoodDetail] _render() with food:", this.food);

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
    backBtn.className = "btn btn-outline btn-sm mb-5";
    backBtn.textContent = "← Back";
    backBtn.addEventListener("click", () => {
      this.dispatchEvent(new CustomEvent("back", { bubbles: true }));
    });
    inner.appendChild(backBtn);

    if (this.food.imageUrl) {
      const img = document.createElement("img");
      img.src = this.food.imageUrl;
      img.className = "mx-auto mb-5 block max-h-[300px] w-full max-w-[300px] rounded-box object-cover";
      img.alt = this.food.foodName;
      inner.appendChild(img);
    }

    const name = document.createElement("h2");
    name.className = "mb-1 text-center text-2xl font-bold";
    name.textContent = this.food.foodName || "Unnamed";
    inner.appendChild(name);

    if (this.food.brandName) {
      const brand = document.createElement("p");
      brand.className = "mb-5 text-center text-sm text-base-content/70";
      brand.textContent = this.food.brandName;
      inner.appendChild(brand);
    }

    const nutriSection = document.createElement("div");
    nutriSection.className = "card mb-5 bg-base-200/80 p-4";

    const nutriTitle = document.createElement("h3");
    nutriTitle.className = "mb-3 text-lg font-semibold";
    const servingDesc = this.food.servingSizeDescription || "per serving";
    nutriTitle.textContent = `Nutrition (${servingDesc})`;
    nutriSection.appendChild(nutriTitle);

    const nutrients = [
      { label: "Calories", value: this.food.calories },
      { label: "Protein", value: this.food.protein, unit: "g" },
      { label: "Carbs", value: this.food.carbs, unit: "g" },
      { label: "Fat", value: this.food.fat, unit: "g" },
      { label: "Fiber", value: this.food.fiber, unit: "g" },
      { label: "Sugar", value: this.food.sugar, unit: "g" },
      { label: "Added Sugars", value: this.food.addedSugars, unit: "g" },
      { label: "Saturated Fat", value: this.food.saturatedFat, unit: "g" },
      {
        label: "Monounsaturated Fat",
        value: this.food.monounsaturatedFat,
        unit: "g",
      },
      {
        label: "Polyunsaturated Fat",
        value: this.food.polyunsaturatedFat,
        unit: "g",
      },
      { label: "Trans Fat", value: this.food.transFat, unit: "g" },
      { label: "Cholesterol", value: this.food.cholesterol, unit: "mg" },
      { label: "Sodium", value: this.food.sodium, unit: "mg" },
      { label: "Potassium", value: this.food.potassium, unit: "mg" },
      { label: "Vitamin A", value: this.food.vitaminA, unit: "mcg" },
      { label: "Vitamin C", value: this.food.vitaminC, unit: "mg" },
      { label: "Vitamin D", value: this.food.vitaminD, unit: "mcg" },
      { label: "Calcium", value: this.food.calcium, unit: "mg" },
      { label: "Iron", value: this.food.iron, unit: "mg" },
    ];

    for (const { label, value, unit } of nutrients) {
      if (value != null && value !== "") {
        const row = document.createElement("div");
        row.className = "mb-2 flex items-center justify-between gap-3 text-sm";

        const labelEl = document.createElement("span");
        labelEl.textContent = label;
        labelEl.className = "text-base-content/70";

        const valueEl = document.createElement("span");
        valueEl.className = "font-semibold";
        valueEl.textContent = `${Math.round(value * 10) / 10}${unit ? " " + unit : ""}`;

        row.appendChild(labelEl);
        row.appendChild(valueEl);
        nutriSection.appendChild(row);
      }
    }

    inner.appendChild(nutriSection);

    const editPhotoBtn = document.createElement("button");
    editPhotoBtn.className = "btn btn-outline mb-2 w-full";
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
    editBtn.className = "btn btn-primary w-full";
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
