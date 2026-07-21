/**
 * <success-view> — shown after a food is saved to Garmin.
 *
 * Phases:
 *   "prompt"    → Food saved! Ask if the user wants to add a photo.
 *   "pick"      → Choose between reusing the label photo or taking a new one.
 *   "edit"      → <image-editor>: crop to square, adjust brightness/saturation.
 *   "uploading" → Sending the processed image to the backend.
 *   "done"      → All finished.
 */
class SuccessView extends HTMLElement {
  /** @type {string|null} Garmin food ID returned by the creation API */
  foodId = null;
  /** @type {string|null} Blob URL of the nutrition label photo from the scan */
  imageUrl = null;
  /** @type {File|null} Original File object for the nutrition label photo */
  imageFile = null;
  /** @type {boolean} True if updating an existing food, false if creating new */
  isUpdate = false;
  /** @type {boolean} True if navigating from edit photo on food detail (skip prompt) */
  isEditingPhoto = false;

  _phase = "prompt";
  _editSrcUrl = null; // URL fed into <image-editor>
  _editFile = null; // raw File if user picked a new photo
  _error = "";

  connectedCallback() {
    console.log(
      "[SuccessView] connectedCallback. foodId:",
      this.foodId,
      "imageUrl:",
      this.imageUrl ? "blob-url" : "null",
      "imageFile:",
      this.imageFile ? "File" : "null",
      "isEditingPhoto:",
      this.isEditingPhoto,
    );
    // If editing photo from detail view, skip prompt and go to pick
    if (this.isEditingPhoto) {
      this._phase = "pick";
    }
    this._render();
  }

  disconnectedCallback() {
    if (this._editSrcUrl && this._editSrcUrl !== this.imageUrl) {
      URL.revokeObjectURL(this._editSrcUrl);
    }
  }

  // ─── Top-level render ──────────────────────────────────────────────────────

  _render() {
    console.log(
      "[SuccessView] _render() phase:",
      this._phase,
      "editSrcUrl:",
      this._editSrcUrl ? "valid-url" : "null",
      "error:",
      this._error || "none",
    );
    this.className = "view";
    this.innerHTML = "";

    if (this._phase === "uploading") {
      const loader = document.createElement("loading-indicator");
      loader.message = "Uploading photo…";
      this.appendChild(loader);
      return;
    }

    if (this._phase === "edit") {
      this._renderEdit();
      return;
    }

    const inner = document.createElement("div");
    inner.className = "view-inner";
    inner.style.paddingTop = "var(--space-xl)";

    // Shared header: checkmark + "Food saved!"
    const icon = document.createElement("div");
    icon.style.cssText = [
      "width:72px",
      "height:72px",
      "background:var(--color-primary)",
      "border:var(--border)",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "font-size:2rem",
      "font-weight:bold",
      "margin:0 auto var(--space-lg)",
    ].join(";");
    icon.textContent = "✓";
    inner.appendChild(icon);

    const title = document.createElement("h2");
    title.style.cssText = "text-align:center; margin-bottom:var(--space-sm);";
    title.textContent = this.isUpdate ? "Update food" : "Food saved!";
    inner.appendChild(title);

    const desc = document.createElement("p");
    desc.style.cssText =
      "color:var(--color-text-muted); text-align:center; margin-bottom:var(--space-lg);";
    desc.textContent = this.isUpdate
      ? "The food has been updated in your Garmin Connect custom foods."
      : "The food has been added to your Garmin Connect custom foods.";
    inner.appendChild(desc);

    if (this._error) {
      const err = document.createElement("div");
      err.className = "error-banner";
      err.textContent = this._error;
      inner.appendChild(err);
    }

    const divider = document.createElement("div");
    divider.style.cssText =
      "border-top:var(--border-light); margin-bottom:var(--space-lg);";
    inner.appendChild(divider);

    if (this._phase === "prompt") this._renderPrompt(inner);
    else if (this._phase === "pick") this._renderPick(inner);
    else this._renderDone(inner); // "done"

    this.appendChild(inner);
  }

  // ─── Prompt phase ──────────────────────────────────────────────────────────

  _renderPrompt(inner) {
    const q = document.createElement("p");
    q.style.cssText =
      "font-weight:var(--font-weight-bold); text-align:center; margin-bottom:var(--space-md);";
    q.textContent = "Add a product photo?";
    inner.appendChild(q);

    const actions = document.createElement("div");
    actions.style.cssText = "display:flex; gap:var(--space-sm);";

    const yes = document.createElement("button");
    yes.style.flex = "1";
    yes.textContent = "Yes";
    yes.addEventListener("click", () => {
      this._phase = "pick";
      this._render();
    });
    actions.appendChild(yes);

    const skip = document.createElement("button");
    skip.className = "btn-secondary";
    skip.style.flex = "1";
    skip.textContent = "Skip";
    skip.addEventListener("click", () => {
      this._phase = "done";
      this._render();
    });
    actions.appendChild(skip);

    inner.appendChild(actions);
  }

  // ─── Pick phase ────────────────────────────────────────────────────────────

