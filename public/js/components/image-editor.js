/**
 * <image-editor> — square crop + brightness/saturation editor.
 *
 * Set `srcUrl` (blob: or data: URL) before appending to the DOM.
 *
 * Emits:
 *   'edit-done'   { detail: { blob } }  — JPEG blob of the edited square image
 *   'edit-cancel'                       — user clicked Back
 *
 * Controls:
 *   • Drag  — reposition the image inside the square crop frame
 *   • Pinch — zoom (mobile)
 *   • Scroll wheel — zoom (desktop)
 *   • Brightness slider (50 – 200%)
 *   • Saturation slider (0 – 300%)
 */
class ImageEditor extends HTMLElement {
  /** @type {string|null} blob: or data: URL of the source image */
  srcUrl = null;

  _img = null;
  _offsetX = 0;
  _offsetY = 0;
  _scale = 1;
  _minScale = 0.1;
  _brightness = 100;
  _saturation = 100;
  _size = 320; // canvas display size px (recalculated in connectedCallback)
  _isProcessing = false; // true while processing background removal

  // Drag / pinch state
  _drag = null; // { lastX, lastY } | null
  _pinch = null; // { dist, initScale } | null

  connectedCallback() {
    console.log("[ImageEditor] connectedCallback: srcUrl=", this.srcUrl);
    // Fit the canvas to the available width (minus 32 px padding), max 400
    this._size = Math.min(400, (window.innerWidth || 400) - 32);
    console.log("[ImageEditor] canvas size:", this._size, "px");
    this._render();
    this._loadImage();
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  _render() {
    this.innerHTML = "";

    // Canvas
    const canvas = document.createElement("canvas");
    canvas.className = "crop-canvas";
    canvas.width = this._size;
    canvas.height = this._size;
    canvas.style.cssText = [
      `display:block`,
      `width:${this._size}px`,
      `height:${this._size}px`,
      `border:var(--border)`,
      `cursor:grab`,
      `touch-action:none`,
      `background:var(--color-surface)`,
      `margin:0 auto`,
    ].join(";");

    this._attachCanvasEvents(canvas);
    this.appendChild(canvas);

    // Hint
    const hint = document.createElement("p");
    hint.style.cssText =
      "font-size:var(--font-size-sm); color:var(--color-text-muted);" +
      "text-align:center; margin:var(--space-xs) 0 var(--space-md);";
    hint.textContent = "Drag to reposition · Pinch or scroll to zoom";
    this.appendChild(hint);

    // Sliders
    this.appendChild(
      this._slider("Brightness", 50, 200, this._brightness, (v) => {
        this._brightness = v;
        this._draw();
      }),
    );
    this.appendChild(
      this._slider("Saturation", 0, 300, this._saturation, (v) => {
        this._saturation = v;
        this._draw();
      }),
    );

    // Background removal button (with inline spinner)
    const bgBtn = document.createElement("button");
    bgBtn.type = "button";
    bgBtn.className = "btn-secondary btn-full";
    bgBtn.disabled = this._isProcessing;
    bgBtn.style.marginTop = "var(--space-md)";

    if (this._isProcessing) {
      // Show spinner inline with "Removing..." text
      bgBtn.style.cssText =
        "display: flex; align-items: center; justify-content: center; gap: 8px;";

      const loader = document.createElement("loading-indicator");
      loader.message = "Removing…";
      bgBtn.appendChild(loader);
    } else {
      bgBtn.textContent = "Remove Background";
    }

    bgBtn.addEventListener("click", () => this._removeBackground());
    this.appendChild(bgBtn);

    // Action buttons
    const actions = document.createElement("div");
    actions.style.cssText =
      "display:flex; gap:var(--space-sm); margin-top:var(--space-lg);";

    const back = document.createElement("button");
    back.className = "btn-secondary";
    back.style.flex = "1";
    back.textContent = "Back";
    back.addEventListener("click", () =>
      this.dispatchEvent(new CustomEvent("edit-cancel", { bubbles: true })),
    );
    actions.appendChild(back);

    const apply = document.createElement("button");
    apply.style.flex = "2";
    apply.textContent = "Use this photo";
    apply.addEventListener("click", () => this._apply());
    actions.appendChild(apply);

    this.appendChild(actions);
  }

  _slider(label, min, max, value, onChange) {
    const wrapper = document.createElement("div");
    wrapper.className = "field";

    const row = document.createElement("div");
    row.style.cssText =
      "display:flex; justify-content:space-between; margin-bottom:var(--space-xs);";

    const lbl = document.createElement("label");
    lbl.textContent = label;
    row.appendChild(lbl);

    const valSpan = document.createElement("span");
    valSpan.className = "slider-value";
    valSpan.style.cssText =
      "font-size:var(--font-size-sm); color:var(--color-text-muted);";
    valSpan.textContent = `${value}%`;
    row.appendChild(valSpan);
    wrapper.appendChild(row);

    const input = document.createElement("input");
    input.type = "range";
    input.min = String(min);
    input.max = String(max);
    input.value = String(value);
    input.addEventListener("input", () => {
      valSpan.textContent = `${input.value}%`;
      onChange(Number(input.value));
    });
    wrapper.appendChild(input);

    return wrapper;
  }

  // ─── Image loading ─────────────────────────────────────────────────────────

  _loadImage() {
    console.log("[ImageEditor] _loadImage() called with srcUrl=", this.srcUrl);
    if (!this.srcUrl) {
      console.error("[ImageEditor] ERROR: srcUrl is null/undefined!");
      return;
    }
    const img = new Image();
    img.onload = () => {
      console.log(
        "[ImageEditor] Image loaded successfully. naturalSize:",
        img.naturalWidth,
        "x",
        img.naturalHeight,
      );
      this._img = img;
      // Scale so the image covers the square canvas (like object-fit:cover)
      this._scale = Math.max(
        this._size / img.naturalWidth,
        this._size / img.naturalHeight,
      );
      this._minScale = this._scale * 0.5;
      this._offsetX = 0;
      this._offsetY = 0;
      console.log(
        "[ImageEditor] scale:",
        this._scale,
        "minScale:",
        this._minScale,
      );
      this._draw();

      // If we were processing background removal, clear the flag and re-render to hide spinner
      if (this._isProcessing) {
        this._isProcessing = false;
        this._render();
        this._draw(); // Redraw on the new canvas after re-rendering
      }
    };
    img.onerror = (err) => {
      console.error("[ImageEditor] Image load FAILED:", err);
      // Clear processing flag on error
      this._isProcessing = false;
      // Surface load failure in the canvas area
      const canvas = this.querySelector("canvas.crop-canvas");
      if (!canvas) {
        console.error("[ImageEditor] Canvas element not found!");
        return;
      }
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#cc0000";
      ctx.font = "14px system-ui";
      ctx.fillText("Failed to load image", 8, this._size / 2);
    };
    img.src = this.srcUrl;
    console.log("[ImageEditor] Image.src assigned, waiting for load event...");
  }

  // ─── Canvas drawing ────────────────────────────────────────────────────────

  _draw() {
    const canvas = this.querySelector("canvas.crop-canvas");
    if (!canvas) {
      console.warn("[ImageEditor] _draw() called but canvas not found");
      return;
    }
    if (!this._img) {
      console.warn("[ImageEditor] _draw() called but image not loaded yet");
      return;
    }

    console.log(
      "[ImageEditor] _draw() rendering. offset:",
      this._offsetX,
      this._offsetY,
      "scale:",
      this._scale,
      "brightness:",
      this._brightness,
      "saturation:",
      this._saturation,
    );
    const ctx = canvas.getContext("2d");
    const s = this._size;
    ctx.clearRect(0, 0, s, s);

    // ctx.filter is supported in Chrome 52+, Firefox 49+, Safari 18+
    ctx.filter = `brightness(${this._brightness}%) saturate(${this._saturation}%)`;

    const w = this._img.naturalWidth * this._scale;
    const h = this._img.naturalHeight * this._scale;
    const x = (s - w) / 2 + this._offsetX;
    const y = (s - h) / 2 + this._offsetY;
    ctx.drawImage(this._img, x, y, w, h);
  }

  // ─── Export ────────────────────────────────────────────────────────────────

  _apply() {
    if (!this._img) return;

    // Render at 2× resolution (up to 800 px) for quality
    const outputSize = Math.min(800, this._size * 2);
    const ratio = outputSize / this._size;

    const out = document.createElement("canvas");
    out.width = outputSize;
    out.height = outputSize;
    const ctx = out.getContext("2d");

    ctx.filter = `brightness(${this._brightness}%) saturate(${this._saturation}%)`;
    const w = this._img.naturalWidth * this._scale * ratio;
    const h = this._img.naturalHeight * this._scale * ratio;
    const x = (outputSize - w) / 2 + this._offsetX * ratio;
    const y = (outputSize - h) / 2 + this._offsetY * ratio;
    ctx.drawImage(this._img, x, y, w, h);

    out.toBlob(
      (blob) => {
        this.dispatchEvent(
          new CustomEvent("edit-done", { bubbles: true, detail: { blob } }),
        );
      },
      "image/jpeg",
      0.92,
    );
  }

  async _removeBackground() {
    if (!this._img || this._isProcessing) return;

    this._isProcessing = true;
    this._render(); // Show spinner overlay
    console.log("[ImageEditor] Starting background removal...");

    try {
      // Export at full resolution (not canvas display size)
      // Render at 2048px without any filters (brightness/saturation)
      const outputSize = 2048;
      const ratio = outputSize / this._size;

      const canvas = document.createElement("canvas");
      canvas.width = outputSize;
      canvas.height = outputSize;
      const ctx = canvas.getContext("2d");

      // Draw image WITHOUT brightness/saturation filters for clean background removal
      const w = this._img.naturalWidth * this._scale * ratio;
      const h = this._img.naturalHeight * this._scale * ratio;
      const x = (outputSize - w) / 2 + this._offsetX * ratio;
      const y = (outputSize - h) / 2 + this._offsetY * ratio;
      ctx.drawImage(this._img, x, y, w, h);

      const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, "image/jpeg", 0.95);
      });

