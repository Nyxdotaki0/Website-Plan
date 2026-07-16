(() => {
    "use strict";

    const GUIDE_KEY = "nullverse-comic-editor-guide-v1-seen";
    const COLLAPSE_KEY = "nullverse-comic-editor-collapsed-v1";
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
            title: "Comic Studio follows the way visual storytellers actually work",
            text: "The editor is organized around Comic Setup, Reader Design, Chapters, and Page Studio. The interface is new, but the saved comic fields, chapter records, page records, uploads, credits, preview payloads, drafts, and publishing functions are unchanged.",
            checks: [
                "Comic Setup controls identity, format, reading mode, publishing, warnings, cover art, and the chapter index.",
                "Reader Design controls the atmosphere behind the public comic reader.",
                "Each chapter keeps its details, live reader preview, page uploads, page ordering, Page Studio, placement, and per-page credits."
            ],
            actionLabel: "Open Comic Setup",
            action: () => callGlobal("openComicSettings")
        },
        {
            label: "Setup",
            title: "Set the comic format before arranging pages",
            text: "Comic Setup is divided into focused cards with local navigation. The cover and chapter-index previews remain beside the controls that affect them, while reading mode and page direction stay easy to find.",
            checks: [
                "Choose Comic or Manga without changing the project route or database structure.",
                "Paged mode and Webtoon mode continue to use the existing comic reader behavior.",
                "Left-to-right and right-to-left page direction still save through the original fields."
            ],
            actionLabel: "Go to Comic Setup",
            action: () => callGlobal("openComicSettings")
        },
        {
            label: "Reader",
            title: "Reader Design controls the space around the artwork",
            text: "The live background preview stays with its related controls. Colors, artwork, credit, opacity, blur, overlay, repeat behavior, and Placement Studio all keep their existing save logic.",
            checks: [
                "Default, Solid, Gradient, and Image backgrounds work as before.",
                "Placement Studio still writes the saved background placement object.",
                "comic.html and Preview Mode continue reading the same fields."
            ],
            actionLabel: "Open Reader Design",
            action: () => callGlobal("openAppearanceSettings")
        },
        {
            label: "Outline",
            title: "The chapter outline stays useful without crowding the canvas",
            text: "Desktop keeps a compact project rail. Phones and tablets use a searchable drawer. Quick Reorder stays available but remains collapsed until it is needed.",
            checks: [
                "Press a chapter to open its workspace.",
                "Search filters the existing chapter list.",
                "Add Chapter and numbered movement continue calling the original functions."
            ],
            actionLabel: "Open Chapter Outline",
            action: openSidebar
        },
        {
            label: "Pages",
            title: "Each chapter is built around pages, not writing controls",
            text: "Chapter Details, Live Reader Preview, Quick Upload, Page Library, and Page Studio are presented as separate tasks. Paged and Webtoon previews still render the actual uploaded page records.",
            checks: [
                "Multi-image upload keeps the existing compression and insertion order.",
                "Move, Swap, Previous, Next, delete, refresh, and page selection still use the original handlers.",
                "Per-page image placement and credit drawers remain attached to each page."
            ],
            actionLabel: "Open First Chapter",
            action: openFirstChapter
        },
        {
            label: "Studio",
            title: "Page Studio remains the focused workspace for visual sequencing",
            text: "Page Studio keeps the full-screen active-page view, thumbnail rail, Paged and Webtoon toggles, placement tools, public-reader shortcut, and Save & Exit behavior. The overhaul only improves how users reach and understand it.",
            checks: [
                "The selected page and thumbnail state still come from the existing page array.",
                "Adjust Page Placement continues writing each page's image_placement value.",
                "Exiting and saving still use the original Page Studio functions."
            ],
            actionLabel: "Open Current Page Studio",
            action: () => {
                closeGuide(false);
                if (detectView() !== "chapter") openFirstChapter();
                setTimeout(() => callGlobal("openPageStudio"), 220);
            }
        },
        {
            label: "Finish",
            title: "Draft, Preview, and Publish stay permanently reachable",
            text: "The command bar and mobile dock call the original Save Draft, Preview Page, and Save & Publish functions. The new status indicator explains editor state without replacing the existing save system.",
            checks: [
                "Ctrl + S or Command + S calls the existing Save Draft function.",
                "Publishing still updates worlds, comic_chapters, and comic_pages through the current logic.",
                "No changes are required in comic.html, preview.html, or Supabase."
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

        document.body.classList.add("nv-comic-editor-modern");
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
        const comicCard = document.getElementById("comic-card");
        const appearanceCard = document.getElementById("appearance-card");
        const dynamicList = document.getElementById("chapter-list");
        const reorder = sidebar.querySelector(".reorder-panel");

        if (header && !header.querySelector(".nv-comic-rail-topline")) {
            const topLine = document.createElement("div");
            topLine.className = "nv-comic-rail-topline";
            topLine.innerHTML = `
                <div class="nv-comic-rail-brand">Comic Studio</div>
                <button class="nv-comic-rail-close" type="button" aria-label="Close chapter outline">×</button>
            `;
            topLine.querySelector("button")?.addEventListener("click", closeSidebar);
            header.prepend(topLine);

            const progress = document.createElement("div");
            progress.className = "nv-comic-rail-progress";
            progress.innerHTML = `
                <strong>Comic structure</strong>
                <span id="nv-comic-progress-label">Loading chapters</span>
                <div class="nv-comic-progress-track"><i id="nv-comic-progress-bar"></i></div>
            `;
            header.append(progress);
        }

        if (comicCard) {
            comicCard.dataset.nvKind = "comic";
            comicCard.dataset.nvIcon = "C";
            const strong = comicCard.querySelector("strong");
            const copy = comicCard.querySelector("p");
            if (strong) strong.textContent = "Comic Setup";
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

        if (chapterListShell && reorder && !reorder.previousElementSibling?.classList.contains("nv-comic-rail-heading")) {
            const heading = document.createElement("div");
            heading.className = "nv-comic-rail-heading";
            heading.innerHTML = "<span>Comic controls</span>";
            chapterListShell.insertBefore(heading, reorder);

            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "nv-comic-reorder-toggle";
            toggle.innerHTML = '<span>Quick Reorder</span><span aria-hidden="true">⌄</span>';
            toggle.addEventListener("click", () => reorder.classList.toggle("nv-open"));
            reorder.prepend(toggle);
            const oldTitle = reorder.querySelector(".reorder-title");
            if (oldTitle) oldTitle.style.display = "none";
        }

        if (chapterListShell && dynamicList && !dynamicList.previousElementSibling?.classList.contains("nv-comic-rail-heading")) {
            const heading = document.createElement("div");
            heading.className = "nv-comic-rail-heading";
            heading.innerHTML = `
                <span>Your chapters</span>
                <span class="nv-comic-chapter-count" id="nv-comic-chapter-count">0</span>
            `;
            chapterListShell.insertBefore(heading, dynamicList);
        }

        if (!document.querySelector(".nv-comic-sidebar-backdrop")) {
            const backdrop = document.createElement("button");
            backdrop.type = "button";
            backdrop.className = "nv-comic-sidebar-backdrop";
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

        topbar.classList.add("nv-comic-commandbar");
        actions?.classList.add("nv-comic-command-actions");
        saveArea?.classList.add("nv-comic-command-save");

        if (!topbar.querySelector(".nv-comic-mobile-outline")) {
            const outlineButton = document.createElement("button");
            outlineButton.type = "button";
            outlineButton.className = "nv-comic-mobile-outline";
            outlineButton.setAttribute("aria-label", "Open chapter outline");
            outlineButton.textContent = "☰";
            outlineButton.addEventListener("click", toggleSidebar);
            topbar.prepend(outlineButton);
        }

        if (titleBlock && !titleBlock.classList.contains("nv-comic-title-stack")) {
            titleBlock.classList.add("nv-comic-title-stack");
            const originalChildren = [...titleBlock.childNodes];
            const icon = document.createElement("div");
            icon.className = "nv-comic-title-icon";
            icon.textContent = "✦";
            const copy = document.createElement("div");
            copy.className = "nv-comic-title-copy";
            originalChildren.forEach(child => copy.append(child));
            titleBlock.append(icon, copy);
        }

        if (actions && !actions.querySelector(".nv-comic-command-links")) {
            const links = document.createElement("div");
            links.className = "nv-comic-command-links";

            const overviewButton = actions.querySelector('button[onclick*="openComicSettings"]');
            const appearanceButton = actions.querySelector('button[onclick*="openAppearanceSettings"]');
            overviewButton?.remove();
            appearanceButton?.remove();

            const dashboard = actions.querySelector('a[href="dashboard.html"]');
            const publicLink = document.getElementById("view-public-comic");
            const previewButton = actions.querySelector('button[onclick*="openPreviewPage"]');

            if (dashboard) {
                dashboard.textContent = "← Dashboard";
                dashboard.classList.add("nv-command-back");
                links.append(dashboard);
            }

            if (tutorialButton) {
                tutorialButton.removeAttribute("onclick");
                tutorialButton.textContent = "Guide";
                tutorialButton.title = "Open the Comic Studio guide";
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

        if (saveArea && !document.getElementById("nv-comic-save-state")) {
            const saveState = document.createElement("span");
            saveState.id = "nv-comic-save-state";
            saveState.className = "nv-comic-save-state nv-saved";
            saveState.textContent = "Up to date";
            const group = saveArea.querySelector(".nv-save-button-group");
            group?.after(saveState);
            const publish = group?.querySelector('button[onclick*="saveAndPublish"]');
            if (publish) publish.textContent = "Publish";
        }

        if (!topbar.querySelector(".nv-comic-mobile-more")) {
            const moreButton = document.createElement("button");
            moreButton.type = "button";
            moreButton.className = "nv-comic-mobile-more";
            moreButton.setAttribute("aria-label", "More editor actions");
            moreButton.textContent = "•••";
            moreButton.addEventListener("click", () => {
                document.body.classList.toggle("nv-mobile-actions-open");
            });
            topbar.append(moreButton);
        }

        document.addEventListener("pointerdown", event => {
            if (!document.body.classList.contains("nv-mobile-actions-open")) return;
            if (event.target.closest(".nv-comic-command-actions, .nv-comic-mobile-more")) return;
            document.body.classList.remove("nv-mobile-actions-open");
        });
    }

    function buildMobileDock() {
        if (document.querySelector(".nv-comic-mobile-dock")) return;
        const dock = document.createElement("nav");
        dock.className = "nv-comic-mobile-dock";
        dock.setAttribute("aria-label", "Comic editor actions");
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
        const root = document.getElementById("editor-content");
        if (!root) return "overview";
        if (root.querySelector(".chapter-editor-v2") || document.getElementById("page-studio-overlay")) return "chapter";
        if (
            document.getElementById("background-art-preview") ||
            document.getElementById("comic-background-input") ||
            document.getElementById("theme-background-style")
        ) return "appearance";
        return "overview";
    }

    function collectPanels(view = detectView()) {
        const root = document.getElementById("editor-content");
        if (!root) return [];

        if (view === "overview" || view === "appearance") {
            return [...root.querySelectorAll(".settings-panel-v2 > .settings-section-v2")]
                .filter(panel => !panel.classList.contains("nv-comic-consumed-panel"));
        }

        const shell = root.querySelector(".chapter-editor-v2");
        if (!shell) return [];
        const panels = [];
        [...shell.children].forEach(node => {
            if (
                node.classList?.contains("chapter-tool-card") ||
                node.classList?.contains("page-studio-card-v2")
            ) {
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
        return panel.querySelector(":scope > .nv-comic-panel-heading h2, :scope > .nv-comic-panel-heading h3, :scope > h2, :scope > h3, :scope > div:first-child > h2, :scope > div:first-child > h3");
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
            root.querySelectorAll(":scope > .nv-comic-context-bar").forEach(node => node.remove());

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
            if (!button || button.classList.contains("nv-comic-add-action")) return;
            button.classList.add("nv-comic-add-action");
            button.setAttribute("aria-label", label);
            button.innerHTML = `<span class="nv-comic-add-action-icon" aria-hidden="true">+</span><span>${label}</span>`;
        });
    }

    function makeControlGroup(title, description, className = "", eyebrow = "Comic controls") {
        const group = document.createElement("section");
        group.className = `nv-comic-control-group ${className}`.trim();
        group.innerHTML = `
            <div class="nv-comic-control-group-heading">
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
        const root = document.getElementById("editor-content");
        const preview = document.getElementById("background-art-preview");
        const mainPanel = preview?.closest(".settings-section-v2");
        if (!root || !mainPanel || mainPanel.dataset.nvReaderOrganized === "true") return;
        mainPanel.dataset.nvReaderOrganized = "true";
        mainPanel.id ||= "nv-comic-reader-design-panel";

        const themeName = document.getElementById("theme-name");
        if (themeName) {
            const label = themeName.previousElementSibling;
            themeName.classList.add("nv-comic-hidden-legacy-control");
            themeName.setAttribute("aria-hidden", "true");
            themeName.tabIndex = -1;
            if (label?.classList.contains("info-wrap") || label?.tagName === "LABEL") {
                label.classList.add("nv-comic-hidden-legacy-control");
                label.setAttribute("aria-hidden", "true");
            }
        }

        const styleGroup = makeControlGroup(
            "Reader surface",
            "Choose the base atmosphere and colors shown around comic or manga pages.",
            "nv-comic-reader-style-group",
            "Reader design"
        );
        const styleGrid = mainPanel.querySelector(":scope > .style-choice-grid");
        const styleInfo = styleGrid?.previousElementSibling;
        if (styleInfo?.classList.contains("info-wrap")) styleGroup.append(styleInfo);
        if (styleGrid) styleGroup.append(styleGrid);
        const hiddenStyle = document.getElementById("theme-background-style");
        if (hiddenStyle) styleGroup.append(hiddenStyle);
        const colors = mainPanel.querySelector(":scope > .connected-color-picker");
        const colorInfo = colors?.previousElementSibling;
        if (colorInfo?.classList.contains("info-wrap")) styleGroup.append(colorInfo);
        if (colors) styleGroup.append(colors);

        const artworkGroup = makeControlGroup(
            "Background artwork & credit",
            "Upload reader artwork, frame it in Placement Studio, and keep attribution attached.",
            "nv-comic-reader-artwork-group",
            "Reader design"
        );
        const imageInput = document.getElementById("comic-background-input");
        const uploadRow = imageInput?.parentElement;
        const imageInfo = uploadRow?.previousElementSibling;
        if (imageInfo?.classList.contains("info-wrap")) artworkGroup.append(imageInfo);
        if (uploadRow) artworkGroup.append(uploadRow);
        const placement = root.querySelector(".image-fit-launch-row");
        if (placement) artworkGroup.append(placement);
        const credit = document.getElementById("background-credit-panel");
        if (credit) artworkGroup.append(credit);

        const effectsGroup = makeControlGroup(
            "Atmosphere effects",
            "Adjust image strength and readability. Framing, scale, rotation, and fit remain inside Placement Studio.",
            "nv-comic-reader-effects-group",
            "Reader design"
        );
        [
            "theme-background-image-opacity",
            "theme-background-image-blur",
            "theme-background-overlay-strength",
            "theme-background-image-repeat"
        ].forEach(id => appendFieldWithPrevious(id, effectsGroup));

        [
            "theme-background-position-x",
            "theme-background-position-y",
            "theme-background-zoom",
            "theme-background-image-size"
        ].forEach(id => {
            const field = document.getElementById(id);
            if (!field) return;
            field.classList.add("nv-comic-hidden-legacy-control");
            field.setAttribute("aria-hidden", "true");
            field.tabIndex = -1;
            const label = field.previousElementSibling;
            if (label?.classList.contains("info-wrap") || label?.tagName === "LABEL") {
                label.classList.add("nv-comic-hidden-legacy-control");
                label.setAttribute("aria-hidden", "true");
            }
        });

        const secondaryPanel = [...root.querySelectorAll(".settings-panel-v2 > .settings-section-v2")]
            .find(panel => panel !== mainPanel && panel.querySelector("#theme-background-image-opacity, #theme-background-image-blur, #theme-background-overlay-strength"));
        const saveButton = root.querySelector('button[onclick*="saveAppearanceSettings"]');
        const actionRow = saveButton?.parentElement;
        const message = document.getElementById("message");

        preview.after(styleGroup, artworkGroup, effectsGroup);
        if (actionRow) effectsGroup.after(actionRow);
        if (message && actionRow) actionRow.after(message);

        if (secondaryPanel) {
            secondaryPanel.classList.add("nv-comic-consumed-panel");
            secondaryPanel.style.display = "none";
        }
    }

    function enhanceChapterCardEditor() {
        if (state.view !== "chapter") return;
        const shell = document.querySelector("#editor-content .chapter-editor-v2");
        if (!shell || shell.dataset.nvComicChapterOrganized === "true") return;
        shell.dataset.nvComicChapterOrganized = "true";

        const hero = shell.querySelector(":scope > .chapter-hero-v2");
        hero?.classList.add("nv-comic-chapter-hero");

        const studio = shell.querySelector(":scope > .page-studio-card-v2");
        studio?.classList.add("nv-comic-page-studio-launch");

        const grid = shell.querySelector(":scope > .chapter-main-grid-v2");
        const gridCards = [...(grid?.querySelectorAll(":scope > .chapter-tool-card") || [])];
        gridCards[0]?.classList.add("nv-comic-reader-preview-card");
        gridCards[1]?.classList.add("nv-comic-quick-upload-card");

        const library = [...shell.querySelectorAll(":scope > .chapter-tool-card")]
            .find(panel => panel.querySelector("#page-grid"));
        library?.classList.add("nv-comic-page-library-card");

        const reorder = grid?.querySelector(".reorder-panel");
        if (reorder && !reorder.querySelector(".nv-comic-page-reorder-toggle")) {
            const toggle = document.createElement("button");
            toggle.type = "button";
            toggle.className = "nv-comic-page-reorder-toggle";
            toggle.innerHTML = '<span>Precise Page Reorder</span><span aria-hidden="true">⌄</span>';
            toggle.addEventListener("click", () => reorder.classList.toggle("nv-open"));
            reorder.prepend(toggle);
            const title = reorder.querySelector(".reorder-title");
            if (title) title.style.display = "none";
        }

        const uploadZone = document.getElementById("tutorial-page-upload-area");
        uploadZone?.classList.add("nv-comic-page-upload-zone");

        const pageGrid = document.getElementById("page-grid");
        pageGrid?.classList.add("nv-comic-page-library-grid");
    }

    function previewCandidates(panel) {
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
        if (node.querySelector?.(".cover-preview-img")) return "Comic cover preview";
        return "Live preview";
    }

    function buildPreviewWorkbench(panel) {
        if (panel.querySelector(":scope > .nv-comic-preview-workbench")) return;
        const previews = previewCandidates(panel);
        if (!previews.length) return;

        const persistent = new Set([
            panel.querySelector(":scope > .nv-comic-step-badge"),
            panel.querySelector(":scope > .nv-comic-panel-heading")
        ].filter(Boolean));

        const workbench = document.createElement("div");
        workbench.className = "nv-comic-preview-workbench";
        const rail = document.createElement("aside");
        rail.className = "nv-comic-preview-rail nv-comic-workbench-preview";
        rail.innerHTML = `
            <div class="nv-comic-preview-rail-heading">
                <span>Live preview</span>
                <strong>See changes while you edit</strong>
            </div>
        `;
        const controls = document.createElement("div");
        controls.className = "nv-comic-control-stack";

        const previewSet = new Set(previews);
        [...panel.children].forEach(child => {
            if (persistent.has(child) || previewSet.has(child) || child === workbench) return;
            controls.append(child);
        });

        previews.forEach(preview => {
            const card = document.createElement("section");
            card.className = "nv-comic-preview-card";
            const label = document.createElement("div");
            label.className = "nv-comic-preview-card-label";
            label.textContent = previewLabel(preview);
            card.append(label, preview);
            rail.append(card);
        });

        workbench.append(rail, controls);
        const heading = panel.querySelector(":scope > .nv-comic-panel-heading");
        if (heading) heading.after(workbench);
        else panel.append(workbench);
    }

    function refinePlacementLaunchers() {
        document.querySelectorAll("#editor-content .image-fit-launch-row").forEach(row => {
            row.classList.add("nv-comic-placement-launch");
            const button = row.querySelector("button");
            const note = row.querySelector(".muted");
            if (button) button.textContent = "Open Placement Studio";
            if (note) note.textContent = "Adjust crop, position, scale, rotation, and image fit in one focused workspace.";
        });
    }

    function decoratePanel(panel, index, generation) {
        if (!panel.id) panel.id = `nv-comic-${state.view}-panel-${index + 1}`;
        panel.dataset.nvModernGeneration = String(generation);

        let badge = panel.querySelector(":scope > .nv-comic-step-badge");
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "nv-comic-step-badge";
            panel.prepend(badge);
        }
        badge.textContent = state.view === "chapter" ? `Chapter task ${index + 1}` : `Step ${index + 1}`;

        if (panel.classList.contains("page-studio-card-v2")) {
            panel.dataset.nvNoCollapse = "true";
            panel.classList.remove("nv-comic-collapsible", "nv-collapsed");
            return;
        }

        panel.classList.add("nv-comic-collapsible");
        let headingWrap = panel.querySelector(":scope > .nv-comic-panel-heading");
        if (!headingWrap) {
            const heading = panel.querySelector(":scope > h2, :scope > h3");
            if (heading) {
                headingWrap = document.createElement("div");
                headingWrap.className = "nv-comic-panel-heading";
                heading.before(headingWrap);
                headingWrap.append(heading);
                const toggle = document.createElement("button");
                toggle.type = "button";
                toggle.className = "nv-comic-panel-toggle";
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
        if (panel?.dataset?.nvNoCollapse === "true") {
            panel.classList.remove("nv-collapsed");
            return;
        }
        const collapsed = typeof force === "boolean" ? force : !panel.classList.contains("nv-collapsed");
        panel.classList.toggle("nv-collapsed", collapsed);
        state.collapsed[collapseKey(panel)] = collapsed;
        writeJson(COLLAPSE_KEY, state.collapsed);
    }

    function buildContextBar(root, panels) {
        if (!panels.length) return;
        const bar = document.createElement("div");
        bar.className = "nv-comic-context-bar";
        bar.innerHTML = `
            <div class="nv-comic-context-links"></div>
            <div class="nv-comic-context-actions">
                <button type="button" data-nv-expand-all>Expand all</button>
                <button type="button" data-nv-collapse-all>Collapse all</button>
            </div>
        `;
        const links = bar.querySelector(".nv-comic-context-links");
        panels.forEach((panel, index) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "nv-comic-context-link";
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
        const barHeight = Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--nvc-bar")) || 78);
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
        document.querySelectorAll(".nv-comic-context-link").forEach(button => {
            button.classList.toggle("active", button.dataset.nvTarget === id);
        });
    }

    function updateEditorTitle() {
        const title = document.getElementById("editor-title");
        if (!title) return;
        const comicName = document.getElementById("comic-name")?.textContent?.trim() || "Comic";
        const chapterHeading = document.querySelector("#editor-content .chapter-hero-v2 h2")?.textContent?.trim();
        if (state.view === "appearance") title.textContent = `${comicName} · Reader Design`;
        else if (state.view === "chapter" && chapterHeading) title.textContent = chapterHeading;
        else title.textContent = `${comicName} · Comic Setup`;
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
            card.dataset.nvIcon = card.dataset.nvChapterNumber || String(index + 1);
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
        const list = document.getElementById("chapter-list");
        const visibleCount = list?.querySelectorAll(".chapter-card").length || 0;
        const totalCount = Number(list?.dataset.nvTotalChapters || visibleCount);
        const matchedCount = Number(list?.dataset.nvMatchedChapters || visibleCount);
        const searchActive = list?.dataset.nvSearchActive === "true";
        const countNode = document.getElementById("nv-comic-chapter-count");
        const label = document.getElementById("nv-comic-progress-label");
        const bar = document.getElementById("nv-comic-progress-bar");

        if (countNode) {
            countNode.textContent = searchActive
                ? `${matchedCount}/${totalCount}`
                : String(totalCount);
        }

        if (label) {
            label.textContent = searchActive
                ? `${matchedCount} of ${totalCount} ${totalCount === 1 ? "chapter" : "chapters"}`
                : `${totalCount} ${totalCount === 1 ? "chapter" : "chapters"}`;
        }

        if (bar) {
            const progressCount = searchActive ? matchedCount : totalCount;
            bar.style.setProperty("--nvc-progress", `${Math.min(96, 30 + progressCount * 8)}%`);
        }
    }

    function installInputTracking() {
        const mark = event => {
            if (!event.target.closest("#editor-content, .page-studio-overlay, .image-placement-overlay")) return;
            if (event.target.closest(".nv-comic-guide-overlay, .nv-comic-guide-prompt")) return;
            setDirty(true);
        };
        document.addEventListener("input", mark, true);
        document.addEventListener("change", mark, true);
        document.addEventListener("click", event => {
            if (event.target.closest(".warning-choice, .style-choice")) {
                setDirty(true);
            }
        }, true);
    }

    function installSaveState() {
        ["saveDraft", "saveAndPublish", "saveComicSettings", "saveAppearanceSettings", "saveCurrentChapter", "saveAndClosePageStudio", "savePageCredit"].forEach(wrapSaveAction);
    }

    function wrapSaveAction(name) {
        const original = window[name];
        if (typeof original !== "function" || original.__nvComicModernWrapped) return;
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
        wrapped.__nvComicModernWrapped = true;
        wrapped.__nvComicModernOriginal = original;
        window[name] = wrapped;
    }

    function setDirty(dirty, text) {
        state.dirty = dirty;
        state.saving = false;
        const node = document.getElementById("nv-comic-save-state");
        if (!node) return;
        node.classList.remove("nv-dirty", "nv-saving", "nv-saved");
        node.classList.add(dirty ? "nv-dirty" : "nv-saved");
        node.textContent = text || (dirty ? "Unsaved changes" : "Up to date");
    }

    function setSaving(saving, text) {
        state.saving = saving;
        const node = document.getElementById("nv-comic-save-state");
        if (!node) return;
        node.classList.remove("nv-dirty", "nv-saving", "nv-saved");
        node.classList.add(saving ? "nv-saving" : (state.dirty ? "nv-dirty" : "nv-saved"));
        node.textContent = text || (saving ? "Saving…" : (state.dirty ? "Unsaved changes" : "Up to date"));
    }

    function installNavigationWrappers() {
        ["openComicSettings", "openAppearanceSettings", "openChapter"].forEach(name => {
            const original = window[name];
            if (typeof original !== "function" || original.__nvComicNavigationWrapped) return;
            const wrapped = function (...args) {
                const value = original.apply(this, args);
                closeSidebar();
                requestAnimationFrame(scheduleDecorate);
                return value;
            };
            wrapped.__nvComicNavigationWrapped = true;
            wrapped.__nvComicNavigationOriginal = original;
            window[name] = wrapped;
        });

        const legacyStart = window.startComicTutorial;
        window.startComicTutorial = function () {
            openGuide(0, document.getElementById("tutorial-button"));
            return false;
        };
        window.startComicTutorial.__nvLegacy = legacyStart;

        window.acceptComicTutorialPrompt = function () {
            clearLegacyTutorialState();
            openGuide(0);
        };
        window.skipComicTutorialPrompt = function () {
            clearLegacyTutorialState();
            localStorage.setItem(GUIDE_KEY, "true");
        };
    }

    function buildGuide() {
        document.getElementById("nv-comic-guide-overlay")?.remove();
        const overlay = document.createElement("div");
        overlay.className = "nv-comic-guide-overlay";
        overlay.id = "nv-comic-guide-overlay";
        overlay.setAttribute("aria-hidden", "true");
        overlay.innerHTML = `
            <section class="nv-comic-guide" role="dialog" aria-modal="true" aria-labelledby="nv-comic-guide-title">
                <aside class="nv-comic-guide-steps">
                    <strong>Studio guide</strong>
                    ${guideSteps.map((step, index) => `
                        <button type="button" class="nv-comic-guide-step" data-nv-guide-step="${index}">
                            <i>${index + 1}</i><span>${escapeHtml(step.label)}</span>
                        </button>
                    `).join("")}
                </aside>
                <div class="nv-comic-guide-content">
                    <header class="nv-comic-guide-top">
                        <div><p id="nv-comic-guide-kicker"></p><h2 id="nv-comic-guide-title"></h2></div>
                        <button class="nv-comic-guide-close" type="button" aria-label="Close guide">×</button>
                    </header>
                    <div class="nv-comic-guide-body">
                        <p id="nv-comic-guide-text"></p>
                        <div id="nv-comic-guide-checklist" class="nv-comic-guide-checklist"></div>
                    </div>
                    <footer class="nv-comic-guide-footer">
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

        overlay.querySelector(".nv-comic-guide-close")?.addEventListener("click", () => closeGuide(false));
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
        if (document.getElementById("nv-comic-guide-prompt")) return;
        const prompt = document.createElement("aside");
        prompt.id = "nv-comic-guide-prompt";
        prompt.className = "nv-comic-guide-prompt";
        prompt.innerHTML = `
            <div><strong>Comic Studio has a new visual workflow</strong><span>Take a stable two-minute tour of setup, chapters, pages, and Page Studio.</span></div>
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
        setTimeout(() => document.getElementById("nv-comic-guide-prompt")?.classList.add("open"), 450);
    }

    function dismissGuidePrompt() {
        document.getElementById("nv-comic-guide-prompt")?.classList.remove("open");
        localStorage.setItem(GUIDE_KEY, "true");
    }

    function openGuide(index = 0, returnFocus = null) {
        clearLegacyTutorialState();
        dismissGuidePrompt();
        document.body.classList.remove("nv-mobile-actions-open", "nv-sidebar-open");
        let overlay = document.getElementById("nv-comic-guide-overlay");
        if (!overlay) {
            buildGuide();
            overlay = document.getElementById("nv-comic-guide-overlay");
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
        requestAnimationFrame(() => overlay.querySelector(".nv-comic-guide-close")?.focus({ preventScroll: true }));
    }

    function closeGuide(completed) {
        const overlay = document.getElementById("nv-comic-guide-overlay");
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
        const overlay = document.getElementById("nv-comic-guide-overlay");
        if (!step || !overlay) return;
        overlay.querySelector("#nv-comic-guide-kicker").textContent = `Step ${state.guideIndex + 1} of ${guideSteps.length} · ${step.label}`;
        overlay.querySelector("#nv-comic-guide-title").textContent = step.title;
        overlay.querySelector("#nv-comic-guide-text").textContent = step.text;
        overlay.querySelector("#nv-comic-guide-checklist").innerHTML = step.checks.map((check, itemIndex) => `
            <div class="nv-comic-guide-check"><i>${itemIndex + 1}</i><span>${escapeHtml(check)}</span></div>
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
            document.querySelector("#editor-content .page-studio-card-v2")?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 220);
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
