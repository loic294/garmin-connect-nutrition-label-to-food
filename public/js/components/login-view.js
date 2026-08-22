class LoginView extends HTMLElement {
  /** @type {'credentials'|'mfa'|'loading'} */
  _phase = "credentials";
  _error = "";

  connectedCallback() {
    this._render();
  }

  _render() {
    this.className = "view";
    this.innerHTML = "";

    const hero = document.createElement("main");
    hero.className = "hero min-h-full bg-base-200 px-4 py-10";

    const content = document.createElement("div");
    content.className = "hero-content w-full max-w-md flex-col gap-6";

    const brand = document.createElement("div");
    brand.className = "text-center";
    brand.innerHTML = `
      <div class="avatar placeholder mb-4">
        <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-content shadow-sm">
          <span data-lucide="scan-line" class="h-8 w-8"></span>
        </div>
      </div>
      <h1 class="text-3xl font-bold tracking-tight">NutriScan</h1>
      <p class="mt-2 text-base text-base-content/60">
        Nutrition labels, saved directly to Garmin Connect.
      </p>
    `;
    content.appendChild(brand);

    const card = document.createElement("section");
    card.className = "card w-full border border-base-300 bg-base-100 shadow-xl";

    const cardBody = document.createElement("div");
    cardBody.className = "card-body gap-5 p-6 sm:p-8";

    const heading = document.createElement("div");
    heading.innerHTML = `
      <h2 class="card-title text-xl">
        ${this._phase === "mfa" ? "Verify your identity" : "Welcome back"}
      </h2>
      <p class="mt-1 text-sm leading-relaxed text-base-content/60">
        ${
          this._phase === "mfa"
            ? "Enter the verification code Garmin sent to your device."
            : "Use your Garmin Connect credentials to continue."
        }
      </p>
    `;
    cardBody.appendChild(heading);

    if (this._error) {
      const error = document.createElement("div");
      error.className = "alert alert-error";
      error.setAttribute("role", "alert");
      const icon = document.createElement("span");
      icon.dataset.lucide = "circle-alert";
      icon.className = "h-5 w-5 shrink-0";
      const message = document.createElement("span");
      message.className = "text-sm";
      message.textContent = this._error;
      error.append(icon, message);
      cardBody.appendChild(error);
    }

    if (this._phase === "loading") {
      const loading = document.createElement("div");
      loading.className = "flex flex-col items-center gap-4 py-8 text-center";
      loading.innerHTML = `
        <span class="loading loading-spinner loading-lg text-primary"></span>
        <div>
          <p class="font-semibold">Connecting to Garmin</p>
          <p class="mt-1 text-sm text-base-content/60">This may take a moment.</p>
        </div>
      `;
      cardBody.appendChild(loading);
      card.appendChild(cardBody);
      content.appendChild(card);
      hero.appendChild(content);
      this.appendChild(hero);
      this._createIcons();
      return;
    }

    const form = document.createElement("form");
    form.className = "space-y-4";
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      this._phase === "mfa" ? this._submitMFA(form) : this._submitLogin(form);
    });

    if (this._phase === "credentials") {
      form.appendChild(
        this._field("email", "Email", "email", "user@example.com"),
      );
      form.appendChild(this._field("password", "Password", "password", ""));
    } else {
      form.appendChild(
        this._field("code", "Verification code", "text", "000000"),
      );
    }

    const btn = document.createElement("button");
    btn.type = "submit";
    btn.className = "btn btn-primary mt-2 w-full";
    btn.innerHTML =
      this._phase === "mfa"
        ? '<span data-lucide="shield-check" class="h-4 w-4"></span> Verify code'
        : '<span data-lucide="log-in" class="h-4 w-4"></span> Sign in';
    form.appendChild(btn);

    cardBody.appendChild(form);

    const privacy = document.createElement("div");
    privacy.className = "divider my-0 text-xs text-base-content/40";
    privacy.textContent = "SECURE CONNECTION";
    cardBody.appendChild(privacy);

    const reassurance = document.createElement("p");
    reassurance.className =
      "flex items-start justify-center gap-2 text-center text-xs leading-relaxed text-base-content/60";
    reassurance.innerHTML = `
      <span data-lucide="lock-keyhole" class="mt-0.5 h-3.5 w-3.5 shrink-0"></span>
      <span>Your Garmin session is stored securely so you stay signed in. Your password is not saved.</span>
    `;
    cardBody.appendChild(reassurance);

    card.appendChild(cardBody);
    content.appendChild(card);
    hero.appendChild(content);
    this.appendChild(hero);
    this._createIcons();

    const firstInput = form.querySelector("input");
    if (firstInput) firstInput.focus();
  }

  _field(name, label, type, placeholder) {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "fieldset";

    const legend = document.createElement("legend");
    legend.className = "fieldset-legend";
    legend.textContent = label;
    fieldset.appendChild(legend);

    const inp = document.createElement("input");
    inp.type = type;
    inp.name = name;
    inp.id = `login-${name}`;
    inp.placeholder = placeholder;
    inp.autocomplete = name === "password" ? "current-password" : name;
    inp.required = true;
    inp.className = "input input-bordered w-full";
    if (name === "code") {
      inp.inputMode = "numeric";
      inp.autocomplete = "one-time-code";
      inp.pattern = "[0-9]*";
      inp.maxLength = 8;
      inp.className += " text-center text-lg tracking-[0.35em]";
    }
    fieldset.appendChild(inp);

    return fieldset;
  }

  _createIcons() {
    if (window.lucide && typeof window.lucide.createIcons === "function") {
      window.lucide.createIcons();
    }
  }

  async _submitLogin(form) {
    const email = form.email.value.trim();
    const password = form.password.value;
    this._phase = "loading";
    this._error = "";
    this._render();

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "Login failed");
      }

      if (data.status === "mfa_required") {
        this._phase = "mfa";
        this._render();
        return;
      }

      this.dispatchEvent(new CustomEvent("login-success", { bubbles: true }));
    } catch (err) {
      this._phase = "credentials";
      this._error = err.message;
      this._render();
    }
  }

  async _submitMFA(form) {
    const code = form.code.value.trim();
    this._phase = "loading";
    this._error = "";
    this._render();

    try {
      const res = await fetch("/api/auth/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.detail || "MFA verification failed");
      }

      this.dispatchEvent(new CustomEvent("login-success", { bubbles: true }));
    } catch (err) {
      this._phase = "mfa";
      this._error = err.message;
      this._render();
    }
  }
}

customElements.define("login-view", LoginView);
