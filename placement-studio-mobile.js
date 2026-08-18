
(() => {
    "use strict";

    const enhanced = new WeakSet();
    const gestures = new WeakMap();
    let fitRaf = 0;

    function touchLayout() {
        const touch = (navigator.maxTouchPoints || 0) > 0
            || matchMedia("(pointer:coarse)").matches
            || matchMedia("(hover:none)").matches;
        const shortScreen = Math.min(screen.width || 9999, screen.height || 9999);
        const viewportMax = Math.max(innerWidth || 0, innerHeight || 0);
        return touch && (viewportMax <= 1366 || shortScreen <= 1024);
    }

    const overlay = () => document.querySelector(".image-placement-overlay");
    const open = el => !!el?.classList.contains("open");

    function markActions(el) {
        el.querySelectorAll(".image-placement-topbar .topbar-actions button").forEach(btn => {
            const call = (btn.getAttribute("onclick") || "").toLowerCase();
            const label = (btn.textContent || "").trim().toLowerCase();
            if (call.includes("reset") || label === "reset") btn.dataset.nvPlacementAction = "reset";
            else if (call.includes("close") || call.includes("cancel") || label === "cancel") btn.dataset.nvPlacementAction = "cancel";
            else if (call.includes("apply") || call.includes("save") || label.includes("apply") || label.includes("save placement")) {
                btn.dataset.nvPlacementAction = "apply";
                if (label !== "apply") {
                    btn.dataset.nvPlacementOriginalLabel = (btn.textContent || "").trim();
                    btn.setAttribute("aria-label", btn.dataset.nvPlacementOriginalLabel);
                    btn.textContent = "Apply";
                }
            }
        });
    }

    function addSheetToggle(el, sidebar) {
        if (sidebar.querySelector(".nv-mobile-placement-sheet-toggle")) return;
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "nv-mobile-placement-sheet-toggle";
        btn.setAttribute("aria-expanded", "false");
        btn.innerHTML = `
      <span class="nv-placement-sheet-copy">
        <strong>Adjust image</strong>
        <span>Fit, zoom, rotate & precise position</span>
      </span>
      <span class="nv-placement-chevron" aria-hidden="true">⌃</span>`;
        btn.addEventListener("click", () => {
            const show = !el.classList.contains("nv-placement-sheet-open");
            el.classList.toggle("nv-placement-sheet-open", show);
            btn.setAttribute("aria-expanded", show ? "true" : "false");
            queueFit();
        });
        sidebar.prepend(btn);
    }

    function addHint(workspace) {
        if (workspace.querySelector(".nv-placement-touch-hint")) return;
        const hint = document.createElement("div");
        hint.className = "nv-placement-touch-hint";
        hint.textContent = "Drag to reposition • pinch to zoom";
        workspace.appendChild(hint);
    }

    function groupFor(input) {
        return input?.closest(".image-placement-small-grid") || input?.parentElement || null;
    }

    function collectAdvanced(el, sidebar) {
        if (sidebar.querySelector(".nv-placement-advanced-details")) return;
        const reset = el.querySelector('[data-nv-placement-action="reset"]');
        if (reset) reset.classList.add("nv-placement-reset-mobile");

        const nodes = [
            groupFor(el.querySelector("#image-placement-x")),
            groupFor(el.querySelector("#image-placement-y")),
            groupFor(el.querySelector("#image-placement-frame-width")),
            groupFor(el.querySelector("#image-placement-frame-height")),
            el.querySelector(".image-placement-button-row"),
            reset
        ].filter(Boolean);
        const unique = [...new Set(nodes)].filter(node =>
            sidebar.contains(node) || node?.dataset?.nvPlacementAction === "reset"
        );
        if (!unique.length) return;

        const details = document.createElement("details");
        details.className = "nv-placement-advanced-details";
        const summary = document.createElement("summary");
        summary.textContent = "Precise positioning";
        const body = document.createElement("div");
        body.className = "nv-placement-advanced-content";
        details.append(summary, body);
        unique.forEach(node => body.appendChild(node));
        sidebar.appendChild(details);
    }

    function number(id, fallback = 0) {
        const n = Number(document.getElementById(id)?.value);
        return Number.isFinite(n) ? n : fallback;
    }

    function setValue(input, value, preferred = "input") {
        if (!input || !Number.isFinite(Number(value))) return;
        let next = Number(value);
        const min = Number(input.min), max = Number(input.max);
        if (Number.isFinite(min)) next = Math.max(min, next);
        if (Number.isFinite(max)) next = Math.min(max, next);
        const step = Number(input.step);
        if (Number.isFinite(step) && step > 0) {
            const decimals = (String(input.step).split(".")[1] || "").length;
            next = Number(next.toFixed(Math.min(6, decimals)));
        }
        input.value = String(next);
        const first = preferred === "change" ? "change" : "input";
        input.dispatchEvent(new Event(first, { bubbles: true }));
        if (first === "input" && !input.getAttribute("oninput") && input.getAttribute("onchange")) {
            input.dispatchEvent(new Event("change", { bubbles: true }));
        }
        if (first === "change" && !input.getAttribute("onchange") && input.getAttribute("oninput")) {
            input.dispatchEvent(new Event("input", { bubbles: true }));
        }
    }

    function frameLogicalSize(frame) {
        const cs = getComputedStyle(frame);
        return {
            width: Math.max(1, parseFloat(cs.getPropertyValue("--fit-frame-width")) || parseFloat(cs.width) || frame.offsetWidth || 1),
            height: Math.max(1, parseFloat(cs.getPropertyValue("--fit-frame-height")) || parseFloat(cs.height) || frame.offsetHeight || 1)
        };
    }

    function fitFrame(el = overlay()) {
        if (!touchLayout() || !open(el)) return;
        const workspace = el.querySelector(".image-placement-workspace");
        const frame = el.querySelector(".image-placement-frame");
        if (!workspace || !frame) return;
        const logical = frameLogicalSize(frame);
        const r = workspace.getBoundingClientRect();
        const scale = Math.max(.08, Math.min(1, (r.width - 24) / logical.width, (r.height - 24) / logical.height));
        frame.style.setProperty("--nv-placement-frame-scale", String(scale));
        el.dataset.nvPlacementFrameScale = String(scale);
    }

    function queueFit() {
        cancelAnimationFrame(fitRaf);
        fitRaf = requestAnimationFrame(() => fitFrame());
    }

    function restartGesture(state) {
        const pts = [...state.pointers.values()];
        state.baseX = number("image-placement-x", 0);
        state.baseY = number("image-placement-y", 0);
        state.baseScale = number("image-placement-scale", 1);
        if (pts.length >= 2) {
            const [a, b] = pts;
            state.mode = "pinch";
            state.startDistance = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
            state.startMidX = (a.x + b.x) / 2;
            state.startMidY = (a.y + b.y) / 2;
        } else if (pts.length === 1) {
            state.mode = "drag";
            state.startX = pts[0].x;
            state.startY = pts[0].y;
        } else state.mode = "";
    }

    function installGestures(el) {
        const frame = el.querySelector(".image-placement-frame");
        if (!frame || gestures.has(frame)) return;
        const state = { pointers: new Map(), mode: "" };
        gestures.set(frame, state);

        const valid = e => e.pointerType === "touch" || e.pointerType === "pen" || (!e.pointerType && touchLayout());

        frame.addEventListener("pointerdown", e => {
            if (!open(el) || !touchLayout() || !valid(e)) return;
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            try { frame.setPointerCapture(e.pointerId); } catch { }
            restartGesture(state);
        }, true);

        frame.addEventListener("pointermove", e => {
            if (!state.pointers.has(e.pointerId) || !valid(e)) return;
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
            const pts = [...state.pointers.values()];
            const previewScale = Math.max(.08, Number(el.dataset.nvPlacementFrameScale || 1));

            if (pts.length >= 2) {
                if (state.mode !== "pinch") restartGesture(state);
                const [a, b] = pts;
                const dist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
                const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
                setValue(document.getElementById("image-placement-scale"), state.baseScale * (dist / state.startDistance), "input");
                setValue(document.getElementById("image-placement-x"), state.baseX + (midX - state.startMidX) / previewScale, "change");
                setValue(document.getElementById("image-placement-y"), state.baseY + (midY - state.startMidY) / previewScale, "change");
            } else if (pts.length === 1) {
                if (state.mode !== "drag") restartGesture(state);
                const p = pts[0];
                setValue(document.getElementById("image-placement-x"), state.baseX + (p.x - state.startX) / previewScale, "change");
                setValue(document.getElementById("image-placement-y"), state.baseY + (p.y - state.startY) / previewScale, "change");
            }
        }, true);

        const end = e => {
            if (!state.pointers.has(e.pointerId)) return;
            e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
            state.pointers.delete(e.pointerId);
            try { frame.releasePointerCapture(e.pointerId); } catch { }
            restartGesture(state);
        };
        frame.addEventListener("pointerup", end, true);
        frame.addEventListener("pointercancel", end, true);
    }

    function enhance(el) {
        if (!el || enhanced.has(el) || !touchLayout()) return;
        const sidebar = el.querySelector(".image-placement-sidebar");
        const workspace = el.querySelector(".image-placement-workspace");
        if (!sidebar || !workspace) return;
        enhanced.add(el);
        el.classList.add("nv-placement-mobile-enhanced");
        markActions(el);
        addSheetToggle(el, sidebar);
        addHint(workspace);
        collectAdvanced(el, sidebar);
        installGestures(el);
    }

    function sync() {
        const el = overlay();
        if (!el || !touchLayout()) {
            document.documentElement.classList.remove("nv-placement-studio-open");
            document.body?.classList.remove("nv-placement-studio-open");
            return;
        }

        // Do not restructure or touch Placement Studio DOM during page/editor boot.
        // The enhancement is installed lazily only after the existing studio has
        // actually been opened by the user.
        if (open(el)) {
            enhance(el);
            document.documentElement.classList.add("nv-placement-studio-open");
            document.body?.classList.add("nv-placement-studio-open");
            el.classList.remove("nv-placement-sheet-open");
            el.querySelector(".nv-mobile-placement-sheet-toggle")?.setAttribute("aria-expanded", "false");
            requestAnimationFrame(() => {
                fitFrame(el);
                setTimeout(() => fitFrame(el), 70);
                setTimeout(() => fitFrame(el), 240);
            });
        } else {
            document.documentElement.classList.remove("nv-placement-studio-open");
            document.body?.classList.remove("nv-placement-studio-open");
            el.classList.remove("nv-placement-sheet-open");
        }
    }

    function boot() {
        const el = overlay();
        if (!el) return;
        new MutationObserver(sync).observe(el, { attributes: true, attributeFilter: ["class", "aria-hidden", "style"] });
        addEventListener("resize", queueFit, { passive: true });
        addEventListener("orientationchange", () => { setTimeout(queueFit, 70); setTimeout(queueFit, 260); }, { passive: true });
        window.visualViewport?.addEventListener("resize", queueFit, { passive: true });
        sync();
    }

    if (document.readyState === "loading") addEventListener("DOMContentLoaded", boot, { once: true });
    else boot();
})();
