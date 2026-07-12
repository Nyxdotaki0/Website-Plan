import { requireBetaAccess } from "./betaGate.js";
import { supabase } from "./supabaseClient.js";
import { initNullverseShell } from "./nullverse-shell.js";
import {
    bindCardInteractions,
    getPublicContentUrl,
    getSafetyDecision,
    renderContentCard,
    renderCreatorCard,
    renderEmptyCard,
    renderSkeletonCards,
    escapeHtml
} from "./nullverse-content-cards.js";
import { attachProfiles, fetchDiscoverCreators, fetchHomeFeed, loadViewerContext } from "./nullverse-data.js";

const currentUser = await requireBetaAccess();
if (!currentUser) throw new Error("Nullverse session unavailable.");
const viewer = await loadViewerContext(currentUser.id);
await initNullverseShell({ page: "explore", user: currentUser, profile: viewer.profile });

const params = new URLSearchParams(window.location.search);
const state = {
    search: params.get("q") || "",
    type: normalizeTypeParam(params.get("type") || ""),
    sort: params.get("sort") || "trending",
    rating: params.get("rating") || "",
    genre: params.get("genre") || "",
    creatorFilter: "all",
    offset: 0,
    pageSize: 18,
    loading: false,
    finished: false,
    allLoaded: []
};

hydrateControls();
setupControls();
document.getElementById("explore-results").innerHTML = renderSkeletonCards(8);
await Promise.all([resetResults(), loadCreators(), loadTags()]);

function hydrateControls() {
    document.getElementById("explore-search-input").value = state.search;
    document.getElementById("explore-sort").value = state.sort;
    document.getElementById("explore-rating").value = state.rating;
    document.getElementById("explore-genre").value = state.genre;
    syncTypeTabs();
}

function setupControls() {
    document.getElementById("explore-search-form").addEventListener("submit", event => {
        event.preventDefault();
        state.search = document.getElementById("explore-search-input").value.trim();
        resetResults();
    });

    document.querySelectorAll("[data-explore-type]").forEach(button => {
        button.addEventListener("click", () => {
            state.type = button.dataset.exploreType;
            syncTypeTabs();
            resetResults();
        });
    });

    document.getElementById("explore-filter-toggle").addEventListener("click", () => {
        document.getElementById("explore-filters").classList.toggle("open");
    });

    ["explore-sort", "explore-rating", "explore-genre", "explore-creator-filter"].forEach(id => {
        document.getElementById(id).addEventListener("change", () => {
            state.sort = document.getElementById("explore-sort").value;
            state.rating = document.getElementById("explore-rating").value;
            state.genre = document.getElementById("explore-genre").value;
            state.creatorFilter = document.getElementById("explore-creator-filter").value;
            resetResults();
        });
    });

    document.getElementById("explore-load-more").addEventListener("click", () => loadMore());
    document.getElementById("explore-random-button").addEventListener("click", openRandom);
}

function syncTypeTabs() {
    document.querySelectorAll("[data-explore-type]").forEach(button => {
        button.classList.toggle("active", button.dataset.exploreType === state.type);
    });
}

async function resetResults() {
    state.offset = 0;
    state.finished = false;
    state.allLoaded = [];
    document.getElementById("explore-results").innerHTML = renderSkeletonCards(8);
    updateUrl();
    await loadMore(true);
}

