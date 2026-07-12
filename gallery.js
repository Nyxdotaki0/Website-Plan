import { requireBetaAccess } from "./betaGate.js";
import { initNullverseShell } from "./nullverse-shell.js";
import {
    bindCardInteractions,
    normalizeWarningList,
    renderCreatorCard,
    renderEmptyCard,
    renderGalleryCard,
    renderSkeletonCards
} from "./nullverse-content-cards.js?v=3";
import { fetchDiscoverCreators, fetchGalleryFeed, loadViewerContext } from "./nullverse-data.js";

const currentUser = await requireBetaAccess();
if (!currentUser) throw new Error("Nullverse session unavailable.");
const viewer = await loadViewerContext(currentUser.id);
await initNullverseShell({ page: "gallery", user: currentUser, profile: viewer.profile });

if (viewer.profile?.username) {
    const base = `creator-gallery.html?user=${encodeURIComponent(viewer.profile.username)}`;
    document.getElementById("gallery-my-gallery").href = base;
    document.getElementById("gallery-add-item").href = `${base}&new=item`;
}

const state = {
    search: "",
    sort: "trending",
    ageRating: "",
    proofType: "",
    offset: 0,
    pageSize: 20,
    loading: false,
    finished: false,
    loaded: 0,
    searchTimer: null
};

const revealedWarningItemIds = new Set();
let pendingWarningCard = null;

setupControls();
setupWarningConfirmation();
document.getElementById("gallery-results").innerHTML = renderSkeletonCards(10);
await Promise.all([resetGallery(), loadCreators()]);

function setupControls() {
    document.getElementById("gallery-search").addEventListener("input", event => {
        state.search = event.target.value.trim();
        clearTimeout(state.searchTimer);
        state.searchTimer = setTimeout(resetGallery, 280);
    });

    document.getElementById("gallery-sort").addEventListener("change", event => {
        state.sort = event.target.value;
        resetGallery();
    });

    document.getElementById("gallery-rating").addEventListener("change", event => {
        state.ageRating = event.target.value;
        resetGallery();
    });

    document.getElementById("gallery-proof-type").addEventListener("change", event => {
        state.proofType = event.target.value;
        resetGallery();
    });

    document.getElementById("gallery-load-more").addEventListener("click", () => loadMore());
}

async function resetGallery() {
    state.offset = 0;
    state.loaded = 0;
    state.finished = false;
    document.getElementById("gallery-results").innerHTML = renderSkeletonCards(10);
    await loadMore(true);
}

async function loadMore(replace = false) {
    if (state.loading || state.finished) return;
    state.loading = true;
    const button = document.getElementById("gallery-load-more");
    button.disabled = true;
    button.textContent = "Loading...";

    try {
        let rawItems = [];
        let visibleCards = [];
        let attempts = 0;
        let reachedEnd = false;

        // Safe Mode can remove an entire result batch. Keep advancing until we
        // find allowed cards or reach the end so safe content later in the feed
        // is not incorrectly replaced by an empty state.
        while (!visibleCards.length && !reachedEnd && attempts < 6) {
            rawItems = await fetchGalleryFeed(state.sort, state.pageSize, state.offset, {
                search: state.search,
                ageRating: state.ageRating
            });

            state.offset += rawItems.length;
            reachedEnd = rawItems.length < state.pageSize;

            let items = rawItems.filter(item => !viewer.blockedUserIds.includes(item.owner_id));
            if (state.proofType) items = items.filter(item => item.proof_type === state.proofType);

            visibleCards = items
                .map(item => renderGalleryCard(item, {
                    safety: getGallerySafetyDecision(item),
                    galleryDestination: "creator",
                    showGalleryActions: true,
                    requireWarningConfirmation: true,
                    warningRevealed: revealedWarningItemIds.has(String(item.id || "")),
                    viewerRole: viewer.profile?.role_name || viewer.profile?.role || "creator",
                    viewerStatus: viewer.profile?.account_status || "active"
                }))
                .filter(Boolean);

            attempts += 1;
            if (!rawItems.length) reachedEnd = true;
        }

        const html = visibleCards.join("");
        const container = document.getElementById("gallery-results");
        if (replace) container.innerHTML = "";

        if (!html && state.loaded === 0) {
            container.innerHTML = renderEmptyCard("No matching gallery items", "No artwork matches your search, filters, and Content Experience settings.");
        } else if (html) {
            if (state.loaded === 0 && container.querySelector(".nv-empty-card")) {
                container.innerHTML = "";
            }
            container.insertAdjacentHTML("beforeend", html);
            state.loaded += visibleCards.length;
        }

        state.finished = reachedEnd;

        bindCardInteractions(container);
        bindGalleryWarningGates(container);
        document.getElementById("gallery-count").textContent = state.finished ? `${state.loaded} visible items` : `${state.loaded}+ items`;
    } catch (error) {
        document.getElementById("gallery-results").innerHTML = renderEmptyCard("Gallery could not load", error.message || "Refresh and try again.");
        state.finished = true;
    } finally {
        state.loading = false;
        button.disabled = state.finished;
        button.textContent = state.finished ? "No more artwork" : "Load More";
    }
}

async function loadCreators() {
    const container = document.getElementById("gallery-creators");
    container.innerHTML = renderSkeletonCards(4);
    try {
        const creators = (await fetchDiscoverCreators(10))
            .filter(item => !viewer.blockedUserIds.includes(item.id))
            .filter(item => Number(item.gallery_count || item.content_count || 0) > 0);
        container.innerHTML = creators.length
            ? creators.map(renderCreatorCard).join("")
            : renderEmptyCard("No visual creators yet", "Creators with public gallery work will appear here.");
    } catch (error) {
        container.innerHTML = renderEmptyCard("Could not load creators", error.message || "Refresh and try again.");
    }
}

