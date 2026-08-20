(() => {
    if (window.__nvUniversalCredit20260820_2) return;
    window.__nvUniversalCredit20260820_2 = true;

    const SELECTOR = ".nv-universal-credit, .credit-pill, .nv-credit-pill";
    const OPEN_CLASS = "is-open";
    const ARMED_MS = 2600;
    let portal = null;
    let portalOwner = null;

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

    function ensurePortal() {
        if (portal?.isConnected) return portal;
        portal = document.createElement("div");
        portal.id = "nv-credit-floating-tooltip";
        portal.className = "nv-credit-floating-tooltip";
        portal.setAttribute("role", "tooltip");
        portal.hidden = true;
        document.body.appendChild(portal);
        return portal;
    }

    function hidePortal(owner = null) {
        if (owner && portalOwner && owner !== portalOwner) return;
        portalOwner?.classList.remove("nv-credit-portal-active");
        portalOwner = null;
        if (!portal) return;
        portal.classList.remove("is-visible");
        portal.hidden = true;
    }

    function positionPortal(control) {
        if (!control || !portal || portal.hidden || portalOwner !== control) return;
        const controlRect = control.getBoundingClientRect();
        const viewportWidth = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
        const viewportHeight = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
        const edge = 10;
        const gap = 9;
        const maxWidth = Math.min(286, Math.max(180, viewportWidth - 28));

        portal.style.width = `${maxWidth}px`;
        portal.style.maxWidth = `${maxWidth}px`;
        portal.style.left = "0px";
        portal.style.top = "0px";

        const measured = portal.getBoundingClientRect();
        const width = measured.width || maxWidth;
        const height = measured.height || 80;

        let left = controlRect.left;
        if (left + width > viewportWidth - edge) left = controlRect.right - width;
        left = Math.max(edge, Math.min(left, viewportWidth - width - edge));

        let top = controlRect.top - height - gap;
        let below = false;
        if (top < edge) {
            const candidate = controlRect.bottom + gap;
            if (candidate + height <= viewportHeight - edge || candidate > top) {
                top = candidate;
                below = true;
            }
        }
        top = Math.max(edge, Math.min(top, Math.max(edge, viewportHeight - height - edge)));

        portal.style.left = `${Math.round(left)}px`;
        portal.style.top = `${Math.round(top)}px`;
        portal.dataset.side = below ? "below" : "above";
    }

    function showPortal(control) {
        if (!control) return;
        enhance(control);
        const tip = ensureTooltip(control);
        const floating = ensurePortal();

        if (portalOwner && portalOwner !== control) portalOwner.classList.remove("nv-credit-portal-active");
        portalOwner = control;
        control.classList.add("nv-credit-portal-active");
        floating.innerHTML = tip.innerHTML;
        floating.hidden = false;
        floating.classList.remove("is-visible");
        positionPortal(control);
        requestAnimationFrame(() => {
            if (portalOwner !== control || floating.hidden) return;
            positionPortal(control);
            floating.classList.add("is-visible");
        });
    }

    function enhance(control) {
        if (!control) return;

        const originalHref = normalizeSafeHref(control.dataset.creditHref || control.getAttribute("href") || "");
        if (originalHref) control.dataset.creditHref = originalHref;
        else delete control.dataset.creditHref;
        if (control.tagName === "A") {
            control.removeAttribute("href");
            control.setAttribute("role", "button");
            control.setAttribute("tabindex", "0");
        }
        if (control.tagName === "BUTTON") control.type = "button";

        if (control.dataset.nvCreditReady !== "true") {
            const originalText = (control.dataset.creditLabel || control.textContent || "Image credit").replace(/\s+/g, " ").trim();
            if (!control.getAttribute("aria-label")) control.setAttribute("aria-label", originalText || "View image credit");
            control.dataset.creditLabel = originalText || "Image credit";
            control.dataset.nvCreditReady = "true";
        }

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
        if (root.matches?.(SELECTOR)) enhance(root);
    }

    function closeOthers(active = null) {
        document.querySelectorAll(`${SELECTOR}.${OPEN_CLASS}`).forEach(control => {
            if (control !== active) {
                control.classList.remove(OPEN_CLASS);
                delete control.dataset.creditArmedAt;
                control.classList.remove("nv-credit-portal-active");
            }
        });
        if (!active || portalOwner !== active) hidePortal();
    }

    document.addEventListener("click", event => {
        const control = event.target.closest?.(SELECTOR);
        if (!control) {
            closeOthers();
            hidePortal();
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
            hidePortal(control);
            safeNavigate(href);
            return;
        }

        closeOthers(control);
        control.classList.add(OPEN_CLASS);
        control.dataset.creditArmedAt = String(now);
        showPortal(control);
    }, true);

    document.addEventListener("keydown", event => {
        const control = event.target.closest?.(SELECTOR);
        if (!control || (event.key !== "Enter" && event.key !== " ")) return;
        event.preventDefault();
        control.click();
    }, true);

    document.addEventListener("pointerover", event => {
        const control = event.target.closest?.(SELECTOR);
        if (!control) return;
        if (event.relatedTarget && control.contains(event.relatedTarget)) return;
        showPortal(control);
    }, true);

    document.addEventListener("pointerout", event => {
        const control = event.target.closest?.(SELECTOR);
        if (!control) return;
        if (event.relatedTarget && control.contains(event.relatedTarget)) return;
        if (!control.classList.contains(OPEN_CLASS)) hidePortal(control);
    }, true);

    document.addEventListener("focusin", event => {
        const control = event.target.closest?.(SELECTOR);
        if (control) showPortal(control);
    }, true);

    document.addEventListener("focusout", event => {
        const control = event.target.closest?.(SELECTOR);
        if (control && !control.classList.contains(OPEN_CLASS)) hidePortal(control);
    }, true);

    const reposition = () => {
        if (portalOwner) positionPortal(portalOwner);
    };
    window.addEventListener("resize", reposition, { passive: true });
    window.addEventListener("scroll", reposition, { passive: true, capture: true });

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

    window.NullverseCredit = {
        enhanceAll,
        enhance,
        closeOthers,
        normalizeSafeHref,
        showPortal,
        hidePortal,
        positionTooltip: positionPortal
    };
})();
