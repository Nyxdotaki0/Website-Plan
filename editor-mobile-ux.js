(() => {
    "use strict";

    const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches === true;
    const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");

    // Desktop/mouse layouts are intentionally left alone.
    if (!coarsePointer && !mobileUA) return;

    function start() {
        const body = document.body;
        if (!body || body.dataset.nvTouchEditorUxInstalled === "true") return;

        const supportedEditor =
            body.classList.contains("nv-world-editor-modern") ||
            body.classList.contains("nv-literature-editor-modern") ||
            body.classList.contains("nv-comic-editor-modern");

        // The overhaul scripts initialize on DOMContentLoaded as well. Their
        // listener was registered first, so the modern editor class should be
        // present now. A short retry protects against unusual script ordering.
        if (!supportedEditor) {
            window.setTimeout(start, 40);
            return;
        }

        body.dataset.nvTouchEditorUxInstalled = "true";
        body.classList.add("nv-touch-editor-ux");
        document.documentElement.classList.add("nv-touch-editor-device");

        let orientationKey = getOrientationKey();
        let baselineHeight = 0;
        let baselineWidth = 0;
        let updateQueued = false;
        let visibilityTimer = 0;
        let keyboardWasOpen = false;

        function getOrientationKey() {
            return window.innerWidth >= window.innerHeight ? "landscape" : "portrait";
        }

        function isEditableElement(element) {
            if (!(element instanceof Element)) return false;
            if (element.matches("input, textarea, select")) return !element.disabled;
            return element.isContentEditable || !!element.closest('[contenteditable="true"]');
        }

        function getViewport() {
            const vv = window.visualViewport;
            const width = Math.max(
                280,
                Math.round(vv?.width || window.innerWidth || document.documentElement.clientWidth || 0)
            );
            const height = Math.max(
                240,
                Math.round(vv?.height || window.innerHeight || document.documentElement.clientHeight || 0)
            );
            const offsetTop = Math.max(0, Math.round(vv?.offsetTop || 0));
            const offsetLeft = Math.max(0, Math.round(vv?.offsetLeft || 0));
            return { vv, width, height, offsetTop, offsetLeft };
        }

        function refreshBaseline(viewport, force = false) {
            const editableFocused = isEditableElement(document.activeElement);

            if (force || !editableFocused) {
                baselineHeight = Math.max(baselineHeight, viewport.height);
                baselineWidth = Math.max(baselineWidth, viewport.width);
            }

            if (!baselineHeight) baselineHeight = viewport.height;
            if (!baselineWidth) baselineWidth = viewport.width;
        }

        function detectKeyboard(viewport) {
            if (!isEditableElement(document.activeElement)) return false;

            const heightLoss = Math.max(
                0,
                baselineHeight - viewport.height,
                (window.innerHeight || baselineHeight) - viewport.height
            );

            // Browser chrome may move by a few dozen pixels. A keyboard is a
            // substantially larger visible-viewport reduction.
            return heightLoss >= 120;
        }

        function applyViewportVariables() {
            const viewport = getViewport();
            const newOrientation = getOrientationKey();

            if (newOrientation !== orientationKey) {
                orientationKey = newOrientation;
                baselineHeight = 0;
                baselineWidth = 0;
                refreshBaseline(viewport, true);
            } else {
                refreshBaseline(viewport);
            }

            const keyboardOpen = detectKeyboard(viewport);
            const keyboardHeight = keyboardOpen
                ? Math.max(0, Math.round(baselineHeight - viewport.height))
                : 0;

            const rootStyle = document.documentElement.style;
            rootStyle.setProperty("--nv-touch-vh", `${viewport.height}px`);
            rootStyle.setProperty("--nv-touch-vw", `${viewport.width}px`);
            rootStyle.setProperty("--nv-touch-vv-top", `${viewport.offsetTop}px`);
            rootStyle.setProperty("--nv-touch-vv-left", `${viewport.offsetLeft}px`);
            rootStyle.setProperty("--nv-touch-keyboard", `${keyboardHeight}px`);

            // Keep the pre-existing Studio workspace controller and this
            // keyboard-safe viewport layer using identical measurements.
            rootStyle.setProperty("--nv-studio-viewport-height", `${viewport.height}px`);
            rootStyle.setProperty("--nv-studio-viewport-width", `${viewport.width}px`);

            body.classList.toggle("nv-soft-keyboard-open", keyboardOpen);

            if (keyboardOpen) {
                body.classList.remove("nv-sidebar-open", "nv-mobile-actions-open");
                if (!keyboardWasOpen) scheduleKeepActiveVisible(90);
            }

            keyboardWasOpen = keyboardOpen;
        }

        function queueViewportUpdate() {
            if (updateQueued) return;
            updateQueued = true;

            requestAnimationFrame(() => {
                updateQueued = false;
                applyViewportVariables();
            });
        }

        function getSelectionCaretRect(active) {
            if (!active?.isContentEditable && !active?.closest?.('[contenteditable="true"]')) {
                return null;
            }

            const selection = window.getSelection?.();
            if (!selection || selection.rangeCount < 1) return null;

            try {
                const range = selection.getRangeAt(0).cloneRange();
                range.collapse(false);
                const rect = range.getBoundingClientRect();

                if (!rect || (!rect.width && !rect.height && !rect.top && !rect.bottom)) {
                    return null;
                }

                return rect;
            } catch {
                return null;
            }
        }

        function keepActiveVisible() {
            clearTimeout(visibilityTimer);

            const active = document.activeElement;
            if (!isEditableElement(active)) return;

            const { height, offsetTop } = getViewport();
            const viewportTop = offsetTop;
            const viewportBottom = offsetTop + height;
            const topGuard = viewportTop + 64;
            const bottomGuard = viewportBottom - 22;

            const editable = active.closest?.('[contenteditable="true"]') || active;
            const caretRect = getSelectionCaretRect(editable);
            const rect = caretRect || editable.getBoundingClientRect?.();

            if (!rect) return;

            let delta = 0;

            if (rect.bottom > bottomGuard) {
                delta = rect.bottom - bottomGuard + 16;
            } else if (rect.top < topGuard) {
                delta = rect.top - topGuard - 12;
            }

            if (Math.abs(delta) < 2) return;

            const scroller =
                editable.closest(".nv-doc-page-wrap") ||
                editable.closest(".page-studio-body") ||
                editable.closest(".image-placement-sidebar") ||
                editable.closest(".main");

            if (scroller && scroller !== document.body) {
                scroller.scrollBy({ top: delta, behavior: "auto" });
                return;
            }

            editable.scrollIntoView?.({
                block: "center",
                inline: "nearest",
                behavior: "auto"
            });
        }

        function scheduleKeepActiveVisible(delay = 70) {
            clearTimeout(visibilityTimer);
            visibilityTimer = window.setTimeout(() => {
                requestAnimationFrame(keepActiveVisible);
            }, delay);
        }

        function handleFocusIn(event) {
            if (!isEditableElement(event.target)) return;

            body.classList.remove("nv-sidebar-open", "nv-mobile-actions-open");
            queueViewportUpdate();
            scheduleKeepActiveVisible(120);

            // iOS commonly reports keyboard geometry over more than one frame.
            window.setTimeout(queueViewportUpdate, 180);
            window.setTimeout(() => scheduleKeepActiveVisible(40), 260);
        }

        function handleFocusOut() {
            window.setTimeout(() => {
                queueViewportUpdate();

                if (!isEditableElement(document.activeElement)) {
                    body.classList.remove("nv-soft-keyboard-open");
                    keyboardWasOpen = false;

                    const viewport = getViewport();
                    baselineHeight = Math.max(baselineHeight, viewport.height);
                }
            }, 90);
        }

        function handleOrientationChange() {
            body.classList.remove(
                "nv-sidebar-open",
                "nv-mobile-actions-open",
                "nv-soft-keyboard-open"
            );

            keyboardWasOpen = false;
            orientationKey = getOrientationKey();
            baselineHeight = 0;
            baselineWidth = 0;

            [0, 80, 220, 500].forEach(delay => {
                window.setTimeout(() => {
                    queueViewportUpdate();
                    if (isEditableElement(document.activeElement)) {
                        scheduleKeepActiveVisible(50);
                    }
                }, delay);
            });
        }

        // Close transient editor chrome before entering a focused Studio.
        // Existing editor functions continue owning Studio lifecycle/data.
        document.addEventListener("click", event => {
            if (!(event.target instanceof Element)) return;

            const studioLaunch = event.target.closest(
                '[onclick*="openWritingStudio"],' +
                '[onclick*="openPageStudio"],' +
                '[onclick*="openImagePlacementStudio"]'
            );

            if (studioLaunch) {
                body.classList.remove("nv-sidebar-open", "nv-mobile-actions-open");
                queueViewportUpdate();
            }
        }, true);

        document.addEventListener("focusin", handleFocusIn, true);
        document.addEventListener("focusout", handleFocusOut, true);

        window.addEventListener("resize", queueViewportUpdate, { passive: true });
        window.addEventListener("orientationchange", handleOrientationChange, { passive: true });

        if (window.visualViewport) {
            window.visualViewport.addEventListener("resize", () => {
                queueViewportUpdate();

                if (isEditableElement(document.activeElement)) {
                    scheduleKeepActiveVisible(110);
                }
            }, { passive: true });

            // Browser chrome can move the visual viewport without resizing it.
            // Update coordinates but never force-scroll while the creator pans.
            window.visualViewport.addEventListener("scroll", queueViewportUpdate, { passive: true });
        }

        // Only watch the body state. Never watch the rich-text subtree: typing
        // must not trigger a DOM watchdog or mutation/layout loop.
        const bodyObserver = new MutationObserver(queueViewportUpdate);
        bodyObserver.observe(body, {
            attributes: true,
            attributeFilter: ["class"]
        });

        applyViewportVariables();
        window.setTimeout(queueViewportUpdate, 120);
        window.setTimeout(queueViewportUpdate, 500);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
