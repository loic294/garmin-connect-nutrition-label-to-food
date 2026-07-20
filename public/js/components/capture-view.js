class CaptureView extends HTMLElement {
  _error = "";
  _analyzing = false;
  _selectedFile = null;
  _previewUrl = null;

  connectedCallback() {
    this._render();
  }

  disconnectedCallback() {
    // Don't revoke blob URL here - it's still used by subsequent views
  }

  _render() {
    this.className = "view";
    this.innerHTML = "";

    if (this._analyzing) {
      const loader = document.createElement("loading-indicator");
      loader.message = "Analyzing nutrition label…";
      this.appendChild(loader);
      return;
    }

    const inner = document.createElement("div");
    inner.className = "view-inner";
    inner.style.paddingTop = "var(--space-lg)";

    // Error banner
    if (this._error) {
      const err = document.createElement("div");
      err.className = "error-banner";
      err.textContent = this._error;
      inner.appendChild(err);
    }

    // Hidden file input — "capture=environment" opens rear camera on mobile
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
    fileInput.setAttribute("capture", "environment");
    fileInput.style.display = "none";
    fileInput.addEventListener("change", (e) => this._onFileSelected(e));
    inner.appendChild(fileInput);

    // Image preview or placeholder
    if (this._previewUrl) {
      const img = document.createElement("img");
      img.src = this._previewUrl;
      img.className = "image-preview";
      img.alt = "Selected nutrition label";
      inner.appendChild(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.style.cssText = `
        width:100%; height:220px; border:var(--border);
        background:var(--color-surface);
        display:flex; align-items:center; justify-content:center;
        color:var(--color-text-muted); font-size:var(--font-size-sm);
        margin-bottom:var(--space-md);
      `;
      placeholder.textContent = "No image selected";
      inner.appendChild(placeholder);
    }

    // Action buttons
    const actions = document.createElement("div");
    actions.style.cssText =
      "display:flex; flex-direction:column; gap:var(--space-sm); margin-top:var(--space-md);";

    // Take / choose photo button
    const captureBtn = document.createElement("button");
    captureBtn.className = "btn-full";
    captureBtn.textContent = this._selectedFile
      ? "Retake / Change photo"
      : "Take or choose a photo";
    captureBtn.addEventListener("click", () => fileInput.click());
    actions.appendChild(captureBtn);

    // Analyze button — only shown once a file is selected
    if (this._selectedFile) {
      const analyzeBtn = document.createElement("button");
      analyzeBtn.className = "btn-full btn-secondary";
      analyzeBtn.textContent = "Analyze nutrition label";
      analyzeBtn.addEventListener("click", () => this._analyze());
      actions.appendChild(analyzeBtn);
    }

    inner.appendChild(actions);
    this.appendChild(inner);
  }

  _onFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    this._selectedFile = file;
    this._error = "";

    if (this._previewUrl) URL.revokeObjectURL(this._previewUrl);
    this._previewUrl = URL.createObjectURL(file);

    this._render();
  }

  async _analyze() {
    if (!this._selectedFile) return;

    this._analyzing = true;
    this._error = "";
    this._render();

    try {
      const formData = new FormData();
      formData.append("file", this._selectedFile);

      const res = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Analysis failed");
      }

      this.dispatchEvent(
        new CustomEvent("analysis-complete", {
          bubbles: true,
          detail: {
            nutrition: data,
            imageUrl: this._previewUrl,
            imageFile: this._selectedFile,
          },
        }),
      );
    } catch (err) {
      this._analyzing = false;
      this._error = err.message;
      this._render();
    }
  }
}

customElements.define("capture-view", CaptureView);
