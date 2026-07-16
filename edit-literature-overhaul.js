(() => {
    "use strict";

    const GUIDE_KEY = "nullverse-literature-editor-guide-v1-seen";
    const COLLAPSE_KEY = "nullverse-literature-editor-collapsed-v1";
    const MOBILE_BREAKPOINT = 900;

    const state = {
        dirty: false,
        saving: false,
        view: "overview",
        guideIndex: 0,
        guideReturnFocus: null,
        collapsed: readJson(COLLAPSE_KEY, {}),
        contentObserver: null,
        chapterObserver: null,
        activePanelObserver: null,
        generation: 0
    };

    const guideSteps = [
        {
            label: "Start",
            title: "Literature Studio is organized around the way authors work",
            text: "The editor now has three clear areas: Book Setup, Reader Design, and Chapters. The layout is new, but the saved Literature fields, chapter records, uploads, credits, preview payloads, and publishing functions are unchanged.",
            checks: [
                "Book Setup controls the title, cover, summary, tags, warnings, publishing state, and chapter index.",
                "Reader Design controls the atmosphere behind the public reading experience.",
                "Chapters contain details, the full Writing Studio, artwork, author notes, and chapter-card styling."
            ],
            actionLabel: "Open Book Setup",
            action: () => callGlobal("openBookSettings")
        },
        {
            label: "Book",
            title: "Build the public book identity first",
            text: "Book Setup is divided into focused cards with local navigation. Cover previews and chapter-index previews stay beside the controls that update them, so you do not need to scroll up and down to check your work.",
            checks: [
                "Identity holds the title, cover, description, genres, and themes.",
                "Publishing and Content Classification keep the same visibility and warning behavior.",
                "Chapter Index Appearance still saves the same style, color, image, credit, opacity, and overlay fields."
            ],
            actionLabel: "Go to Book Setup",
            action: () => callGlobal("openBookSettings")
        },
        {
            label: "Reader",
            title: "Design the reading atmosphere in one workspace",
            text: "The live reader preview remains beside the background controls. Uploads, credits, colors, opacity, blur, overlay, sizing, repeat, and Placement Studio all keep their existing behavior.",
            checks: [
                "Default, Solid, Gradient, and Image styles work exactly as before.",
                "Placement Studio still controls the saved background placement object.",
                "The public literature.html reader continues to consume the same fields."
            ],
            actionLabel: "Open Reader Design",
            action: () => callGlobal("openAppearanceSettings")
        },
        {
            label: "Outline",
            title: "The chapter outline stays available without crowding mobile",
            text: "On desktop, chapters live in the project rail. On phones and tablets, the rail becomes a searchable drawer. Quick Reorder remains available but stays collapsed until you need it.",
            checks: [
                "Press any chapter to open its workspace.",
                "Search filters the existing chapter list.",
                "Add Chapter and numbered movement still call the original functions."
            ],
            actionLabel: "Open Chapter Outline",
            action: openSidebar
        },
        {
            label: "Write",
            title: "Each chapter is split into understandable tasks",
            text: "Chapter Details, Writing Studio, Header Image, Author Note, and Chapter Card Appearance are separated into clear cards. Nothing about rich text, chapter saves, or public rendering has been rewritten.",
            checks: [
                "The full-screen Writing Studio keeps every formatting tool and rich-text snapshot.",
                "Header-image placement and credits remain attached to the chapter.",
                "Chapter-card artwork, colors, opacity, overlay, and credit fields remain intact."
            ],
            actionLabel: "Open First Chapter",
            action: openFirstChapter
        },
        {
            label: "Preview",
            title: "Previews now stay beside the controls that affect them",
            text: "Cover, chapter index, reader background, chapter header image, and chapter card previews use a paired workspace on larger screens and a clean stacked layout on mobile.",
            checks: [
                "Moving a preview in the editor does not change its ID or event listeners.",
                "Preview Page still creates the same temporary Literature payload.",
                "No changes are required in preview.html or literature.html."
            ],
            actionLabel: "View Current Preview Tools",
            action: () => jumpToPanel(/cover|index|appearance|image|card/i)
        },
        {
            label: "Finish",
            title: "Draft, Preview, and Publish stay permanently reachable",
            text: "The command bar and mobile action dock expose the original Save Draft, Preview Page, and Save & Publish functions. The new status indicator only explains the current editor state; it does not replace the existing save logic.",
            checks: [
                "Ctrl + S or Command + S calls the existing Save Draft function.",
                "Publishing still updates the same worlds and literature_chapters records.",
                "The public Literature reader remains unchanged."
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

        document.body.classList.add("nv-literature-editor-modern");
        document.body.dataset.nvView = "overview";

        buildSidebar(sidebar);
        buildCommandBar(topbar);
        buildMobileDock();
        buildGuide();
        buildGuidePrompt();
        installInputTracking();
        installContentObserver(editorContent);
        installChapterListObserver();
        installNavigationWrappers();
        installSaveState();
        clearLegacyTutorialState();

        window.addEventListener("resize", handleResize, { passive: true });
        window.addEventListener("keydown", handleGlobalKeydown);
        window.addEventListener("beforeunload", event => {
            if (!state.dirty) return;
            event.preventDefault();
            event.returnValue = "";
        });

        setTimeout(() => {
            clearLegacyTutorialState();
            installNavigationWrappers();
            installSaveState();
            decorateCurrentEditor();
            decorateChapterCards();
            updateChapterProgress();
            maybeShowGuidePrompt();
        }, 700);

        setTimeout(() => {
            installNavigationWrappers();
            installSaveState();
        }, 2200);
    }

    function buildSidebar(sidebar) {
        const header = sidebar.querySelector(".sidebar-header");
        const chapterListShell = sidebar.querySelector(".chapter-list");
        const bookCard = document.getElementById("book-card");
        const appearanceCard = document.getElementById("appearance-card");
        const dynamicList = document.getElementById("chapter-list");
        const reorder = sidebar.querySelector(".reorder-panel");

        if (header && !header.querySelector(".nv-literature-rail-topline")) {
            const topLine = document.createElement("div");
            topLine.className = "nv-literature-rail-topline";
            topLine.innerHTML = `
                <div class="nv-literature-rail-brand">Literature Studio</div>
                <button class="nv-literature-rail-close" type="button" aria-label="Close chapter outline">×</button>
            `;
            topLine.querySelector("button")?.addEventListener("click", closeSidebar);
            header.prepend(topLine);

            const progress = document.createElement("div");
            progress.className = "nv-literature-rail-progress";
            progress.innerHTML = `
                <strong>Book structure</strong>
                <span id="nv-literature-progress-label">Loading chapters</span>
                <div class="nv-literature-progress-track"><i id="nv-literature-progress-bar"></i></div>
            `;
            header.append(progress);
        }

        if (bookCard) {
            bookCard.dataset.nvKind = "book";
            bookCard.dataset.nvIcon = "B";
            const strong = bookCard.querySelector("strong");
            const copy = bookCard.querySelector("p");
            if (strong) strong.textContent = "Book Setup";
            if (copy) copy.textContent = "Identity, publishing, chapter index";
        }

        if (appearanceCard) {
            appearanceCard.dataset.nvKind = "appearance";
            appearanceCard.dataset.nvIcon = "✦";
            const strong = appearanceCard.querySelector("strong");
            const copy = appearanceCard.querySelector("p");
            if (strong) strong.textContent = "Reader Design";
            if (copy) copy.textContent = "Background and reading atmosphere";
        }

        if (chapterListShell && reorder && !reorder.previousElementSibling?.classList.contains("nv-literature-rail-heading")) {
            const heading = document.createElement("div");
            heading.className = "nv-literature-rail-heading";
            heading.innerHTML = "<span>Book controls</span>";
            chapterListShell.insertBefore(heading, reorder);

            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "nv-literature-reorder-toggle";
            toggle.innerHTML = '<span>Quick Reorder</span><span aria-hidden="true">⌄</span>';
            toggle.addEventListener("click", () => reorder.classList.toggle("nv-open"));
            reorder.prepend(toggle);
            const oldTitle = reorder.querySelector(".reorder-title");
            if (oldTitle) oldTitle.style.display = "none";
        }

        if (chapterListShell && dynamicList && !dynamicList.previousElementSibling?.classList.contains("nv-literature-rail-heading")) {
            const heading = document.createElement("div");
            heading.className = "nv-literature-rail-heading";
            heading.innerHTML = `
                <span>Your chapters</span>
                <span class="nv-literature-chapter-count" id="nv-literature-chapter-count">0</span>
            `;
            chapterListShell.insertBefore(heading, dynamicList);
        }

        if (!document.querySelector(".nv-literature-sidebar-backdrop")) {
            const backdrop = document.createElement("button");
            backdrop.type = "button";
            backdrop.className = "nv-literature-sidebar-backdrop";
            backdrop.setAttribute("aria-label", "Close chapter outline");
            backdrop.addEventListener("click", closeSidebar);
            document.body.append(backdrop);
        }
    }

    function buildCommandBar(topbar) {
        const titleBlock = topbar.firstElementChild;
        const actions = topbar.querySelector(".topbar-actions");
        const saveArea = document.getElementById("tutorial-save-area");
        const tutorialButton = document.getElementById("tutorial-button");

        topbar.classList.add("nv-literature-commandbar");
        actions?.classList.add("nv-literature-command-actions");
        saveArea?.classList.add("nv-literature-command-save");

        if (!topbar.querySelector(".nv-literature-mobile-outline")) {
            const outlineButton = document.createElement("button");
            outlineButton.type = "button";
            outlineButton.className = "nv-literature-mobile-outline";
            outlineButton.setAttribute("aria-label", "Open chapter outline");
            outlineButton.textContent = "☰";
            outlineButton.addEventListener("click", toggleSidebar);
            topbar.prepend(outlineButton);
        }

        if (titleBlock && !titleBlock.classList.contains("nv-literature-title-stack")) {
            titleBlock.classList.add("nv-literature-title-stack");
            const originalChildren = [...titleBlock.childNodes];
            const icon = document.createElement("div");
            icon.className = "nv-literature-title-icon";
            icon.textContent = "✦";
            const copy = document.createElement("div");
            copy.className = "nv-literature-title-copy";
            originalChildren.forEach(child => copy.append(child));
            titleBlock.append(icon, copy);
        }

        if (actions && !actions.querySelector(".nv-literature-command-links")) {
            const links = document.createElement("div");
            links.className = "nv-literature-command-links";

            const overviewButton = actions.querySelector('button[onclick*="openBookSettings"]');
            const appearanceButton = actions.querySelector('button[onclick*="openAppearanceSettings"]');
            overviewButton?.remove();
            appearanceButton?.remove();

            const dashboard = actions.querySelector('a[href="dashboard.html"]');
            const publicLink = document.getElementById("view-public-literature");
            const previewButton = actions.querySelector('button[onclick*="openPreviewPage"]');

            if (dashboard) {
                dashboard.textContent = "← Dashboard";
                dashboard.classList.add("nv-command-back");
                links.append(dashboard);
            }

            if (tutorialButton) {
                tutorialButton.removeAttribute("onclick");
                tutorialButton.textContent = "Guide";
                tutorialButton.title = "Open the Literature Studio guide";
                tutorialButton.classList.add("nv-command-guide");
                tutorialButton.addEventListener("click", event => {
                    event.preventDefault();
                    event.stopPropagation();
                    openGuide(0, tutorialButton);
                });
                links.append(tutorialButton);
            }

            if (publicLink) {
                publicLink.textContent = "Public Page";
                publicLink.classList.add("nv-command-public");
                links.append(publicLink);
            }

            if (previewButton) {
                previewButton.textContent = "Preview";
                previewButton.classList.add("nv-command-preview");
                links.append(previewButton);
            }

            actions.prepend(links);
        }

        if (saveArea && !document.getElementById("nv-literature-save-state")) {
            const saveState = document.createElement("span");
            saveState.id = "nv-literature-save-state";
            saveState.className = "nv-literature-save-state nv-saved";
            saveState.textContent = "Up to date";
            const group = saveArea.querySelector(".nv-save-button-group");
            group?.after(saveState);
            const publish = group?.querySelector('button[onclick*="saveAndPublish"]');
            if (publish) publish.textContent = "Publish";
        }

        if (!topbar.querySelector(".nv-literature-mobile-more")) {
            const moreButton = document.createElement("button");
            moreButton.type = "button";
            moreButton.className = "nv-literature-mobile-more";
            moreButton.setAttribute("aria-label", "More editor actions");
            moreButton.textContent = "•••";
            moreButton.addEventListener("click", () => {
                document.body.classList.toggle("nv-mobile-actions-open");
            });
            topbar.append(moreButton);
        }

        document.addEventListener("pointerdown", event => {
            if (!document.body.classList.contains("nv-mobile-actions-open")) return;
            if (event.target.closest(".nv-literature-command-actions, .nv-literature-mobile-more")) return;
            document.body.classList.remove("nv-mobile-actions-open");
        });
    }

    function buildMobileDock() {
        if (document.querySelector(".nv-literature-mobile-dock")) return;
        const dock = document.createElement("nav");
        dock.className = "nv-literature-mobile-dock";
        dock.setAttribute("aria-label", "Literature editor actions");
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

    function installContentObserver(root) {
        state.contentObserver = new MutationObserver(scheduleDecorate);
        state.contentObserver.observe(root, { childList: true, subtree: true });
    }

    let decorateFrame = 0;
    function scheduleDecorate() {
        cancelAnimationFrame(decorateFrame);
        decorateFrame = requestAnimationFrame(decorateCurrentEditor);
    }

    function detectView() {
        if (document.getElementById("tutorial-reader-appearance-area")) return "appearance";
        if (document.getElementById("tutorial-chapter-workspace-area")) return "chapter";
        return "overview";
    }

    function collectPanels(view = detectView()) {
        const root = document.getElementById("editor-content");
        if (!root) return [];

        if (view === "overview") {
            return [...root.querySelectorAll(".settings-panel-v2 > .settings-section-v2")];
        }

        if (view === "appearance") {
            const panel = document.getElementById("tutorial-reader-appearance-area") || root.querySelector(".settings-panel-v2 > .settings-hero-v2");
            return panel ? [panel] : [];
        }

        const shell = root.querySelector(".chapter-editor-v2");
        if (!shell) return [];
        const panels = [];
        [...shell.children].forEach(node => {
            if (node.classList?.contains("chapter-tool-card") || node.classList?.contains("writing-studio-card-v2")) {
                panels.push(node);
            }
            if (node.classList?.contains("chapter-main-grid-v2")) {
                [...node.children].forEach(child => {
                    if (child.classList?.contains("chapter-tool-card")) panels.push(child);
                });
            }
        });
        return panels;
    }

    function panelHeading(panel) {
        return panel.querySelector(":scope > .nv-literature-panel-heading h2, :scope > .nv-literature-panel-heading h3, :scope > h2, :scope > h3");
    }

    function panelLabel(panel, index) {
        return panelHeading(panel)?.textContent?.trim() || `Step ${index + 1}`;
    }

    function decorateCurrentEditor() {
        const root = document.getElementById("editor-content");
        if (!root || !root.firstElementChild) return;

        state.contentObserver?.disconnect();
        try {
            state.view = detectView();
            document.body.dataset.nvView = state.view;
            closeSidebar();
            root.querySelectorAll(":scope > .nv-literature-context-bar").forEach(node => node.remove());

            enhanceCompactAddButtons();
            organizeReaderAppearance();
            enhanceChapterCardEditor();

            const panels = collectPanels(state.view);
            const generation = ++state.generation;
            panels.forEach((panel, index) => decoratePanel(panel, index, generation));
            panels.forEach(buildPreviewWorkbench);
            refinePlacementLaunchers();
            buildContextBar(root, panels);
            installActivePanelTracking(panels);
            updateEditorTitle();
            updateChapterProgress();
        } finally {
            state.contentObserver?.observe(root, { childList: true, subtree: true });
        }
    }

    function enhanceCompactAddButtons() {
        const labels = {
            "genre-input": "Add Genre",
            "theme-input": "Add Theme",
            "warning-input": "Add Warning"
        };
        Object.entries(labels).forEach(([id, label]) => {
            const input = document.getElementById(id);
            const row = input?.closest(".tag-input-row, .warning-tag-tools");
            const button = row?.querySelector("button");
            if (!button || button.classList.contains("nv-literature-add-action")) return;
            button.classList.add("nv-literature-add-action");
            button.setAttribute("aria-label", label);
            button.innerHTML = `<span class="nv-literature-add-action-icon" aria-hidden="true">+</span><span>${label}</span>`;
        });
    }

    function makeControlGroup(title, description, className = "", eyebrow = "Chapter card") {
        const group = document.createElement("section");
        group.className = `nv-literature-control-group ${className}`.trim();
        group.innerHTML = `
            <div class="nv-literature-control-group-heading">
                <div><span>${escapeHtml(eyebrow)}</span><h4>${escapeHtml(title)}</h4></div>
                <p>${escapeHtml(description)}</p>
            </div>
        `;
        return group;
    }

    function appendFieldWithPrevious(id, target) {
        const field = document.getElementById(id);
        if (!field) return;
        const previous = field.previousElementSibling;
        if (previous?.classList.contains("info-wrap") || previous?.tagName === "LABEL") target.append(previous);
        target.append(field);
    }


    function organizeReaderAppearance() {
        if (state.view !== "appearance") return;
        const panel = document.getElementById("tutorial-reader-appearance-area");
        if (!panel || panel.dataset.nvReaderOrganized === "true") return;
        panel.dataset.nvReaderOrganized = "true";

        const styleGroup = makeControlGroup(
            "Reader style & colors",
            "Choose the base reader surface and the colors used behind your chapters.",
            "nv-literature-reader-style-group",
            "Reader design"
        );
        appendFieldWithPrevious("theme-name", styleGroup);
        const styleGrid = panel.querySelector(":scope > .style-choice-grid");
        const styleInfo = styleGrid?.previousElementSibling;
        if (styleInfo?.classList.contains("info-wrap")) styleGroup.append(styleInfo);
        if (styleGrid) styleGroup.append(styleGrid);
        const hiddenStyle = document.getElementById("theme-background-style");
        if (hiddenStyle) styleGroup.append(hiddenStyle);
        const colors = panel.querySelector(":scope > .connected-color-picker");
        const colorInfo = colors?.previousElementSibling;
        if (colorInfo?.classList.contains("info-wrap")) styleGroup.append(colorInfo);
        if (colors) styleGroup.append(colors);

        const artworkGroup = makeControlGroup(
            "Background artwork & credit",
            "Upload the reader artwork, frame it in Placement Studio, and keep its credit attached.",
            "nv-literature-reader-artwork-group",
            "Reader design"
        );
        const imageInput = document.getElementById("literature-background-input");
        const uploadRow = imageInput?.parentElement;
        const imageInfo = uploadRow?.previousElementSibling;
        if (imageInfo?.classList.contains("info-wrap")) artworkGroup.append(imageInfo);
        if (uploadRow) artworkGroup.append(uploadRow);
        const placement = panel.querySelector(":scope > .image-fit-launch-row");
        if (placement) artworkGroup.append(placement);
        const credit = document.getElementById("background-credit-panel");
        if (credit) artworkGroup.append(credit);

        const effectsGroup = makeControlGroup(
            "Artwork effects",
            "Fine-tune position, scale, opacity, blur, overlay, sizing, and repeat behavior.",
            "nv-literature-reader-effects-group",
            "Reader design"
        );
        [
            "theme-background-position-x",
            "theme-background-position-y",
            "theme-background-zoom",
            "theme-background-image-opacity",
            "theme-background-image-blur",
            "theme-background-overlay-strength",
            "theme-background-image-size",
            "theme-background-image-repeat"
        ].forEach(id => appendFieldWithPrevious(id, effectsGroup));

        const saveButton = panel.querySelector('button[onclick*="saveAppearanceSettings"]');
        const actionRow = saveButton?.parentElement;
        const message = document.getElementById("message");
        const insertionPoint = document.getElementById("background-art-preview");
        if (insertionPoint) {
            insertionPoint.after(styleGroup, artworkGroup, effectsGroup);
            if (actionRow) effectsGroup.after(actionRow);
            if (message && actionRow) actionRow.after(message);
        } else {
            panel.append(styleGroup, artworkGroup, effectsGroup);
        }
    }

    function enhanceChapterCardEditor() {
        if (state.view !== "chapter") return;
        const panel = document.getElementById("tutorial-chapter-card-appearance-area");
        if (!panel || panel.dataset.nvChapterCardStudio === "true") return;
        panel.dataset.nvChapterCardStudio = "true";
        panel.classList.add("nv-literature-chapter-card-studio");

        const heading = panel.querySelector(":scope > h3");
        const intro = panel.querySelector(":scope > p.muted");
        const preview = document.getElementById("chapter-card-preview");
        if (!preview) return;

        const workspace = document.createElement("div");
        workspace.className = "chapter-card-preview-workspace";

        const previewPane = document.createElement("aside");
        previewPane.className = "chapter-card-preview-pane";
        previewPane.innerHTML = `
            <div class="nv-literature-preview-rail-heading">
                <span>Live preview</span>
                <strong>Public chapter card</strong>
            </div>
        `;
        previewPane.append(preview);

        const controls = document.createElement("div");
        controls.className = "chapter-card-control-stack";

        const surface = makeControlGroup(
            "Surface & colors",
            "Choose the card style, surface colors, and text contrast."
        );
        const styleGrid = panel.querySelector(":scope > .style-choice-grid");
        const styleInfo = styleGrid?.previousElementSibling;
        if (styleInfo?.classList.contains("info-wrap")) surface.append(styleInfo);
        if (styleGrid) surface.append(styleGrid);
        const hiddenStyle = document.getElementById("chapter-card-style");
        if (hiddenStyle) surface.append(hiddenStyle);
        const colors = panel.querySelector(":scope > .connected-color-picker");
        const colorsInfo = colors?.previousElementSibling;
        if (colorsInfo?.classList.contains("info-wrap")) surface.append(colorsInfo);
        if (colors) surface.append(colors);
        const textColor = panel.querySelector(":scope > .compact-color-row");
        if (textColor) surface.append(textColor);

        const artwork = makeControlGroup(
            "Artwork & credit",
            "Upload artwork, adjust its frame in Placement Studio, and keep the credit attached."
        );
        const cardImageInput = document.getElementById("chapter-card-image-input");
        const uploadRow = cardImageInput?.parentElement;
        const imageInfo = uploadRow?.previousElementSibling;
        if (imageInfo?.classList.contains("info-wrap")) artwork.append(imageInfo);
        if (uploadRow) artwork.append(uploadRow);
        const placement = panel.querySelector(":scope > .image-fit-launch-row");
        if (placement) artwork.append(placement);
        const credit = document.getElementById("chapter-card-credit-panel");
        if (credit) artwork.append(credit);

        const effects = makeControlGroup(
            "Image effects",
            "Control image strength and the dark overlay used for readability."
        );
        appendFieldWithPrevious("chapter-card-opacity", effects);
        appendFieldWithPrevious("chapter-card-overlay", effects);

        ["chapter-spacing-type", "chapter-text-color", "chapter-panel-color"].forEach(id => {
            const hidden = document.getElementById(id);
            if (hidden) controls.append(hidden);
        });

        if (surface.children.length > 1) controls.append(surface);
        if (artwork.children.length > 1) controls.append(artwork);
        if (effects.children.length > 1) controls.append(effects);

        const reserved = new Set([heading, intro, workspace]);
        [...panel.children].forEach(child => {
            if (reserved.has(child)) return;
            if (child === preview) return;
            controls.append(child);
        });

        workspace.append(previewPane, controls);
        panel.append(workspace);
    }

    function previewCandidates(panel) {
        if (panel.classList.contains("nv-literature-chapter-card-studio")) return [];
        const candidates = [];
        const direct = [
            ...panel.querySelectorAll(":scope > #index-preview, :scope > #background-art-preview, :scope > .image-credit-preview-wrap")
        ];
        direct.forEach(node => {
            if (!candidates.includes(node)) candidates.push(node);
        });
        return candidates;
    }

    function previewLabel(node) {
        if (node.id === "index-preview") return "Chapter index preview";
        if (node.id === "background-art-preview") return "Reader background preview";
        if (node.querySelector?.(".cover-preview-img")) return "Book cover preview";
        if (node.id === "chapter-image-preview-wrap" || node.querySelector?.(".chapter-header-preview-img")) return "Chapter header preview";
        return "Live preview";
    }

    function buildPreviewWorkbench(panel) {
        if (panel.querySelector(":scope > .nv-literature-preview-workbench")) return;
        const previews = previewCandidates(panel);
        if (!previews.length) return;

        const persistent = new Set([
            panel.querySelector(":scope > .nv-literature-step-badge"),
            panel.querySelector(":scope > .nv-literature-panel-heading")
        ].filter(Boolean));

        const workbench = document.createElement("div");
        workbench.className = "nv-literature-preview-workbench";
        const rail = document.createElement("aside");
        rail.className = "nv-literature-preview-rail nv-literature-workbench-preview";
        rail.innerHTML = `
            <div class="nv-literature-preview-rail-heading">
                <span>Live preview</span>
                <strong>See changes while you edit</strong>
            </div>
        `;
        const controls = document.createElement("div");
        controls.className = "nv-literature-control-stack";

        const previewSet = new Set(previews);
        [...panel.children].forEach(child => {
            if (persistent.has(child) || previewSet.has(child) || child === workbench) return;
            controls.append(child);
        });

        previews.forEach(preview => {
            const card = document.createElement("section");
            card.className = "nv-literature-preview-card";
            const label = document.createElement("div");
            label.className = "nv-literature-preview-card-label";
            label.textContent = previewLabel(preview);
            card.append(label, preview);
            rail.append(card);
        });

        workbench.append(rail, controls);
        const heading = panel.querySelector(":scope > .nv-literature-panel-heading");
        if (heading) heading.after(workbench);
        else panel.append(workbench);
    }

    function refinePlacementLaunchers() {
        document.querySelectorAll("#editor-content .image-fit-launch-row").forEach(row => {
            row.classList.add("nv-literature-placement-launch");
            const button = row.querySelector("button");
            const note = row.querySelector(".muted");
            if (button) button.textContent = "Open Placement Studio";
            if (note) note.textContent = "Adjust crop, position, scale, rotation, and image fit in one focused workspace.";
        });
    }

    function decoratePanel(panel, index, generation) {
        if (!panel.id) panel.id = `nv-literature-${state.view}-panel-${index + 1}`;
        panel.dataset.nvModernGeneration = String(generation);
        panel.classList.add("nv-literature-collapsible");

        let badge = panel.querySelector(":scope > .nv-literature-step-badge");
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "nv-literature-step-badge";
            panel.prepend(badge);
        }
        badge.textContent = state.view === "chapter" ? `Chapter task ${index + 1}` : `Step ${index + 1}`;

        let headingWrap = panel.querySelector(":scope > .nv-literature-panel-heading");
        if (!headingWrap) {
            const heading = panel.querySelector(":scope > h2, :scope > h3");
            if (heading) {
                headingWrap = document.createElement("div");
                headingWrap.className = "nv-literature-panel-heading";
                heading.before(headingWrap);
                headingWrap.append(heading);
                const toggle = document.createElement("button");
                toggle.type = "button";
                toggle.className = "nv-literature-panel-toggle";
                toggle.setAttribute("aria-label", "Collapse this editor card");
                toggle.textContent = "⌄";
                toggle.addEventListener("click", () => togglePanel(panel));
                headingWrap.append(toggle);
            }
        }

        panel.classList.toggle("nv-collapsed", state.collapsed[collapseKey(panel)] === true);
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
        bar.className = "nv-literature-context-bar";
        bar.innerHTML = `
            <div class="nv-literature-context-links"></div>
            <div class="nv-literature-context-actions">
                <button type="button" data-nv-expand-all>Expand all</button>
                <button type="button" data-nv-collapse-all>Collapse all</button>
            </div>
        `;
        const links = bar.querySelector(".nv-literature-context-links");
        panels.forEach((panel, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "nv-literature-context-link";
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
        const barHeight = Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nvl-bar")) || 78);
        state.activePanelObserver = new IntersectionObserver(entries => {
            const visible = entries
                .filter(entry => entry.isIntersecting)
                .sort((a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top));
            if (!visible.length) return;
            setActiveContextLink(visible[0].target.id);
        }, {
            root: main,
            rootMargin: `-${barHeight + 58}px 0px -60% 0px`,
            threshold: [0, .1, .4]
        });
        panels.forEach(panel => state.activePanelObserver.observe(panel));
    }

    function setActiveContextLink(id) {
        document.querySelectorAll(".nv-literature-context-link").forEach(button => {
            button.classList.toggle("active", button.dataset.nvTarget === id);
        });
    }

    function updateEditorTitle() {
        const title = document.getElementById("editor-title");
        if (!title) return;
        const bookName = document.getElementById("literature-name")?.textContent?.trim() || "Literature";
        const chapterHeading = document.querySelector("#tutorial-chapter-workspace-area h2")?.textContent?.trim();
        if (state.view === "appearance") title.textContent = `${bookName} · Reader Design`;
        else if (state.view === "chapter" && chapterHeading) title.textContent = chapterHeading;
        else title.textContent = `${bookName} · Book Setup`;
    }

    function installChapterListObserver() {
        const list = document.getElementById("chapter-list");
        if (!list) return;
        state.chapterObserver = new MutationObserver(() => {
            decorateChapterCards();
            updateChapterProgress();
        });
        state.chapterObserver.observe(list, { childList: true, subtree: true });
    }

    function decorateChapterCards() {
        const list = document.getElementById("chapter-list");
        if (!list) return;
        [...list.querySelectorAll(".chapter-card")].forEach((card, index) => {
            card.dataset.nvKind = "chapter";
            card.dataset.nvIcon = String(index + 1);
            card.setAttribute("role", "button");
            card.setAttribute("tabindex", "0");
            if (card.dataset.nvKeyboardBound === "true") return;
            card.dataset.nvKeyboardBound = "true";
            card.addEventListener("keydown", event => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                card.click();
            });
        });
    }

    function updateChapterProgress() {
        const count = document.querySelectorAll("#chapter-list .chapter-card").length;
        const countNode = document.getElementById("nv-literature-chapter-count");
        const label = document.getElementById("nv-literature-progress-label");
        const bar = document.getElementById("nv-literature-progress-bar");
        if (countNode) countNode.textContent = String(count);
        if (label) label.textContent = `${count} ${count === 1 ? "chapter" : "chapters"}`;
        if (bar) bar.style.setProperty("--nvl-progress", `${Math.min(96, 30 + count * 8)}%`);
    }

    function installInputTracking() {
        const mark = event => {
            if (!event.target.closest("#editor-content, .writing-studio-overlay, .image-placement-overlay")) return;
            setDirty(true);
        };
        document.addEventListener("input", mark, true);
        document.addEventListener("change", mark, true);
        document.addEventListener("click", event => {
            if (event.target.closest(".warning-choice, .style-choice, .theme-color, .gradient-direction, .gradient-strength")) {
                setDirty(true);
            }
        }, true);
    }

    function installSaveState() {
        ["saveDraft", "saveAndPublish", "saveBookSettings", "saveAppearanceSettings", "saveCurrentChapter"].forEach(wrapSaveAction);
    }

    function wrapSaveAction(name) {
        const original = window[name];
        if (typeof original !== "function" || original.__nvLiteratureModernWrapped) return;
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
        wrapped.__nvLiteratureModernWrapped = true;
        wrapped.__nvLiteratureModernOriginal = original;
        window[name] = wrapped;
    }

    function setDirty(dirty, text) {
        state.dirty = dirty;
        state.saving = false;
        const node = document.getElementById("nv-literature-save-state");
        if (!node) return;
        node.classList.remove("nv-dirty", "nv-saving", "nv-saved");
        node.classList.add(dirty ? "nv-dirty" : "nv-saved");
        node.textContent = text || (dirty ? "Unsaved changes" : "Up to date");
    }

    function setSaving(saving, text) {
        state.saving = saving;
        const node = document.getElementById("nv-literature-save-state");
        if (!node) return;
        node.classList.remove("nv-dirty", "nv-saving", "nv-saved");
        node.classList.add(saving ? "nv-saving" : (state.dirty ? "nv-dirty" : "nv-saved"));
        node.textContent = text || (saving ? "Saving…" : (state.dirty ? "Unsaved changes" : "Up to date"));
    }

    function installNavigationWrappers() {
        ["openBookSettings", "openAppearanceSettings", "openChapter"].forEach(name => {
            const original = window[name];
            if (typeof original !== "function" || original.__nvLiteratureNavigationWrapped) return;
            const wrapped = function (...args) {
                const value = original.apply(this, args);
                closeSidebar();
                requestAnimationFrame(scheduleDecorate);
                return value;
            };
            wrapped.__nvLiteratureNavigationWrapped = true;
            wrapped.__nvLiteratureNavigationOriginal = original;
            window[name] = wrapped;
        });

        const legacyStart = window.startLiteratureTutorial;
        window.startLiteratureTutorial = function () {
            openGuide(0, document.getElementById("tutorial-button"));
            return false;
        };
        window.startLiteratureTutorial.__nvLegacy = legacyStart;

        window.acceptLiteratureTutorialPrompt = function () {
            clearLegacyTutorialState();
            openGuide(0);
        };
        window.skipLiteratureTutorialPrompt = function () {
            clearLegacyTutorialState();
            localStorage.setItem(GUIDE_KEY, "true");
        };
    }

    function buildGuide() {
        document.getElementById("nv-literature-guide-overlay")?.remove();
        const overlay = document.createElement("div");
        overlay.className = "nv-literature-guide-overlay";
        overlay.id = "nv-literature-guide-overlay";
        overlay.setAttribute("aria-hidden", "true");
        overlay.innerHTML = `
            <section class="nv-literature-guide" role="dialog" aria-modal="true" aria-labelledby="nv-literature-guide-title">
                <aside class="nv-literature-guide-steps">
                    <strong>Studio guide</strong>
                    ${guideSteps.map((step, index) => `
                        <button type="button" class="nv-literature-guide-step" data-nv-guide-step="${index}">
                            <i>${index + 1}</i><span>${escapeHtml(step.label)}</span>
                        </button>
                    `).join("")}
                </aside>
                <div class="nv-literature-guide-content">
                    <header class="nv-literature-guide-top">
                        <div><p id="nv-literature-guide-kicker"></p><h2 id="nv-literature-guide-title"></h2></div>
                        <button class="nv-literature-guide-close" type="button" aria-label="Close guide">×</button>
                    </header>
                    <div class="nv-literature-guide-body">
                        <p id="nv-literature-guide-text"></p>
                        <div id="nv-literature-guide-checklist" class="nv-literature-guide-checklist"></div>
                    </div>
                    <footer class="nv-literature-guide-footer">
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

        overlay.querySelector(".nv-literature-guide-close")?.addEventListener("click", () => closeGuide(false));
        overlay.querySelector("[data-nv-guide-previous]")?.addEventListener("click", () => showGuideStep(state.guideIndex - 1));
        overlay.querySelector("[data-nv-guide-next]")?.addEventListener("click", () => {
            if (state.guideIndex >= guideSteps.length - 1) closeGuide(true);
            else showGuideStep(state.guideIndex + 1);
        });
        overlay.querySelector("[data-nv-guide-action]")?.addEventListener("click", () => {
            const step = guideSteps[state.guideIndex];
            if (!step) return;
            if (state.guideIndex < guideSteps.length - 1) closeGuide(false);
            step.action?.();
        });
        overlay.querySelectorAll("[data-nv-guide-step]").forEach(button => {
            button.addEventListener("click", () => showGuideStep(Number(button.dataset.nvGuideStep) || 0));
        });
        overlay.addEventListener("pointerdown", event => {
            if (event.target === overlay) closeGuide(false);
        });
    }

    function buildGuidePrompt() {
        if (document.getElementById("nv-literature-guide-prompt")) return;
        const prompt = document.createElement("aside");
        prompt.id = "nv-literature-guide-prompt";
        prompt.className = "nv-literature-guide-prompt";
        prompt.innerHTML = `
            <div><strong>Literature Studio has a new workflow</strong><span>Take a stable two-minute tour with no moving spotlight.</span></div>
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
        setTimeout(() => document.getElementById("nv-literature-guide-prompt")?.classList.add("open"), 450);
    }

    function dismissGuidePrompt() {
        document.getElementById("nv-literature-guide-prompt")?.classList.remove("open");
        localStorage.setItem(GUIDE_KEY, "true");
    }

    function openGuide(index = 0, returnFocus = null) {
        clearLegacyTutorialState();
        dismissGuidePrompt();
        document.body.classList.remove("nv-mobile-actions-open", "nv-sidebar-open");
        let overlay = document.getElementById("nv-literature-guide-overlay");
        if (!overlay) {
            buildGuide();
            overlay = document.getElementById("nv-literature-guide-overlay");
        }
        if (!overlay) return;
        state.guideReturnFocus = returnFocus || document.activeElement;
        overlay.classList.remove("open");
        overlay.setAttribute("aria-hidden", "false");
        void overlay.offsetWidth;
        overlay.classList.add("open");
        document.body.classList.add("nv-guide-open");
        document.documentElement.classList.add("nv-guide-open");
        showGuideStep(index);
        requestAnimationFrame(() => overlay.querySelector(".nv-literature-guide-close")?.focus({ preventScroll: true }));
    }

    function closeGuide(completed) {
        const overlay = document.getElementById("nv-literature-guide-overlay");
        overlay?.classList.remove("open");
        overlay?.setAttribute("aria-hidden", "true");
        document.body.classList.remove("nv-guide-open");
        document.documentElement.classList.remove("nv-guide-open");
        if (completed) localStorage.setItem(GUIDE_KEY, "true");
        const focus = state.guideReturnFocus;
        state.guideReturnFocus = null;
        if (focus && typeof focus.focus === "function" && document.contains(focus)) {
            requestAnimationFrame(() => focus.focus({ preventScroll: true }));
        }
    }

    function showGuideStep(index) {
        state.guideIndex = Math.max(0, Math.min(guideSteps.length - 1, index));
        const step = guideSteps[state.guideIndex];
        const overlay = document.getElementById("nv-literature-guide-overlay");
        if (!step || !overlay) return;
        overlay.querySelector("#nv-literature-guide-kicker").textContent = `Step ${state.guideIndex + 1} of ${guideSteps.length} · ${step.label}`;
        overlay.querySelector("#nv-literature-guide-title").textContent = step.title;
        overlay.querySelector("#nv-literature-guide-text").textContent = step.text;
        overlay.querySelector("#nv-literature-guide-checklist").innerHTML = step.checks.map((check, itemIndex) => `
            <div class="nv-literature-guide-check"><i>${itemIndex + 1}</i><span>${escapeHtml(check)}</span></div>
        `).join("");
        overlay.querySelector("[data-nv-guide-action]").textContent = step.actionLabel;
        overlay.querySelector("[data-nv-guide-previous]").disabled = state.guideIndex === 0;
        overlay.querySelector("[data-nv-guide-next]").textContent = state.guideIndex === guideSteps.length - 1 ? "Finish" : "Next →";
        overlay.querySelectorAll("[data-nv-guide-step]").forEach(button => {
            button.classList.toggle("active", Number(button.dataset.nvGuideStep) === state.guideIndex);
        });
    }

    function clearLegacyTutorialState() {
        document.body.classList.remove("tutorial-active", "tutorial-studio-open");
        ["tutorial-overlay", "tutorial-welcome-overlay"].forEach(id => {
            const node = document.getElementById(id);
            node?.classList.remove("open");
            node?.setAttribute("aria-hidden", "true");
            if (node) node.style.pointerEvents = "none";
        });
        document.querySelectorAll(".tutorial-target-lift").forEach(node => node.classList.remove("tutorial-target-lift"));
    }

    function openFirstChapter() {
        const first = document.querySelector("#chapter-list .chapter-card");
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
        const panels = collectPanels();
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