  _renderPick(inner) {
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

    // Option A: reuse the nutrition label photo
    if (this.imageUrl) {
      const hint = document.createElement("p");
      hint.style.cssText =
        "font-size:var(--font-size-sm); color:var(--color-text-muted);" +
        "margin-bottom:var(--space-sm); text-align:center;";
      hint.textContent = "Use and edit the nutrition label photo:";
      inner.appendChild(hint);

      const thumb = document.createElement("img");
      thumb.src = this.imageUrl;
      thumb.className = "image-preview";
      thumb.style.maxHeight = "140px";
      thumb.style.marginBottom = "var(--space-sm)";
      inner.appendChild(thumb);

      const useLabelBtn = document.createElement("button");
      useLabelBtn.className = "btn-full";
      useLabelBtn.style.marginBottom = "var(--space-md)";
      useLabelBtn.textContent = "Edit & use this photo";
      useLabelBtn.addEventListener("click", () => {
        // Prefer using imageFile for reliability; fall back to imageUrl
        if (this.imageFile) {
          this._editFile = null; // clear any new photo selection
          this._editSrcUrl = URL.createObjectURL(this.imageFile);
        } else {
          this._editSrcUrl = this.imageUrl;
        }
        this._phase = "edit";
        this._render();
      });
      inner.appendChild(useLabelBtn);

      const orDivider = document.createElement("p");
      orDivider.style.cssText =
        "text-align:center; font-size:var(--font-size-sm);" +
        "color:var(--color-text-muted); margin-bottom:var(--space-sm);";
      orDivider.textContent = "— or —";
      inner.appendChild(orDivider);
    }

    // Option B: take a new photo or choose from library (split into two buttons)
    const photoActions = document.createElement("div");
    photoActions.style.cssText =
      "display:flex; flex-direction:column; gap:var(--space-sm); margin-bottom:var(--space-sm);";

    const takeBtn = document.createElement("button");
    takeBtn.className = "btn-secondary btn-full";
    takeBtn.textContent = "Take a new photo";
    takeBtn.addEventListener("click", () => cameraInput.click());
    photoActions.appendChild(takeBtn);

    const chooseBtn = document.createElement("button");
    chooseBtn.className = "btn-secondary btn-full";
    chooseBtn.textContent = "Choose from library";
    chooseBtn.addEventListener("click", () => fileInput.click());
    photoActions.appendChild(chooseBtn);

    inner.appendChild(photoActions);

    const skipBtn = document.createElement("button");
    skipBtn.className = "btn-secondary btn-full";
    skipBtn.textContent = "Skip";
    skipBtn.addEventListener("click", () => {
      this._phase = "done";
      this._render();
    });
    inner.appendChild(skipBtn);
  }

  // ─── Edit phase ────────────────────────────────────────────────────────────

  _renderEdit() {
    console.log(
      "[SuccessView] _renderEdit() starting. _editSrcUrl:",
      this._editSrcUrl ? "exists" : "null",
      "_editFile:",
      this._editFile ? "exists" : "null",
      "imageFile:",
      this.imageFile ? "exists" : "null",
    );
    this.innerHTML = "";

    const inner = document.createElement("div");
    inner.className = "view-inner";
    inner.style.paddingTop = "var(--space-md)";

    const heading = document.createElement("h3");
    heading.style.cssText = "margin-bottom:var(--space-md); text-align:center;";
    heading.textContent = "Crop & adjust";
    inner.appendChild(heading);

    const editor = document.createElement("image-editor");

    // Use imageFile directly if available for better reliability
    // Otherwise fall back to the blob URL
    let srcUrl = this._editSrcUrl;
    if (this._editFile && !srcUrl) {
      srcUrl = URL.createObjectURL(this._editFile);
      console.log("[SuccessView] Creating blob URL from _editFile");
      this._editSrcUrl = srcUrl; // cache it for potential cleanup
    } else if (!srcUrl && this.imageFile) {
      srcUrl = URL.createObjectURL(this.imageFile);
      console.log("[SuccessView] Creating blob URL from imageFile");
      this._editSrcUrl = srcUrl;
    }

    console.log(
      "[SuccessView] Setting image-editor srcUrl:",
      srcUrl ? "valid-url" : "NULL!",
    );
    editor.srcUrl = srcUrl;

    editor.addEventListener("edit-done", (e) =>
      this._onEditDone(e.detail.blob),
    );
    editor.addEventListener("edit-cancel", () => {
      this._phase = "pick";
      this._render();
    });

    inner.appendChild(editor);
    this.appendChild(inner);
  }

  // ─── Done phase ────────────────────────────────────────────────────────────

  _renderDone(inner) {
    const btn = document.createElement("button");
    btn.className = "btn-full";
    btn.textContent = "Add another food";
    btn.addEventListener("click", () =>
      this.dispatchEvent(new CustomEvent("add-another", { bubbles: true })),
    );
    inner.appendChild(btn);
  }

  // ─── Event handlers ────────────────────────────────────────────────────────

  async _onFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      // Resize image to max 2048px
      const resizedFile = await this._resizeImage(file);

      if (this._editSrcUrl && this._editSrcUrl !== this.imageUrl) {
        URL.revokeObjectURL(this._editSrcUrl);
      }

      this._editFile = resizedFile;
      this._editSrcUrl = URL.createObjectURL(resizedFile);
      this._phase = "edit";
      this._render();
    } catch (err) {
      console.error("[SuccessView] Failed to resize image:", err);
      alert("Failed to process image: " + err.message);
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

  async _onEditDone(blob) {
    this._phase = "uploading";
    this._error = "";
    this._render();

    try {
      const form = new FormData();
      form.append("file", blob, "photo.jpg");

      const url = this.foodId
        ? `/api/garmin/food/${encodeURIComponent(this.foodId)}/photo`
        : "/api/garmin/food/photo";

      const res = await fetch(url, { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) throw new Error(data.detail || "Photo upload failed");

      this._phase = "done";
      this._render();
    } catch (err) {
      this._error = err.message;
      this._phase = "done"; // still show "done" — food was saved, only photo failed
      this._render();
    }
  }
}

customElements.define("success-view", SuccessView);
