(() => {
    const SELECTOR = ".nv-universal-credit, .credit-pill, .nv-credit-pill";
    const OPEN_CLASS = "is-open";
    const ARMED_MS = 2600;

    function isExternal(url) {
        return /^https?:\/\//i.test(String(url || ""));
    }

    function normalizeSafeHref(url) {
        const href = String(url || "").trim();
        if (!href || href === "#") return "";
        try {
            const parsed = new URL(href, window.location.href);
            if (!/^https?:$/.test(parsed.protocol)) return "";
            return isExternal(href) ? parsed.href : href;
        } catch {
            return "";
        }
    }

    function safeNavigate(url) {
        const href = normalizeSafeHref(url);
        if (!href) return;
        if (isExternal(href)) {
            window.open(href, "_blank", "noopener,noreferrer");
        } else {
            window.location.href = href;
        }
    }

    function ensureTooltip(control) {
        let tip = control.querySelector(":scope > .nv-credit-tooltip, :scope > .credit-tooltip");
        if (tip) {
            tip.classList.add("nv-credit-tooltip");
            return tip;
        }

        const label = (control.dataset.creditLabel || control.getAttribute("aria-label") || control.textContent || "Image credit").trim();
        tip = document.createElement("span");
        tip.className = "nv-credit-tooltip";
        tip.textContent = label || "Image credit";
        control.appendChild(tip);
        return tip;
    }

    function enhance(control) {
        if (!control || control.dataset.nvCreditReady === "true") return;

        const originalHref = normalizeSafeHref(control.dataset.creditHref || control.getAttribute("href") || "");
        if (originalHref) control.dataset.creditHref = originalHref;
        else delete control.dataset.creditHref;
        if (control.tagName === "A") {
            control.removeAttribute("href");
            control.setAttribute("role", "button");
            control.setAttribute("tabindex", "0");
        }
        if (control.tagName === "BUTTON") control.type = "button";

        const originalText = (control.dataset.creditLabel || control.textContent || "Image credit").replace(/\s+/g, " ").trim();
        if (!control.getAttribute("aria-label")) control.setAttribute("aria-label", originalText || "View image credit");
        control.dataset.creditLabel = originalText || "Image credit";
        control.dataset.nvCreditReady = "true";

        const tip = ensureTooltip(control);
        if (control.dataset.creditHref && !tip.querySelector(".nv-credit-action-hint")) {
            const hint = document.createElement("span");
            hint.className = "nv-credit-action-hint";
            hint.textContent = "Tap/click again to open source";
            tip.appendChild(hint);
        }
    }

    function enhanceAll(root = document) {
        root.querySelectorAll?.(SELECTOR).forEach(enhance);
    }

    function closeOthers(active = null) {
        document.querySelectorAll(`${SELECTOR}.${OPEN_CLASS}`).forEach(control => {
            if (control !== active) {
                control.classList.remove(OPEN_CLASS);
                delete control.dataset.creditArmedAt;
            }
        });
    }

    document.addEventListener("click", event => {
        const control = event.target.closest?.(SELECTOR);
        if (!control) {
            closeOthers();
            return;
        }

        enhance(control);
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();

        const href = control.dataset.creditHref || "";
        const now = Date.now();
        const armedAt = Number(control.dataset.creditArmedAt || 0);
        const isArmed = control.classList.contains(OPEN_CLASS) && armedAt && now - armedAt <= ARMED_MS;

        if (href && isArmed) {
            control.classList.remove(OPEN_CLASS);
            delete control.dataset.creditArmedAt;
            safeNavigate(href);
            return;
        }

        closeOthers(control);
        control.classList.add(OPEN_CLASS);
        control.dataset.creditArmedAt = String(now);
    }, true);

    document.addEventListener("keydown", event => {
        const control = event.target.closest?.(SELECTOR);
        if (!control || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        control.click();
    }, true);

    document.addEventListener("pointerover", event => {
        const control = event.target.closest?.(SELECTOR);
        if (control) enhance(control);
    }, true);

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => enhanceAll(), { once: true });
    } else {
        enhanceAll();
    }

    const observer = new MutationObserver(mutations => {
        mutations.forEach(mutation => mutation.addedNodes.forEach(node => {
            if (!(node instanceof Element)) return;
            if (node.matches?.(SELECTOR)) enhance(node);
            enhanceAll(node);
        }));
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });

    window.NullverseCredit = { enhanceAll, enhance, closeOthers, normalizeSafeHref };
})();
