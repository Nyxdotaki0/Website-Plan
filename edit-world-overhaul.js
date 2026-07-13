(() => {
    "use strict";

    const GUIDE_KEY = "nullverse-world-editor-guide-v3-seen";
    const COLLAPSE_KEY = "nullverse-world-editor-collapsed-v3";
    const MOBILE_BREAKPOINT = 900;

    const state = {
        dirty: false,
        saving: false,
        view: "overview",
        contextObserver: null,
        sectionObserver: null,
        activePanelObserver: null,
        guideIndex: 0,
        decoratedGeneration: 0,
        collapsed: readJson(COLLAPSE_KEY, {})
    };

    const guideSteps = [
        {
            label: "Start",
            title: "Your world has three simple layers",
            text: "World Studio is organized around World Setup, Appearance, and Sections. You can move between them without losing work, then use the permanent Draft, Preview, and Publish controls whenever you are ready.",
            checks: [
                "World Setup controls identity, discovery, privacy, content warnings, the public index, and overview-card design.",
                "Appearance controls the page atmosphere, background artwork, gradients, blur, overlays, and placement.",
                "Sections hold the actual lore, characters, timelines, locations, languages, and other worldbuilding entries."
            ],
            actionLabel: "Open World Setup",
            action: () => callGlobal("openOverviewSettings")
        },
        {
            label: "Setup",
            title: "Build the public identity first",
            text: "World Setup is now presented as a sequence of focused cards. Use the sticky row beneath the command bar to jump directly to Identity, Publishing, Warnings, World Index, or the Overview Card instead of scrolling through one long form.",
            checks: [
                "Title, cover, summary, genres, and themes power discovery and the public page.",
                "Visibility and community-addition controls keep the same behavior as before.",
                "Image credits and placement stay attached to the image they describe."
            ],
            actionLabel: "Go to World Setup",
            action: () => callGlobal("openOverviewSettings")
        },
        {
            label: "Design",
            title: "Appearance is a separate design workspace",
            text: "Background styling is intentionally separated from identity settings. This keeps creative decisions together and makes the live previews easier to understand on desktop, tablet, and phone.",
            checks: [
                "Choose solid or gradient atmosphere settings.",
                "Upload and position background artwork with the existing placement controls.",
                "Preview blur, opacity, zoom, position, repeat, and overlay without changing the saved schema."
            ],
            actionLabel: "Open Appearance",
            action: () => callGlobal("openAppearanceSettings")
        },
        {
            label: "Sections",
            title: "The outline is your world map",
            text: "The left outline contains every section and stays searchable. On mobile it becomes a drawer, so it no longer consumes the page or pushes the editor below the screen.",
            checks: [
                "Press a section to open its workspace.",
                "Use Quick Reorder only when you need precise numbered movement or swaps.",
                "The Add Section action remains permanently available at the bottom of the outline."
            ],
            actionLabel: "Open Outline",
            action: () => openSidebar()
        },
        {
            label: "Write",
            title: "Section editing is split by task",
            text: "Each section keeps the same details, Writing Studio, section image, card artwork, card design, credits, and saving logic. The new local navigation lets you jump between those tasks and collapse anything you are not using.",
            checks: [
                "Section Details controls type and title.",
                "Writing Studio keeps the complete rich-text toolset and formatting data used by world.html.",
                "Images and card design stay separate so their placement and credits are easier to verify."
            ],
            actionLabel: "Open First Section",
            action: () => openFirstSection()
        },
        {
            label: "Media",
            title: "Images, framing, and credits stay connected",
            text: "Every existing image workflow is preserved. The redesign only groups the upload, placement, preview, and credit controls more clearly so you can finish one asset before moving to the next.",
            checks: [
                "Cover, background, index, overview card, section image, and section card keep their existing storage and credit rules.",
                "Placement data still saves through the same X/Y, scale, fit, and rotation structures.",
                "Nothing about the public world renderer or credit pills was changed."
            ],
            actionLabel: "View Current Media Tools",
            action: () => jumpToPanel(/image|artwork|card appearance/i)
        },
        {
            label: "Finish",
            title: "Draft, Preview, and Publish are always close",
            text: "Saving is now easier to understand without changing what the buttons do. Draft remains private, Preview opens the existing preview flow, and Save & Publish updates the live world through the same functions and tables as before.",
            checks: [
                "Unsaved status appears as soon as you change a field.",
                "Mobile actions stay reachable above the safe area.",
                "The public World page continues reading the exact same world and world_sections fields."
            ],
            actionLabel: "Close Guide",
            action: () => closeGuide(true)
        }
    ];

    function readJson(key, fallback) {
        try {
            const value = JSON.parse(localStorage.getItem(key) || "null");
            return value && typeof value === "object" ? value : fallback;
        } catch {
            return fallback;
        }
    }

    function writeJson(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {
        }
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function callGlobal(name, ...args) {
        const fn = window[name];
        if (typeof fn !== "function") return undefined;
        return fn(...args);
    }

    function init() {
        const sidebar = document.querySelector(".sidebar");
        const main = document.querySelector(".main");
        const topbar = document.querySelector(".topbar");
        const editorContent = document.getElementById("editor-content");

        if (!sidebar || !main || !topbar || !editorContent) return;

        document.body.classList.add("nv-world-editor-modern");
        document.body.dataset.nvView = "overview";

        buildSidebar(sidebar);
        buildCommandBar(topbar);
        buildMobileDock();
        buildGuide();
        buildGuidePrompt();
        installSaveState();
        installInputTracking(editorContent);
        installEditorMutationObserver(editorContent);
        installSectionListObserver();
        installGlobalNavigationWrappers();
        clearLegacyTutorialState();

        window.addEventListener("resize", handleResize, { passive: true });
        window.addEventListener("keydown", handleGlobalKeydown);
        window.addEventListener("beforeunload", event => {
            if (!state.dirty) return;
            event.preventDefault();
            event.returnValue = "";
        });

        setTimeout(() => {
            decorateCurrentEditor();
            decorateSectionCards();
            updateSectionProgress();
            maybeShowGuidePrompt();
        }, 0);
    }

    function buildSidebar(sidebar) {
        const header = sidebar.querySelector(".sidebar-header");
        const sectionList = sidebar.querySelector(".section-list");
        const overview = document.getElementById("overview-card");
        const appearance = document.getElementById("appearance-card");
        const dynamicList = document.getElementById("section-list");
        const reorder = sidebar.querySelector(".reorder-panel");

        const topLine = document.createElement("div");
        topLine.className = "nv-world-rail-topline";
        topLine.innerHTML = `
            <div class="nv-world-rail-brand">World Studio</div>
            <button class="nv-world-rail-close" type="button" aria-label="Close outline">×</button>
        `;
        header?.prepend(topLine);
        topLine.querySelector("button")?.addEventListener("click", closeSidebar);

        const progress = document.createElement("div");
        progress.className = "nv-world-rail-progress";
        progress.innerHTML = `
            <strong>World structure</strong>
            <span id="nv-world-progress-label">Loading sections</span>
            <div class="nv-world-progress-track"><i id="nv-world-progress-bar"></i></div>
        `;
        header?.append(progress);

        if (overview) {
            overview.dataset.nvIcon = "W";
            const strong = overview.querySelector("strong");
            const p = overview.querySelector("p");
            if (strong) strong.textContent = "World Setup";
            if (p) p.textContent = "Identity, publishing, index";
        }

        if (appearance) {
            appearance.dataset.nvIcon = "✦";
            const strong = appearance.querySelector("strong");
            const p = appearance.querySelector("p");
            if (strong) strong.textContent = "Design & Atmosphere";
            if (p) p.textContent = "Background, color, artwork";
        }

        if (sectionList && reorder) {
            const heading = document.createElement("div");
            heading.className = "nv-world-rail-heading";
            heading.innerHTML = `<span>World controls</span>`;
            sectionList.insertBefore(heading, reorder);

            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "nv-world-reorder-toggle";
            toggle.innerHTML = `<span>Quick Reorder</span><span aria-hidden="true">⌄</span>`;
            toggle.addEventListener("click", () => reorder.classList.toggle("nv-open"));
            reorder.prepend(toggle);

            const oldTitle = reorder.querySelector(".reorder-title");
            if (oldTitle) oldTitle.style.display = "none";
        }

        if (sectionList && dynamicList) {
            const heading = document.createElement("div");
            heading.className = "nv-world-rail-heading";
            heading.innerHTML = `
                <span>Your sections</span>
                <span class="nv-world-section-count" id="nv-world-section-count">0</span>
            `;
            sectionList.insertBefore(heading, dynamicList);
        }

        const backdrop = document.createElement("button");
        backdrop.type = "button";
        backdrop.className = "nv-world-sidebar-backdrop";
        backdrop.setAttribute("aria-label", "Close world outline");
        backdrop.addEventListener("click", closeSidebar);
        document.body.append(backdrop);
    }

    function buildCommandBar(topbar) {
        const titleBlock = topbar.firstElementChild;
        const actions = topbar.querySelector(".topbar-actions");
        const saveArea = document.getElementById("tutorial-save-area");
        const tutorialButton = document.getElementById("tutorial-button");

        const outlineButton = document.createElement("button");
        outlineButton.type = "button";
        outlineButton.className = "nv-world-mobile-outline";
        outlineButton.setAttribute("aria-label", "Open world outline");
        outlineButton.textContent = "☰";
        outlineButton.addEventListener("click", toggleSidebar);
        topbar.prepend(outlineButton);

        if (titleBlock) {
            titleBlock.classList.add("nv-world-title-stack");
            const children = [...titleBlock.childNodes];
            const icon = document.createElement("div");
            icon.className = "nv-world-title-icon";
            icon.innerHTML = "✦";
            const copy = document.createElement("div");
            copy.style.minWidth = "0";
            children.forEach(child => copy.append(child));
            titleBlock.append(icon, copy);
        }

        const moreButton = document.createElement("button");
        moreButton.type = "button";
        moreButton.className = "nv-world-mobile-more";
        moreButton.setAttribute("aria-label", "More editor actions");
        moreButton.textContent = "•••";
        moreButton.addEventListener("click", () => {
            document.body.classList.toggle("nv-mobile-actions-open");
        });
        topbar.append(moreButton);

        tutorialButton?.setAttribute("title", "Open the World Studio guide");
        if (tutorialButton) tutorialButton.textContent = "? Guide";

        if (saveArea) {
            const saveState = document.createElement("span");
            saveState.id = "nv-world-save-state";
            saveState.className = "nv-world-save-state nv-saved";
            saveState.textContent = "Up to date";
            const saveGroup = saveArea.querySelector(".nv-save-button-group");
            saveGroup?.after(saveState);
        }

        document.addEventListener("pointerdown", event => {
            if (!document.body.classList.contains("nv-mobile-actions-open")) return;
            if (event.target.closest(".topbar-actions") || event.target.closest(".nv-world-mobile-more")) return;
            document.body.classList.remove("nv-mobile-actions-open");
        });

        actions?.querySelectorAll("a,button").forEach(item => {
            item.addEventListener("click", () => document.body.classList.remove("nv-mobile-actions-open"));
        });
    }

    function buildMobileDock() {
        const dock = document.createElement("nav");
        dock.className = "nv-world-mobile-dock";
        dock.setAttribute("aria-label", "World editor actions");
        dock.innerHTML = `
            <button type="button" data-nv-mobile-outline>Outline</button>
            <button type="button" data-nv-mobile-preview>Preview</button>
            <button type="button" data-nv-mobile-draft>Save Draft</button>
            <button type="button" data-nv-mobile-publish>Publish</button>
        `;
        dock.querySelector("[data-nv-mobile-outline]")?.addEventListener("click", openSidebar);
        dock.querySelector("[data-nv-mobile-preview]")?.addEventListener("click", () => callGlobal("openPreviewPage"));
        dock.querySelector("[data-nv-mobile-draft]")?.addEventListener("click", () => callGlobal("saveDraft"));
        dock.querySelector("[data-nv-mobile-publish]")?.addEventListener("click", () => callGlobal("saveAndPublish"));
        document.body.append(dock);
    }

    function installEditorMutationObserver(editorContent) {
        state.contextObserver = new MutationObserver(() => scheduleDecorate());
        state.contextObserver.observe(editorContent, { childList: true, subtree: true });
    }

    let decorateFrame = 0;
    function scheduleDecorate() {
        cancelAnimationFrame(decorateFrame);
        decorateFrame = requestAnimationFrame(decorateCurrentEditor);
    }

    function detectView() {
        if (document.getElementById("tutorial-world-appearance-area")) return "appearance";
        if (document.getElementById("tutorial-section-workspace-area")) return "section";
        return "overview";
    }

    function collectPanels(view) {
        const root = document.getElementById("editor-content");
        if (!root) return [];

        if (view === "overview" || view === "appearance") {
            const shell = root.querySelector(".settings-panel-v2");
            return shell
                ? [...shell.children].filter(node => node.classList?.contains("settings-section-v2"))
                : [];
        }

        const shell = root.querySelector(".section-editor-v2");
        if (!shell) return [];

        const panels = [];
        [...shell.children].forEach(node => {
            if (
                node.classList?.contains("section-tool-card") ||
                node.classList?.contains("writing-studio-card-v2") ||
                node.classList?.contains("section-save-row-v2")
            ) {
                panels.push(node);
            }
            if (node.classList?.contains("section-main-grid-v2")) {
                [...node.children].forEach(child => {
                    if (child.classList?.contains("section-tool-card")) panels.push(child);
                });
            }
        });
        return panels;
    }

    function panelLabel(panel, index) {
        const heading = panel.querySelector(":scope > h2, :scope > h3, :scope > .nv-world-panel-heading h2, :scope > .nv-world-panel-heading h3");
        const text = heading?.textContent?.trim();
        if (text) return text;
        if (panel.classList.contains("section-save-row-v2")) return "Save Section";
        return `Step ${index + 1}`;
    }

    function decorateCurrentEditor() {
        const root = document.getElementById("editor-content");
        if (!root || !root.firstElementChild) return;

        state.contextObserver?.disconnect();

        try {
            state.view = detectView();
            document.body.dataset.nvView = state.view;
            closeSidebar();

            root.querySelectorAll(":scope > .nv-world-context-bar").forEach(node => node.remove());

            const panels = collectPanels(state.view);
            const generation = ++state.decoratedGeneration;
            panels.forEach((panel, index) => decoratePanel(panel, index, generation));
            buildContextBar(root, panels);
            updateEditorTitle();
            updateSectionProgress();
            installActivePanelTracking(panels);
        } finally {
            state.contextObserver?.observe(root, { childList: true, subtree: true });
        }
    }

    function decoratePanel(panel, index, generation) {
        if (!panel.id) panel.id = `nv-world-${state.view}-panel-${index + 1}`;
        panel.dataset.nvModernGeneration = String(generation);
        panel.classList.add("nv-world-collapsible");

        let badge = panel.querySelector(":scope > .nv-world-step-badge");
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "nv-world-step-badge";
            panel.prepend(badge);
        }
        badge.textContent = state.view === "section" ? `Section task ${index + 1}` : `Step ${index + 1}`;

        let headingWrap = panel.querySelector(":scope > .nv-world-panel-heading");
        if (!headingWrap) {
            const heading = panel.querySelector(":scope > h2, :scope > h3");
            if (heading) {
                headingWrap = document.createElement("div");
                headingWrap.className = "nv-world-panel-heading";
                heading.before(headingWrap);
                headingWrap.append(heading);

                const toggle = document.createElement("button");
                toggle.type = "button";
                toggle.className = "nv-world-panel-toggle";
                toggle.setAttribute("aria-label", "Collapse this editor section");
                toggle.textContent = "⌄";
                toggle.addEventListener("click", () => togglePanel(panel));
                headingWrap.append(toggle);
            }
        }

        const key = collapseKey(panel);
        panel.classList.toggle("nv-collapsed", state.collapsed[key] === true);
    }

    function collapseKey(panel) {
        return `${state.view}:${panel.id}`;
    }

    function togglePanel(panel, force) {
        const collapsed = typeof force === "boolean" ? force : !panel.classList.contains("nv-collapsed");
        panel.classList.toggle("nv-collapsed", collapsed);
        state.collapsed[collapseKey(panel)] = collapsed;
        writeJson(COLLAPSE_KEY, state.collapsed);
    }

    function buildContextBar(root, panels) {
        if (!panels.length) return;
        const bar = document.createElement("div");
        bar.className = "nv-world-context-bar";
        bar.innerHTML = `
            <div class="nv-world-context-links"></div>
            <div class="nv-world-context-actions">
                <button type="button" data-nv-expand-all>Expand all</button>
                <button type="button" data-nv-collapse-all>Collapse all</button>
            </div>
        `;

        const links = bar.querySelector(".nv-world-context-links");
        panels.forEach((panel, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "nv-world-context-link";
            button.dataset.nvTarget = panel.id;
            button.innerHTML = `<span>${index + 1}</span>${escapeHtml(panelLabel(panel, index))}`;
            button.addEventListener("click", () => {
                togglePanel(panel, false);
                panel.scrollIntoView({ behavior: "smooth", block: "start" });
            });
            links?.append(button);
        });

        bar.querySelector("[data-nv-expand-all]")?.addEventListener("click", () => panels.forEach(panel => togglePanel(panel, false)));
        bar.querySelector("[data-nv-collapse-all]")?.addEventListener("click", () => panels.forEach(panel => togglePanel(panel, true)));
        root.prepend(bar);
    }

    function installActivePanelTracking(panels) {
        state.activePanelObserver?.disconnect();
        const main = document.querySelector(".main");
        if (!main || !panels.length || !("IntersectionObserver" in window)) return;

        state.activePanelObserver = new IntersectionObserver(entries => {
            const visible = entries
                .filter(entry => entry.isIntersecting)
                .sort((a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top));
            if (!visible.length) return;
            setActiveContextLink(visible[0].target.id);
        }, {
            root: main,
            rootMargin: `-${Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nve-bar")) || 78) + 58}px 0px -60% 0px`,
            threshold: [0, .1, .4]
        });
        panels.forEach(panel => state.activePanelObserver.observe(panel));
    }

    function setActiveContextLink(id) {
        document.querySelectorAll(".nv-world-context-link").forEach(button => {
            button.classList.toggle("active", button.dataset.nvTarget === id);
        });
    }

    function updateEditorTitle() {
        const title = document.getElementById("editor-title");
        if (!title) return;
        const worldName = document.getElementById("world-name")?.textContent?.trim() || "World";
        const sectionHeading = document.querySelector("#tutorial-section-workspace-area h2")?.textContent?.trim();
        if (state.view === "appearance") title.textContent = `${worldName} · Appearance`;
        else if (state.view === "section" && sectionHeading) title.textContent = sectionHeading;
        else title.textContent = `${worldName} · Setup`;
    }

    function installSectionListObserver() {
        const list = document.getElementById("section-list");
        if (!list) return;
        state.sectionObserver = new MutationObserver(() => {
            decorateSectionCards();
            updateSectionProgress();
        });
        state.sectionObserver.observe(list, { childList: true, subtree: true });
    }

    function decorateSectionCards() {
        const list = document.getElementById("section-list");
        if (!list) return;
        [...list.querySelectorAll(".section-card")].forEach((card, index) => {
            card.dataset.nvIcon = String(index + 1);
            card.setAttribute("role", "button");
            card.setAttribute("tabindex", "0");
            if (!card.dataset.nvKeyboardBound) {
                card.dataset.nvKeyboardBound = "true";
                card.addEventListener("keydown", event => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    card.click();
                });
            }
        });
    }

    function updateSectionProgress() {
        const count = document.querySelectorAll("#section-list .section-card").length;
        const countNode = document.getElementById("nv-world-section-count");
        const label = document.getElementById("nv-world-progress-label");
        const bar = document.getElementById("nv-world-progress-bar");
        if (countNode) countNode.textContent = String(count);
        if (label) label.textContent = `${count} ${count === 1 ? "section" : "sections"}`;
        if (bar) {
            const progress = Math.min(96, 34 + count * 8);
            bar.style.setProperty("--nve-progress", `${progress}%`);
        }
    }

    function installInputTracking(root) {
        const mark = event => {
            if (!event.target.closest("#editor-content, .writing-studio-overlay, .image-placement-overlay")) return;
            setDirty(true);
        };
        document.addEventListener("input", mark, true);
        document.addEventListener("change", mark, true);
        root.addEventListener("click", event => {
            if (event.target.closest(".warning-choice, .theme-color, .gradient-direction, .gradient-strength, .style-choice")) {
                setDirty(true);
            }
        });
    }

    function installSaveState() {
        const names = [
            "saveDraft",
            "saveAndPublish",
            "saveOverviewOnly",
            "saveAppearanceSettings",
            "saveCurrentSection"
        ];
        names.forEach(name => wrapSaveAction(name));
    }

    function wrapSaveAction(name) {
        const original = window[name];
        if (typeof original !== "function" || original.__nvModernWrapped) return;
        const wrapped = async function (...args) {
            setSaving(true, name === "saveAndPublish" ? "Publishing…" : "Saving…");
            try {
                const result = await original.apply(this, args);
                if (result !== false) setDirty(false, name === "saveAndPublish" ? "Published" : "Saved");
                else setSaving(false, "Needs attention");
                return result;
            } catch (error) {
                setSaving(false, "Save failed");
                throw error;
            }
        };
        wrapped.__nvModernWrapped = true;
        wrapped.__nvModernOriginal = original;
        window[name] = wrapped;
    }

    function setDirty(dirty, text) {
        state.dirty = dirty;
        state.saving = false;
        const node = document.getElementById("nv-world-save-state");
        if (!node) return;
        node.classList.remove("nv-dirty", "nv-saving", "nv-saved");
        node.classList.add(dirty ? "nv-dirty" : "nv-saved");
        node.textContent = text || (dirty ? "Unsaved changes" : "Up to date");
    }

    function setSaving(saving, text) {
        state.saving = saving;
        const node = document.getElementById("nv-world-save-state");
        if (!node) return;
        node.classList.remove("nv-dirty", "nv-saving", "nv-saved");
        node.classList.add(saving ? "nv-saving" : (state.dirty ? "nv-dirty" : "nv-saved"));
        node.textContent = text || (saving ? "Saving…" : (state.dirty ? "Unsaved changes" : "Up to date"));
    }

    function installGlobalNavigationWrappers() {
        ["openOverviewSettings", "openAppearanceSettings", "openSection"].forEach(name => {
            const original = window[name];
            if (typeof original !== "function" || original.__nvModernNavigationWrapped) return;
            const wrapped = function (...args) {
                const value = original.apply(this, args);
                closeSidebar();
                requestAnimationFrame(scheduleDecorate);
                return value;
            };
            wrapped.__nvModernNavigationWrapped = true;
            window[name] = wrapped;
        });

        const oldStart = window.startWorldTutorial;
        window.startWorldTutorial = function () {
            openGuide(0);
        };
        window.startWorldTutorial.__nvLegacy = oldStart;

        window.acceptWorldTutorialPrompt = function () {
            clearLegacyTutorialState();
            openGuide(0);
        };

        window.skipWorldTutorialPrompt = function () {
            clearLegacyTutorialState();
            localStorage.setItem(GUIDE_KEY, "true");
        };
    }

    function buildGuide() {
        const overlay = document.createElement("div");
        overlay.className = "nv-world-guide-overlay";
        overlay.id = "nv-world-guide-overlay";
        overlay.setAttribute("aria-hidden", "true");
        overlay.innerHTML = `
            <section class="nv-world-guide" role="dialog" aria-modal="true" aria-labelledby="nv-world-guide-title">
                <aside class="nv-world-guide-steps">
                    <strong>Studio guide</strong>
                    ${guideSteps.map((step, index) => `
                        <button type="button" class="nv-world-guide-step" data-nv-guide-step="${index}">
                            <i>${index + 1}</i><span>${escapeHtml(step.label)}</span>
                        </button>
                    `).join("")}
                </aside>
                <div class="nv-world-guide-content">
                    <header class="nv-world-guide-top">
                        <div>
                            <p id="nv-world-guide-kicker"></p>
                            <h2 id="nv-world-guide-title"></h2>
                        </div>
                        <button class="nv-world-guide-close" type="button" aria-label="Close guide">×</button>
                    </header>
                    <div class="nv-world-guide-body">
                        <p id="nv-world-guide-text"></p>
                        <div id="nv-world-guide-checklist" class="nv-world-guide-checklist"></div>
                    </div>
                    <footer class="nv-world-guide-footer">
                        <button type="button" data-nv-guide-action class="primary"></button>
                        <div>
                            <button type="button" data-nv-guide-previous>← Previous</button>
                            <button type="button" data-nv-guide-next>Next →</button>
                        </div>
                    </footer>
                </div>
            </section>
        `;
        document.body.append(overlay);

        overlay.querySelector(".nv-world-guide-close")?.addEventListener("click", () => closeGuide(false));
        overlay.querySelector("[data-nv-guide-previous]")?.addEventListener("click", () => showGuideStep(state.guideIndex - 1));
        overlay.querySelector("[data-nv-guide-next]")?.addEventListener("click", () => {
            if (state.guideIndex >= guideSteps.length - 1) closeGuide(true);
            else showGuideStep(state.guideIndex + 1);
        });
        overlay.querySelector("[data-nv-guide-action]")?.addEventListener("click", () => {
            const step = guideSteps[state.guideIndex];
            step?.action?.();
        });
        overlay.querySelectorAll("[data-nv-guide-step]").forEach(button => {
            button.addEventListener("click", () => showGuideStep(Number(button.dataset.nvGuideStep) || 0));
        });
        overlay.addEventListener("pointerdown", event => {
            if (event.target === overlay) closeGuide(false);
        });
    }

    function buildGuidePrompt() {
        const prompt = document.createElement("aside");
        prompt.id = "nv-world-guide-prompt";
        prompt.className = "nv-world-guide-prompt";
        prompt.innerHTML = `
            <div><strong>World Studio has a new workflow</strong><span>Take a stable 2-minute tour—no moving spotlight.</span></div>
            <button type="button" data-nv-guide-later>Later</button>
            <button type="button" data-nv-guide-start>Start guide</button>
        `;
        prompt.querySelector("[data-nv-guide-later]")?.addEventListener("click", dismissGuidePrompt);
        prompt.querySelector("[data-nv-guide-start]")?.addEventListener("click", () => {
            dismissGuidePrompt();
            openGuide(0);
        });
        document.body.append(prompt);
    }

    function maybeShowGuidePrompt() {
        clearLegacyTutorialState();
        if (localStorage.getItem(GUIDE_KEY) === "true") return;
        const prompt = document.getElementById("nv-world-guide-prompt");
        setTimeout(() => prompt?.classList.add("open"), 650);
    }

    function dismissGuidePrompt() {
        document.getElementById("nv-world-guide-prompt")?.classList.remove("open");
        localStorage.setItem(GUIDE_KEY, "true");
    }

    function openGuide(index = 0) {
        clearLegacyTutorialState();
        dismissGuidePrompt();
        const overlay = document.getElementById("nv-world-guide-overlay");
        overlay?.classList.add("open");
        overlay?.setAttribute("aria-hidden", "false");
        document.body.classList.add("nv-guide-open");
        showGuideStep(index);
    }

    function closeGuide(completed) {
        const overlay = document.getElementById("nv-world-guide-overlay");
        overlay?.classList.remove("open");
        overlay?.setAttribute("aria-hidden", "true");
        document.body.classList.remove("nv-guide-open");
        if (completed) localStorage.setItem(GUIDE_KEY, "true");
    }

    function showGuideStep(index) {
        state.guideIndex = Math.max(0, Math.min(guideSteps.length - 1, index));
        const step = guideSteps[state.guideIndex];
        const overlay = document.getElementById("nv-world-guide-overlay");
        if (!overlay || !step) return;

        overlay.querySelector("#nv-world-guide-kicker").textContent = `Step ${state.guideIndex + 1} of ${guideSteps.length} · ${step.label}`;
        overlay.querySelector("#nv-world-guide-title").textContent = step.title;
        overlay.querySelector("#nv-world-guide-text").textContent = step.text;
        overlay.querySelector("#nv-world-guide-checklist").innerHTML = step.checks.map((check, index) => `
            <div class="nv-world-guide-check"><i>${index + 1}</i><span>${escapeHtml(check)}</span></div>
        `).join("");
        overlay.querySelector("[data-nv-guide-action]").textContent = step.actionLabel;
        overlay.querySelector("[data-nv-guide-previous]").disabled = state.guideIndex === 0;
        overlay.querySelector("[data-nv-guide-next]").textContent = state.guideIndex === guideSteps.length - 1 ? "Finish" : "Next →";
        overlay.querySelectorAll("[data-nv-guide-step]").forEach(button => {
            button.classList.toggle("active", Number(button.dataset.nvGuideStep) === state.guideIndex);
        });
    }

    function clearLegacyTutorialState() {
        document.body.classList.remove("tutorial-active");
        ["tutorial-overlay", "tutorial-welcome-overlay"].forEach(id => {
            const node = document.getElementById(id);
            node?.classList.remove("open");
            node?.setAttribute("aria-hidden", "true");
        });
        document.querySelectorAll(".tutorial-target-lift").forEach(node => node.classList.remove("tutorial-target-lift"));
    }

    function openFirstSection() {
        const first = document.querySelector("#section-list .section-card");
        if (!first) {
            closeGuide(false);
            openSidebar();
            return;
        }
        closeGuide(false);
        first.click();
        setTimeout(() => {
            document.querySelector("#tutorial-writing-studio-card-area")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 180);
    }

    function jumpToPanel(pattern) {
        closeGuide(false);
        const panels = collectPanels(detectView());
        const target = panels.find((panel, index) => pattern.test(panelLabel(panel, index)));
        if (target) {
            togglePanel(target, false);
            target.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }
        if (detectView() === "overview") callGlobal("openAppearanceSettings");
    }

    function openSidebar() {
        document.body.classList.add("nv-sidebar-open");
    }

    function closeSidebar() {
        document.body.classList.remove("nv-sidebar-open");
    }

    function toggleSidebar() {
        document.body.classList.toggle("nv-sidebar-open");
    }

    function handleResize() {
        if (window.innerWidth > MOBILE_BREAKPOINT) {
            closeSidebar();
            document.body.classList.remove("nv-mobile-actions-open");
        }
    }

    function handleGlobalKeydown(event) {
        if (event.key === "Escape") {
            if (document.body.classList.contains("nv-guide-open")) closeGuide(false);
            else if (document.body.classList.contains("nv-sidebar-open")) closeSidebar();
            else document.body.classList.remove("nv-mobile-actions-open");
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
            event.preventDefault();
            callGlobal("saveDraft");
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
        init();
    }
})();
// JavaScript source code
