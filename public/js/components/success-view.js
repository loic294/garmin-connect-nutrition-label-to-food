class SuccessView extends HTMLElement {
  connectedCallback() {
    this.className = "view";

    const inner = document.createElement("div");
    inner.className = "view-inner";
    inner.style.cssText =
      "display:flex; flex-direction:column; align-items:center; justify-content:center; flex:1; text-align:center; padding-top:var(--space-xl);";

    const icon = document.createElement("div");
    icon.style.cssText = `
      width:72px; height:72px;
      background:var(--color-primary);
      border:var(--border);
      display:flex; align-items:center; justify-content:center;
      font-size:2rem; margin-bottom:var(--space-lg); font-weight:bold;
    `;
    icon.textContent = "✓";
    inner.appendChild(icon);

    const title = document.createElement("h2");
    title.style.marginBottom = "var(--space-sm)";
    title.textContent = "Food saved!";
    inner.appendChild(title);

    const desc = document.createElement("p");
    desc.style.cssText =
      "color:var(--color-text-muted); margin-bottom:var(--space-xl);";
    desc.textContent =
      "The food has been added to your Garmin Connect custom foods.";
    inner.appendChild(desc);

    const btn = document.createElement("button");
    btn.textContent = "Add another food";
    btn.addEventListener("click", () =>
      this.dispatchEvent(new CustomEvent("add-another", { bubbles: true })),
    );
    inner.appendChild(btn);

    this.appendChild(inner);
  }
}

customElements.define("success-view", SuccessView);