async function loadMore(replace = false) {
    if (state.loading || state.finished) return;
    state.loading = true;
    const button = document.getElementById("explore-load-more");
    button.disabled = true;
    button.textContent = "Loading...";

    try {
        let items = await queryContent();
        items = items.filter(item => !viewer.blockedUserIds.includes(item.owner_id));
        items = items.filter(matchesClientFilters);

        const container = document.getElementById("explore-results");
        if (replace) container.innerHTML = "";

        const html = items
            .map(item => renderContentCard(item, { safety: getSafetyDecision(item, viewer.safety) }))
            .filter(Boolean)
            .join("");

        if (!html && state.offset === 0) {
            container.innerHTML = renderEmptyCard("No matching creations", "Try removing a filter or searching for something broader.");
            state.finished = true;
        } else {
            container.insertAdjacentHTML("beforeend", html);
            state.allLoaded.push(...items);
            state.offset += items.length;
            state.finished = items.length < state.pageSize;
        }

        bindCardInteractions(container);
        document.getElementById("explore-count").textContent = state.finished
            ? `${state.allLoaded.length} visible results`
            : `${state.allLoaded.length}+ results`;
        updateResultTitle();
    } catch (error) {
        document.getElementById("explore-results").innerHTML = renderEmptyCard("Explore could not load", error.message || "Refresh and try again.");
        state.finished = true;
    } finally {
        state.loading = false;
        button.disabled = state.finished;
        button.textContent = state.finished ? "No more results" : "Load More";
    }
}

async function queryContent() {
    if (["trending", "popular"].includes(state.sort) && !state.type && !state.search && !state.rating && !state.genre && state.creatorFilter === "all") {
        const mode = state.sort === "popular" ? "popular" : "trending";
        const feed = await fetchHomeFeed(mode, state.pageSize * 2, state.offset);
        return state.type ? feed.filter(item => item.content_type === state.type) : feed;
    }

    let ownerIds = null;
    if (state.creatorFilter === "following") {
        const { data } = await supabase.from("follows").select("following_id").eq("follower_id", currentUser.id);
        ownerIds = (data || []).map(row => row.following_id);
        if (!ownerIds.length) return [];
    }

    let query = supabase
        .from("worlds")
        .select("*")
        .eq("visibility", "published")
        .eq("moderation_status", "visible");

    if (state.type) query = query.eq("content_type", state.type);
    if (state.rating) query = query.eq("content_rating", state.rating);
    if (state.genre) {
        const safe = sanitizeTerm(state.genre);
        query = query.or(`genres.ilike.%${safe}%,themes.ilike.%${safe}%`);
    }
    if (state.search) {
        const safe = sanitizeTerm(state.search);
        query = query.or(`title.ilike.%${safe}%,summary.ilike.%${safe}%,genres.ilike.%${safe}%,themes.ilike.%${safe}%`);
    }
    if (ownerIds) query = query.in("owner_id", ownerIds);

    const orderColumn = state.sort === "newest" ? "created_at" : "updated_at";
    query = query.order(orderColumn, { ascending: false }).range(state.offset, state.offset + state.pageSize - 1);

    const { data, error } = await query;
    if (error) throw error;
    let items = await attachProfiles(data || [], "owner_id");

    if (state.search) {
        const creatorMatches = await searchCreatorIds(state.search);
        if (creatorMatches.length) {
            const { data: creatorItems } = await supabase
                .from("worlds")
                .select("*")
                .eq("visibility", "published")
                .eq("moderation_status", "visible")
                .in("owner_id", creatorMatches)
                .limit(state.pageSize);
            const attached = await attachProfiles(creatorItems || [], "owner_id");
            const map = new Map(items.map(item => [item.id, item]));
            attached.forEach(item => map.set(item.id, item));
            items = [...map.values()];
        }
    }

    return attachLikeCounts(items);
}

function matchesClientFilters(item) {
    if (state.type && item.content_type !== state.type) return false;
    if (state.rating && item.content_rating !== state.rating) return false;
    if (state.genre) {
        const haystack = `${item.genres || ""} ${item.themes || ""}`.toLowerCase();
        if (!haystack.includes(state.genre.toLowerCase())) return false;
    }
    if (state.search) {
        const haystack = `${item.title || ""} ${item.summary || ""} ${item.genres || ""} ${item.themes || ""} ${item.username || ""} ${item.display_name || ""}`.toLowerCase();
        if (!haystack.includes(state.search.toLowerCase())) return false;
    }
    return true;
}

