class LoadingIndicator extends HTMLElement {
  set message(val) {
    this._message = val;
    const span = this.querySelector(".loading-message");
    if (span) span.textContent = val;
  }

  connectedCallback() {
    this.className = "view";
    this.innerHTML = `
      <div style="
        display:flex; flex-direction:column; align-items:center;
        justify-content:center; flex:1; gap:var(--space-md);
        padding:var(--space-xl);
      ">
        <div class="spinner"></div>
        <p class="loading-message" style="color:var(--color-text-muted)">
          ${this._message || "Loading…"}
        </p>
      </div>
    `;
  }
}

customElements.define("loading-indicator", LoadingIndicator);
