import { requireBetaAccess } from "./betaGate.js";
import { initNullverseShell } from "./nullverse-shell.js";
import {
    bindCardInteractions,
    getSafetyDecision,
    renderCreatorCard,
    renderEmptyCard,
    renderGalleryCard,
    renderSkeletonCards
} from "./nullverse-content-cards.js?v=2";
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

setupControls();
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
        let items = await fetchGalleryFeed(state.sort, state.pageSize, state.offset, {
            search: state.search,
            ageRating: state.ageRating
        });

        items = items.filter(item => !viewer.blockedUserIds.includes(item.owner_id));
        if (state.proofType) items = items.filter(item => item.proof_type === state.proofType);

        const html = items
            .map(item => renderGalleryCard(item, {
                safety: getSafetyDecision(item, viewer.safety),
                galleryDestination: "creator",
                showGalleryActions: true,
                viewerRole: viewer.profile?.role_name || viewer.profile?.role || "creator",
                viewerStatus: viewer.profile?.account_status || "active"
            }))
            .filter(Boolean)
            .join("");

        const container = document.getElementById("gallery-results");
        if (replace) container.innerHTML = "";

        if (!html && state.offset === 0) {
            container.innerHTML = renderEmptyCard("No matching gallery items", "Try another search or remove a filter.");
            state.finished = true;
        } else {
            container.insertAdjacentHTML("beforeend", html);
            state.offset += items.length;
            state.loaded += items.length;
            state.finished = items.length < state.pageSize;
        }

        bindCardInteractions(container);
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