async function attachLikeCounts(items) {
    const ids = items.map(item => item.id).filter(Boolean);
    if (!ids.length) return items;
    const { data } = await supabase.from("world_likes").select("world_id").in("world_id", ids);
    const counts = {};
    (data || []).forEach(row => counts[row.world_id] = (counts[row.world_id] || 0) + 1);
    const output = items.map(item => ({ ...item, like_count: counts[item.id] || 0 }));
    if (state.sort === "popular") output.sort((a, b) => b.like_count - a.like_count);
    return output;
}

async function searchCreatorIds(search) {
    const safe = sanitizeTerm(search);
    const { data } = await supabase
        .from("profiles")
        .select("id")
        .or(`username.ilike.%${safe}%,display_name.ilike.%${safe}%`)
        .limit(30);
    return (data || []).map(row => row.id);
}

async function loadCreators() {
    const container = document.getElementById("explore-creators");
    container.innerHTML = renderSkeletonCards(3);
    try {
        const creators = (await fetchDiscoverCreators(8)).filter(item => !viewer.blockedUserIds.includes(item.id));
        container.innerHTML = creators.length
            ? creators.map(renderCreatorCard).join("")
            : renderEmptyCard("No creators found", "Creator recommendations will appear here.");
    } catch (error) {
        container.innerHTML = renderEmptyCard("Could not load creators", error.message || "Refresh and try again.");
    }
}

async function loadTags() {
    const container = document.getElementById("explore-tags");
    const { data } = await supabase
        .from("worlds")
        .select("genres, themes")
        .eq("visibility", "published")
        .eq("moderation_status", "visible")
        .limit(250);

    const counts = new Map();
    (data || []).flatMap(item => [item.genres, item.themes])
        .flatMap(value => String(value || "").split(","))
        .map(value => value.trim())
        .filter(Boolean)
        .forEach(tag => counts.set(tag, (counts.get(tag) || 0) + 1));

    const tags = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 22);
    container.innerHTML = tags.length ? tags.map(([tag, count]) => `
        <button class="explore-tag-button" type="button" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)} · ${count}</button>`).join("") : `<span class="explore-count">No tags yet.</span>`;

    container.querySelectorAll("[data-tag]").forEach(button => {
        button.addEventListener("click", () => {
            state.genre = button.dataset.tag;
            const select = document.getElementById("explore-genre");
            if ([...select.options].some(option => option.value === state.genre)) select.value = state.genre;
            else {
                state.search = state.genre;
                document.getElementById("explore-search-input").value = state.search;
            }
            resetResults();
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    });
}

async function openRandom() {
    const items = state.allLoaded.filter(item => getSafetyDecision(item, viewer.safety).action !== "hide");
    if (!items.length) {
        const fallback = await fetchHomeFeed("trending", 24, 0);
        items.push(...fallback.filter(item => getSafetyDecision(item, viewer.safety).action !== "hide"));
    }
    if (!items.length) return;
    window.location.href = getPublicContentUrl(items[Math.floor(Math.random() * items.length)]);
}

function updateResultTitle() {
    const labels = { world: "Worlds", literature: "Literature", comic: "Comics", manga: "Manga" };
    const typeLabel = labels[state.type] || "Creations";
    document.getElementById("explore-results-title").textContent = state.search ? `Results for “${state.search}”` : `Discover ${typeLabel}`;
}

function updateUrl() {
    const next = new URL(window.location.href);
    setOrDelete(next.searchParams, "q", state.search);
    setOrDelete(next.searchParams, "type", state.type);
    setOrDelete(next.searchParams, "sort", state.sort === "trending" ? "" : state.sort);
    setOrDelete(next.searchParams, "rating", state.rating);
    setOrDelete(next.searchParams, "genre", state.genre);
    history.replaceState(null, "", next);
}

function setOrDelete(params, key, value) {
    if (value) params.set(key, value);
    else params.delete(key);
}

function sanitizeTerm(value) {
    return String(value || "").replace(/[,%()]/g, " ").trim();
}

function normalizeTypeParam(value) {
    const clean = String(value || "").toLowerCase();
    return ["world", "literature", "comic", "manga"].includes(clean) ? clean : "";
}
