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

        let orientationKey = getDeviceOrientationKey();
        let baselineHeight = 0;
        let baselineWidth = 0;
        let updateQueued = false;
        let visibilityTimer = 0;
        let keyboardWasOpen = false;
        let keyboardAnimationUntil = 0;
        let selectionQueued = false;

        function getDeviceOrientationKey() {
            const screenType = window.screen?.orientation?.type;
            if (typeof screenType === "string") {
                if (screenType.startsWith("landscape")) return "landscape";
                if (screenType.startsWith("portrait")) return "portrait";
            }

            const legacyAngle = typeof window.orientation === "number"
                ? Math.abs(Number(window.orientation))
                : null;

            if (legacyAngle === 90) return "landscape";
            if (legacyAngle === 0 || legacyAngle === 180) return "portrait";

            const screenWidth = Number(window.screen?.width || 0);
            const screenHeight = Number(window.screen?.height || 0);
            if (screenWidth && screenHeight) {
                return screenWidth >= screenHeight ? "landscape" : "portrait";
            }

            // Last-resort fallback only. The branches above keep the software
            // keyboard from being mistaken for a physical orientation change.
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

        function closedViewportCandidate(viewport) {
            return {
                height: Math.max(
                    viewport.height,
                    Number(window.innerHeight || 0),
                    Number(document.documentElement.clientHeight || 0)
                ),
                width: Math.max(
                    viewport.width,
                    Number(window.innerWidth || 0),
                    Number(document.documentElement.clientWidth || 0)
                )
            };
        }

        function refreshBaseline(viewport, force = false) {
            const editableFocused = isEditableElement(document.activeElement);
            const candidate = closedViewportCandidate(viewport);

            // Never learn a new baseline from a keyboard-shrunken viewport.
            // Focus usually arrives before the keyboard animation begins, so
            // capture the closed height there and keep it stable until blur.
            if (force || !editableFocused) {
                baselineHeight = Math.max(baselineHeight, candidate.height);
                baselineWidth = Math.max(baselineWidth, candidate.width);
            }

            if (!baselineHeight) baselineHeight = candidate.height || viewport.height;
            if (!baselineWidth) baselineWidth = candidate.width || viewport.width;
        }

        function detectKeyboard(viewport) {
            if (!isEditableElement(document.activeElement)) return false;

            const heightLoss = Math.max(0, baselineHeight - viewport.height);

            // Safari browser chrome can move by a few dozen pixels. The
            // software keyboard consistently removes substantially more space.
            return heightLoss >= 110;
        }

        function applyViewportVariables() {
            const viewport = getViewport();
            const newOrientation = getDeviceOrientationKey();

            if (newOrientation !== orientationKey) {
                orientationKey = newOrientation;
                baselineHeight = 0;
                baselineWidth = 0;
                refreshBaseline(viewport, true);
            } else {
                refreshBaseline(viewport);
            }

            const keyboardOpen = detectKeyboard(viewport);
            const stableHeight = Math.max(240, Math.round(baselineHeight || viewport.height));
            const stableWidth = Math.max(280, Math.round(baselineWidth || viewport.width));
            const visibleBottom = viewport.offsetTop + viewport.height;
            const keyboardInset = keyboardOpen
                ? Math.max(0, Math.round(stableHeight - visibleBottom))
                : 0;

            const rootStyle = document.documentElement.style;

            // --nv-touch-vh is intentionally the *stable, keyboard-closed*
            // editor height. The keyboard overlays this canvas instead of
            // repeatedly resizing/reflowing the entire Writing Studio.
            rootStyle.setProperty("--nv-touch-vh", `${stableHeight}px`);
            rootStyle.setProperty("--nv-touch-vw", `${stableWidth}px`);
            rootStyle.setProperty("--nv-touch-visible-vh", `${viewport.height}px`);
            rootStyle.setProperty("--nv-touch-visible-vw", `${viewport.width}px`);
            rootStyle.setProperty("--nv-touch-vv-top", `${viewport.offsetTop}px`);
            rootStyle.setProperty("--nv-touch-vv-left", `${viewport.offsetLeft}px`);
            rootStyle.setProperty("--nv-touch-visible-bottom", `${visibleBottom}px`);
            rootStyle.setProperty("--nv-touch-keyboard", `${keyboardInset}px`);

            // The pre-existing Studio controller also writes these values on
            // visualViewport resize. Re-assert the stable canvas size here so
            // keyboard animation cannot collapse the Studio for a frame.
            rootStyle.setProperty("--nv-studio-viewport-height", `${stableHeight}px`);
            rootStyle.setProperty("--nv-studio-viewport-width", `${stableWidth}px`);

            body.classList.toggle("nv-soft-keyboard-open", keyboardOpen);

            if (keyboardOpen) {
                body.classList.remove("nv-sidebar-open", "nv-mobile-actions-open");
                if (!keyboardWasOpen) {
                    keyboardAnimationUntil = performance.now() + 650;
                    keepVisibleThroughKeyboardAnimation();
                }
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

        function getTopChromeGuard(editable, viewportTop) {
            const studio = editable.closest?.(".writing-studio-overlay, .page-studio-overlay");
            if (!studio) return viewportTop + 58;

            const candidates = [
                studio.querySelector(".writing-studio-topbar"),
                studio.querySelector(".page-studio-topbar"),
                studio.querySelector(".nv-doc-toolbar"),
                studio.querySelector(".nv-doc-findbar.open")
            ].filter(Boolean);

            let guard = viewportTop + 10;
            for (const element of candidates) {
                const rect = element.getBoundingClientRect?.();
                if (rect && Number.isFinite(rect.bottom)) {
                    guard = Math.max(guard, rect.bottom + 10);
                }
            }

            return guard;
        }

        function keepActiveVisible() {
            clearTimeout(visibilityTimer);

            const active = document.activeElement;
            if (!isEditableElement(active)) return;

            const { height, offsetTop } = getViewport();
            const viewportTop = offsetTop;
            const viewportBottom = offsetTop + height;

            const editable = active.closest?.('[contenteditable="true"]') || active;
            const topGuard = getTopChromeGuard(editable, viewportTop);
            const bottomGuard = viewportBottom - 18;
            const caretRect = getSelectionCaretRect(editable);
            const rect = caretRect || editable.getBoundingClientRect?.();

            if (!rect) return;

            let delta = 0;

            if (rect.bottom > bottomGuard) {
                delta = rect.bottom - bottomGuard + 18;
            } else if (rect.top < topGuard) {
                delta = rect.top - topGuard - 14;
            }

            if (Math.abs(delta) < 2) return;

            const scroller =
                editable.closest(".nv-doc-page-wrap") ||
                editable.closest(".page-studio-body") ||
                editable.closest(".image-placement-sidebar") ||
                editable.closest(".section-list") ||
                editable.closest(".chapter-list") ||
                editable.closest(".sidebar") ||
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

        function keepVisibleThroughKeyboardAnimation() {
            const run = () => {
                if (!isEditableElement(document.activeElement)) return;

                // Apply synchronously first, then keep the caret inside the
                // visual viewport while iOS animates keyboard/browser chrome.
                applyViewportVariables();
                keepActiveVisible();

                if (performance.now() < keyboardAnimationUntil) {
                    requestAnimationFrame(run);
                }
            };

            requestAnimationFrame(run);
        }

        function handleFocusIn(event) {
            if (!isEditableElement(event.target)) return;

            // Capture the full viewport before the keyboard has time to shrink
            // it. This is the stable canvas we keep behind the keyboard.
            const viewport = getViewport();
            const candidate = closedViewportCandidate(viewport);
            baselineHeight = Math.max(baselineHeight, candidate.height, viewport.height);
            baselineWidth = Math.max(baselineWidth, candidate.width, viewport.width);

            body.classList.remove("nv-sidebar-open", "nv-mobile-actions-open");
            applyViewportVariables();
            keyboardAnimationUntil = performance.now() + 700;
            keepVisibleThroughKeyboardAnimation();

            [80, 170, 280, 430, 650].forEach(delay => {
                window.setTimeout(() => {
                    applyViewportVariables();
                    scheduleKeepActiveVisible(0);
                }, delay);
            });
        }

        function handleFocusOut() {
            window.setTimeout(() => {
                applyViewportVariables();

                if (!isEditableElement(document.activeElement)) {
                    body.classList.remove("nv-soft-keyboard-open");
                    keyboardWasOpen = false;
                    keyboardAnimationUntil = 0;

                    const viewport = getViewport();
                    const candidate = closedViewportCandidate(viewport);
                    baselineHeight = Math.max(baselineHeight, candidate.height, viewport.height);
                    baselineWidth = Math.max(baselineWidth, candidate.width, viewport.width);

                    // iOS restores browser chrome/viewport over several frames.
                    [80, 220, 420].forEach(delay => window.setTimeout(applyViewportVariables, delay));
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
            keyboardAnimationUntil = 0;
            orientationKey = getDeviceOrientationKey();
            baselineHeight = 0;
            baselineWidth = 0;

            [0, 80, 220, 500, 800].forEach(delay => {
                window.setTimeout(() => {
                    applyViewportVariables();
                    if (isEditableElement(document.activeElement)) {
                        scheduleKeepActiveVisible(30);
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

        // Keep the caret visible as the creator types onto lower lines. This is
        // intentionally lightweight and does not mutate the rich-text DOM.
        document.addEventListener("input", event => {
            if (!body.classList.contains("nv-soft-keyboard-open")) return;
            if (!isEditableElement(event.target)) return;
            scheduleKeepActiveVisible(0);
        }, true);

        document.addEventListener("selectionchange", () => {
            if (selectionQueued || !body.classList.contains("nv-soft-keyboard-open")) return;
            if (!isEditableElement(document.activeElement)) return;

            selectionQueued = true;
            requestAnimationFrame(() => {
                selectionQueued = false;
                keepActiveVisible();
            });
        });

        window.addEventListener("resize", queueViewportUpdate, { passive: true });
        window.addEventListener("orientationchange", handleOrientationChange, { passive: true });

        if (window.visualViewport) {
            window.visualViewport.addEventListener("resize", () => {
                // Do this synchronously to win over the older Studio viewport
                // writer before Safari paints a keyboard-shrunken frame.
                applyViewportVariables();
                queueViewportUpdate();

                if (isEditableElement(document.activeElement)) {
                    scheduleKeepActiveVisible(20);
                }
            }, { passive: true });

            // Browser chrome can move the visual viewport without resizing it.
            // The editor canvas stays stable; only caret visibility coordinates
            // need refreshing.
            window.visualViewport.addEventListener("scroll", () => {
                applyViewportVariables();
                if (isEditableElement(document.activeElement)) {
                    scheduleKeepActiveVisible(0);
                }
            }, { passive: true });
        }

        // Only watch the body state. Never watch the rich-text subtree: typing
        // must not trigger a DOM watchdog or mutation/layout loop.
        const bodyObserver = new MutationObserver(queueViewportUpdate);
        bodyObserver.observe(body, {
            attributes: true,
            attributeFilter: ["class"]
        });

        applyViewportVariables();
        window.setTimeout(applyViewportVariables, 120);
        window.setTimeout(applyViewportVariables, 500);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", start, { once: true });
    } else {
        start();
    }
})();