function normalizeViewerExperience(value) {
    const normalized = String(value || "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");

    if (["safe", "strict"].includes(normalized)) return "safe";
    if (["open", "adult", "all", "unfiltered", "full"].includes(normalized)) return "open";
    return "balanced";
}

function getGallerySafetyDecision(item = {}) {
    const warnings = normalizeWarningList(item.content_warnings);
    const blockedWarnings = new Set(normalizeWarningList(viewer.safety?.blockedContentWarnings));
    const rating = String(item.content_rating || item.age_rating || "general").trim().toLowerCase();
    const censorMode = String(item.censor_mode || "none").trim().toLowerCase();
    const ageRole = String(viewer.safety?.ageRole || "unknown").trim().toLowerCase();
    const experience = normalizeViewerExperience(viewer.safety?.contentExperience);
    const isMature = ["mature", "adult", "18+", "18_plus"].includes(rating);
    const explicitlyBlocked = warnings.some(warning => blockedWarnings.has(warning));
    const isSensitive = warnings.length > 0 || censorMode === "blur" || censorMode === "hide" || isMature;

    // Manual warning blocks and age restrictions remain absolute in every mode.
    if (explicitlyBlocked) return { action: "hide", warnings, rating, reason: "blocked_preference" };
    if (isMature && ageRole !== "adult") return { action: "hide", warnings, rating, reason: "age_block" };

    // Safe removes sensitive gallery content entirely.
    if (experience === "safe" && isSensitive) {
        return { action: "hide", warnings, rating, reason: "safe_mode" };
    }

    // Balanced keeps the existing blur + warning confirmation system.
    if (experience === "balanced" && isSensitive) {
        return { action: "warn", warnings, rating, reason: "confirmation_required" };
    }

    // Open displays all otherwise allowed content with no blur or warning labels.
    return { action: "show", warnings: [], rating, reason: "open_or_clear" };
}

function setupWarningConfirmation() {
    const modal = document.getElementById("gallery-warning-modal");
    const closeButton = document.getElementById("gallery-warning-close");
    const cancelButton = document.getElementById("gallery-warning-cancel");
    const confirmButton = document.getElementById("gallery-warning-confirm");

    if (!modal || !closeButton || !cancelButton || !confirmButton) return;

    closeButton.addEventListener("click", closeGalleryWarningModal);
    cancelButton.addEventListener("click", closeGalleryWarningModal);
    confirmButton.addEventListener("click", revealPendingGalleryWarning);
    modal.addEventListener("click", event => {
        if (event.target === modal) closeGalleryWarningModal();
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && modal.classList.contains("open")) {
            closeGalleryWarningModal();
        }
    });
}

function bindGalleryWarningGates(root = document) {
    root.querySelectorAll("[data-nv-gallery-warning-gate]").forEach(button => {
        if (button.dataset.bound === "true") return;
        button.dataset.bound = "true";
        button.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            openGalleryWarningModal(button);
        });
    });
}

function openGalleryWarningModal(button) {
    const modal = document.getElementById("gallery-warning-modal");
    const title = document.getElementById("gallery-warning-title");
    const summary = document.getElementById("gallery-warning-summary");
    const tags = document.getElementById("gallery-warning-tags");
    const confirmButton = document.getElementById("gallery-warning-confirm");
    if (!modal || !title || !summary || !tags || !confirmButton) return;

    pendingWarningCard = button.closest(".nv-gallery-card");
    const itemTitle = button.dataset.galleryItemTitle || "Gallery item";
    const warningSummary = button.dataset.galleryWarningSummary || "Sensitive content";
    const warningTags = String(button.dataset.galleryWarningTags || warningSummary)
        .split("|")
        .map(value => value.trim())
        .filter(Boolean);

    title.textContent = `Content Warning: ${itemTitle}`;
    summary.textContent = `${warningSummary}. Confirm that you want to reveal this preview.`;
    tags.replaceChildren(...warningTags.map(label => {
        const chip = document.createElement("span");
        chip.className = "gallery-warning-tag";
        chip.textContent = label;
        return chip;
    }));

    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("gallery-warning-modal-open");
    window.setTimeout(() => confirmButton.focus(), 0);
}

function closeGalleryWarningModal() {
    const modal = document.getElementById("gallery-warning-modal");
    const gate = pendingWarningCard?.querySelector("[data-nv-gallery-warning-gate]");
    modal?.classList.remove("open");
    modal?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("gallery-warning-modal-open");
    pendingWarningCard = null;
    gate?.focus();
}

function revealPendingGalleryWarning() {
    const card = pendingWarningCard;
    if (!card) return closeGalleryWarningModal();

    const itemId = String(card.dataset.galleryItemId || "");
    if (itemId) revealedWarningItemIds.add(itemId);

    card.classList.remove("warning-gated", "warning-hidden");
    card.classList.add("warning-revealed");
    card.querySelectorAll("[data-nv-protected-href]").forEach(link => {
        link.setAttribute("href", link.dataset.nvProtectedHref || "#");
        link.removeAttribute("data-nv-protected-href");
        link.removeAttribute("aria-disabled");
        link.removeAttribute("tabindex");
    });

    const firstLink = card.querySelector(".nv-card-media");
    closeGalleryWarningModal();
    window.setTimeout(() => firstLink?.focus(), 0);
}

