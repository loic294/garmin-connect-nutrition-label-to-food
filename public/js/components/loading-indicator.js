class LoadingIndicator extends HTMLElement {
  set message(val) {
    this._message = val;
    const span = this.querySelector(".loading-message");
    if (span) span.textContent = val;
  }

  connectedCallback() {
    this.className = "view";
    this.innerHTML = `
      <div class="flex flex-1 flex-col items-center justify-center gap-3 p-8">
        <span class="loading loading-spinner loading-lg"></span>
        <p class="loading-message text-sm text-base-content/70">
          ${this._message || "Loading…"}
        </p>
      </div>
    `;
  }
}

customElements.define("loading-indicator", LoadingIndicator);
