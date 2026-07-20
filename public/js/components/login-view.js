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

    const inner = document.createElement("div");
    inner.className = "view-inner";
    inner.style.paddingTop = "var(--space-xl)";

    // Logo / heading
    const heading = document.createElement("h1");
    heading.style.marginBottom = "var(--space-xs)";
    heading.textContent = "NutriScan";
    inner.appendChild(heading);

    const sub = document.createElement("p");
    sub.style.color = "var(--color-text-muted)";
    sub.style.marginBottom = "var(--space-xl)";
    sub.textContent =
      this._phase === "mfa"
        ? "Enter the verification code sent to your device."
        : "Sign in with your Garmin Connect account.";
    inner.appendChild(sub);

    // Error banner
    if (this._error) {
      const err = document.createElement("div");
      err.className = "error-banner";
      err.textContent = this._error;
      inner.appendChild(err);
    }

    if (this._phase === "loading") {
      const spinner = document.createElement("loading-indicator");
      spinner.message = "Signing in…";
      spinner.style.flex = "0";
      inner.appendChild(spinner);
      this.appendChild(inner);
      return;
    }

    const form = document.createElement("form");
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
    btn.className = "btn-full";
    btn.style.marginTop = "var(--space-md)";
    btn.textContent = this._phase === "mfa" ? "Verify" : "Sign in";
    form.appendChild(btn);

    inner.appendChild(form);
    this.appendChild(inner);

    // Auto-focus first input
    const firstInput = form.querySelector("input");
    if (firstInput) firstInput.focus();
  }

  _field(name, label, type, placeholder) {
    const wrapper = document.createElement("div");
    wrapper.className = "field";

    const lbl = document.createElement("label");
    lbl.setAttribute("for", `login-${name}`);
    lbl.textContent = label;
    wrapper.appendChild(lbl);

    const inp = document.createElement("input");
    inp.type = type;
    inp.name = name;
    inp.id = `login-${name}`;
    inp.placeholder = placeholder;
    inp.autocomplete = name === "password" ? "current-password" : name;
    inp.required = true;
    wrapper.appendChild(inp);

    return wrapper;
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
