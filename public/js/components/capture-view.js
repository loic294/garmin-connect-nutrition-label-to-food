class CaptureView extends HTMLElement {
  _error = "";
  _analyzing = false;
  _selectedFile = null;
  _previewUrl = null;
  _parsingContext = ""; // Context to help Claude understand the label

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

    // Hidden file inputs
    // Camera input: "capture=environment" opens rear camera on mobile
    const cameraInput = document.createElement("input");
    cameraInput.type = "file";
    cameraInput.accept = "image/*";
    cameraInput.setAttribute("capture", "environment");
    cameraInput.style.display = "none";
    cameraInput.addEventListener("change", (e) => this._onFileSelected(e));
    inner.appendChild(cameraInput);

    // File picker input: no capture attribute, opens library/files
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*";
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

    // Parsing context input (shown when file is selected)
    if (this._selectedFile) {
      const contextLabel = document.createElement("label");
      contextLabel.style.cssText =
        "display:block; margin-top:var(--space-md); margin-bottom:var(--space-xs); font-weight:var(--font-weight-bold); font-size:var(--font-size-sm);";
      contextLabel.textContent = "Parsing context (optional)";
      inner.appendChild(contextLabel);

      const contextHint = document.createElement("p");
      contextHint.style.cssText =
        "margin:0 0 var(--space-xs); font-size:var(--font-size-sm); color:var(--color-text-muted);";
      contextHint.textContent =
        "E.g., 'multiply by 2.5 servings' or 'whole package' to help interpret the label";
      inner.appendChild(contextHint);

      const contextInput = document.createElement("input");
      contextInput.type = "text";
      contextInput.placeholder = "e.g., Whole package or per 2 cups";
      contextInput.value = this._parsingContext;
      contextInput.style.cssText =
        "width:100%; padding:var(--space-sm); border:var(--border); border-radius:4px; font-size:1rem; margin-bottom:var(--space-md);";
      contextInput.addEventListener("change", (e) => {
        this._parsingContext = e.target.value;
      });
      inner.appendChild(contextInput);
    }

    // Action buttons
    const actions = document.createElement("div");
    actions.style.cssText =
      "display:flex; flex-direction:column; gap:var(--space-sm); margin-top:var(--space-md);";

    // Analyze button — only shown once a file is selected (appears first with yellow styling)
    if (this._selectedFile) {
      const analyzeBtn = document.createElement("button");
      analyzeBtn.className = "btn-full";
      analyzeBtn.style.backgroundColor = "#fbbf24";
      analyzeBtn.style.color = "#000";
      analyzeBtn.style.fontWeight = "bold";
      analyzeBtn.textContent = "Analyze nutrition label";
      analyzeBtn.addEventListener("click", () => this._analyze());
      actions.appendChild(analyzeBtn);

      // Separator
      const separator = document.createElement("div");
      separator.style.cssText =
        "height:1px; background:var(--color-border); margin:var(--space-xs) 0;";
      actions.appendChild(separator);
    }

    // Take a photo button (camera)
    const takeBtn = document.createElement("button");
    takeBtn.className = "btn-full";
    takeBtn.textContent = this._selectedFile
      ? "Take another photo"
      : "Take a photo";
    takeBtn.addEventListener("click", () => cameraInput.click());
    actions.appendChild(takeBtn);

    // Choose from library button (file picker)
    const chooseBtn = document.createElement("button");
    chooseBtn.className = "btn-full btn-secondary";
    chooseBtn.textContent = "Choose from library";
    chooseBtn.addEventListener("click", () => fileInput.click());
    actions.appendChild(chooseBtn);

    inner.appendChild(actions);
    this.appendChild(inner);
  }

  async _onFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    this._error = "";

    try {
      // Resize image to max 2048px
      this._selectedFile = await this._resizeImage(file);

      if (this._previewUrl) URL.revokeObjectURL(this._previewUrl);
      this._previewUrl = URL.createObjectURL(this._selectedFile);

      this._render();
    } catch (err) {
      this._error = "Failed to process image: " + err.message;
      this._render();
    }
  }

  async _resizeImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const maxSize = 2048;
          let width = img.width;
          let height = img.height;

          // Calculate new dimensions, maintaining aspect ratio
          if (width > height && width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }

          // Create canvas and draw resized image
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          // Convert canvas to blob
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("Failed to create blob from canvas"));
              } else {
                // Create new File object with resized blob
                const resizedFile = new File([blob], file.name, {
                  type: "image/jpeg",
                  lastModified: Date.now(),
                });
                resolve(resizedFile);
              }
            },
            "image/jpeg",
            0.92,
          );
        };
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = event.target.result;
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  }

  async _analyze() {
    if (!this._selectedFile) return;

    this._analyzing = true;
    this._error = "";
    this._render();

    try {
      const formData = new FormData();
      formData.append("file", this._selectedFile);
      if (this._parsingContext) {
        formData.append("parsingContext", this._parsingContext);
      }

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
