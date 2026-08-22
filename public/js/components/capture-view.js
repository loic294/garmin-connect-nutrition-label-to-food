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
    inner.className = "view-inner pt-4";

    if (this._error) {
      const err = document.createElement("div");
      err.className = "alert alert-error";
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
      img.className = "image-preview mb-4";
      img.alt = "Selected nutrition label";
      inner.appendChild(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "mb-4 flex h-56 w-full items-center justify-center rounded-box border border-base-300 bg-base-200 text-sm text-base-content/70";
      placeholder.textContent = "No image selected";
      inner.appendChild(placeholder);
    }

    if (this._selectedFile) {
      const contextLabel = document.createElement("label");
      contextLabel.className = "label mt-4 mb-1 px-0 pb-0";
      contextLabel.textContent = "Parsing context (optional)";
      inner.appendChild(contextLabel);

      const contextHint = document.createElement("p");
      contextHint.className = "mb-2 text-xs text-base-content/70";
      contextHint.textContent =
        "E.g., 'multiply by 2.5 servings' or 'whole package' to help interpret the label";
      inner.appendChild(contextHint);

      const contextInput = document.createElement("input");
      contextInput.type = "text";
      contextInput.className = "input input-bordered w-full mb-4";
      contextInput.placeholder = "e.g., Whole package or per 2 cups";
      contextInput.value = this._parsingContext;
      contextInput.addEventListener("change", (e) => {
        this._parsingContext = e.target.value;
      });
      inner.appendChild(contextInput);
    }

    const actions = document.createElement("div");
    actions.className = "mt-4 flex flex-col gap-3";

    if (this._selectedFile) {
      const analyzeBtn = document.createElement("button");
      analyzeBtn.className = "btn btn-primary w-full";
      analyzeBtn.textContent = "Analyze nutrition label";
      analyzeBtn.addEventListener("click", () => this._analyze());
      actions.appendChild(analyzeBtn);
    }

    // Take a photo button (camera)
    const takeBtn = document.createElement("button");
    takeBtn.className = "btn btn-primary w-full";
    takeBtn.textContent = this._selectedFile
      ? "Take another photo"
      : "Take a photo";
    takeBtn.addEventListener("click", () => cameraInput.click());
    actions.appendChild(takeBtn);

    // Choose from library button (file picker)
    const chooseBtn = document.createElement("button");
    chooseBtn.className = "btn btn-outline w-full";
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