      // Send to backend for Anthropic processing
      const formData = new FormData();
      formData.append("file", blob, "image.jpg");

      const res = await fetch("/api/analyze/remove-background", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(
          error.detail || `Background removal failed (${res.status})`,
        );
      }

      // Get processed image and reload canvas
      const processedBlob = await res.blob();
      const url = URL.createObjectURL(processedBlob);

      // Clear current image state
      if (this.srcUrl && this.srcUrl.startsWith("blob:")) {
        URL.revokeObjectURL(this.srcUrl);
      }

      // Reload with processed image
      this.srcUrl = url;
      this._loadImage();
      console.log("[ImageEditor] Background removal complete");
    } catch (err) {
      console.error("[ImageEditor] Background removal error:", err);
      alert(`Background removal failed: ${err.message}`);
      this._isProcessing = false;
      this._render(); // Hide spinner on error
    }
  }

  // ─── Pointer / touch events ────────────────────────────────────────────────

  _attachCanvasEvents(canvas) {
    // Mouse
    canvas.addEventListener("mousedown", (e) => {
      e.preventDefault();
      this._startDrag(e.clientX, e.clientY);
    });
    window.addEventListener("mousemove", (e) =>
      this._moveDrag(e.clientX, e.clientY),
    );
    window.addEventListener("mouseup", () => this._endDrag());

    // Scroll-to-zoom
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const factor = e.deltaY > 0 ? 0.92 : 1.08;
        this._zoom(factor);
      },
      { passive: false },
    );

    // Touch — drag (1 finger) and pinch (2 fingers)
    canvas.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length === 1) {
          this._startDrag(e.touches[0].clientX, e.touches[0].clientY);
        } else if (e.touches.length === 2) {
          this._drag = null;
          this._pinch = { dist: this._pinchDist(e), initScale: this._scale };
        }
      },
      { passive: true },
    );

    canvas.addEventListener(
      "touchmove",
      (e) => {
        e.preventDefault();
        if (e.touches.length === 1 && this._drag) {
          this._moveDrag(e.touches[0].clientX, e.touches[0].clientY);
        } else if (e.touches.length === 2 && this._pinch) {
          const dist = this._pinchDist(e);
          this._scale = Math.max(
            this._minScale,
            this._pinch.initScale * (dist / this._pinch.dist),
          );
          this._clampOffset();
          this._draw();
        }
      },
      { passive: false },
    );

    canvas.addEventListener("touchend", () => {
      this._endDrag();
      this._pinch = null;
    });
  }

  _startDrag(x, y) {
    this._drag = { lastX: x, lastY: y };
    const canvas = this.querySelector("canvas.crop-canvas");
    if (canvas) canvas.style.cursor = "grabbing";
  }

  _moveDrag(x, y) {
    if (!this._drag) return;
    this._offsetX += x - this._drag.lastX;
    this._offsetY += y - this._drag.lastY;
    this._drag.lastX = x;
    this._drag.lastY = y;
    this._clampOffset();
    this._draw();
  }

  _endDrag() {
    this._drag = null;
    const canvas = this.querySelector("canvas.crop-canvas");
    if (canvas) canvas.style.cursor = "grab";
  }

  _zoom(factor) {
    this._scale = Math.max(this._minScale, this._scale * factor);
    this._clampOffset();
    this._draw();
  }

  _pinchDist(e) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Keep the image filling at least half the canvas on each axis
   * so the user can't drag it completely off-screen.
   */
  _clampOffset() {
    if (!this._img) return;
    const halfW = (this._img.naturalWidth * this._scale) / 2;
    const halfH = (this._img.naturalHeight * this._scale) / 2;
    const limit = this._size / 2;
    this._offsetX = Math.min(halfW, Math.max(-halfW, this._offsetX));
    this._offsetY = Math.min(halfH, Math.max(-halfH, this._offsetY));
  }
}

customElements.define("image-editor", ImageEditor);
