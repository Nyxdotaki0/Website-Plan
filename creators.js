import { requireBetaAccess } from "./betaGate.js";
import { supabase } from "./supabaseClient.js";
import { initNullverseShell } from "./nullverse-shell.js?v=7";
import { escapeHtml, renderEmptyCard, renderSkeletonCards } from "./nullverse-content-cards.js?v=7";
import { loadViewerContext } from "./nullverse-data.js?v=7";

const currentUser = await requireBetaAccess();
if (!currentUser) throw new Error("Nullverse session unavailable.");
const viewer = await loadViewerContext(currentUser.id);
await initNullverseShell({ page: "creators", user: currentUser, profile: viewer.profile });

const params = new URLSearchParams(location.search);
const state = {
    search: params.get("q") || "",
    creatorType: params.get("type") || "",
    mode: params.get("mode") || "for_you",
    privacy: params.get("privacy") || "all",
    requireGallery: params.get("gallery") === "1",
    requireContent: params.get("content") === "1",
    offset: 0,
    pageSize: 24,
    loaded: 0,
    loading: false,
    finished: false
};

hydrateControls();
bindControls();
document.getElementById("creators-results").innerHTML = renderSkeletonCards(8);
await resetCreators();

function hydrateControls() {
    document.getElementById("creators-search").value = state.search;
    document.getElementById("creators-type").value = state.creatorType;
    document.getElementById("creators-privacy").value = state.privacy;
    document.getElementById("creators-has-gallery").checked = state.requireGallery;
    document.getElementById("creators-has-content").checked = state.requireContent;
    document.querySelectorAll("[data-creator-mode]").forEach(button => button.classList.toggle("active", button.dataset.creatorMode === state.mode));
}

function bindControls() {
    document.getElementById("creators-search-form").addEventListener("submit", event => {
        event.preventDefault();
        state.search = document.getElementById("creators-search").value.trim();
        resetCreators();
    });

    document.querySelectorAll("[data-creator-mode]").forEach(button => {
        button.addEventListener("click", () => {
            state.mode = button.dataset.creatorMode || "for_you";
            document.querySelectorAll("[data-creator-mode]").forEach(item => item.classList.toggle("active", item === button));
            resetCreators();
        });
    });

    ["creators-type", "creators-privacy", "creators-has-gallery", "creators-has-content"].forEach(id => {
        document.getElementById(id).addEventListener("change", () => {
            state.creatorType = document.getElementById("creators-type").value;
            state.privacy = document.getElementById("creators-privacy").value;
            state.requireGallery = document.getElementById("creators-has-gallery").checked;
            state.requireContent = document.getElementById("creators-has-content").checked;
            resetCreators();
        });
    });

    document.getElementById("creators-load-more").addEventListener("click", () => loadCreators());
    document.getElementById("creators-random").addEventListener("click", openRandomCreator);

    document.getElementById("creators-results").addEventListener("click", async event => {
        const button = event.target.closest("[data-creator-follow]");
        if (!button) return;
        event.preventDefault();
        await toggleCreatorFollow(button);
    });
}

async function resetCreators() {
    state.offset = 0;
    state.loaded = 0;
    state.finished = false;
    document.getElementById("creators-results").innerHTML = renderSkeletonCards(8);
    updateUrl();
    updateHeading();
    await loadCreators(true);
}

async function loadCreators(replace = false) {
    if (state.loading || state.finished) return;
    state.loading = true;
    const button = document.getElementById("creators-load-more");
    button.disabled = true;
    button.textContent = "Loading...";

    try {
        const { data, error } = await supabase.rpc("nv_creator_directory", {
            p_search: state.search || null,
            p_creator_type: state.creatorType || null,
            p_mode: state.mode,
            p_privacy: state.privacy,
            p_require_gallery: state.requireGallery,
            p_require_content: state.requireContent,
            p_limit: state.pageSize,
            p_offset: state.offset
        });
        if (error) throw new Error(`${error.message} Run SUPABASE_CREATOR_PRIVACY_DISCOVERY.sql before testing this page.`);

        const creators = (data || []).filter(profile => !viewer.blockedUserIds.includes(profile.id));
        const container = document.getElementById("creators-results");
        if (replace) container.innerHTML = "";

        if (!creators.length && state.loaded === 0) {
            container.innerHTML = renderEmptyCard(
                state.mode === "following" ? "You are not following any matching creators" : "No creators match these filters",
                state.mode === "following" ? "Follow creators from this directory and they will appear here." : "Try a broader search or remove one of the filters."
            );
        } else {
            container.insertAdjacentHTML("beforeend", creators.map(renderDirectoryCard).join(""));
            state.loaded += creators.length;
        }

        state.offset += creators.length;
        state.finished = creators.length < state.pageSize;
        document.getElementById("creators-count").textContent = state.finished ? `${state.loaded} creators` : `${state.loaded}+ creators`;
    } catch (error) {
        document.getElementById("creators-results").innerHTML = renderEmptyCard("Creators could not load", error.message || "Refresh and try again.");
        state.finished = true;
    } finally {
        state.loading = false;
        button.disabled = state.finished;
        button.textContent = state.finished ? "No more creators" : "Load More";
    }
}

function renderDirectoryCard(profile) {
    const username = profile.username || "creator";
    const displayName = profile.display_name || username;
    const avatar = profile.avatar_url || "https://placehold.co/160x160/1b1b28/ffffff?text=NV";
    const bannerStyle = profile.banner_url ? ` style="background-image:url('${escapeCssUrl(profile.banner_url)}')"` : "";
    const isPrivate = profile.profile_visibility === "private";
    const relationship = profile.relationship_state || "none";
    const followLabel = relationship === "following" ? "Following" : relationship === "requested" ? "Requested" : profile.follows_you ? "Follow Back" : isPrivate ? "Request" : "Follow";
    const galleryCount = Number(profile.gallery_count || 0);
    const contentCount = Number(profile.content_count || 0);
    const canOpenGallery = !isPrivate || relationship === "following" || galleryCount > 0;

    return `
        <article class="creator-directory-card" data-creator-id="${escapeHtml(profile.id)}">
            <div class="creator-directory-banner"${bannerStyle}></div>
            ${isPrivate ? `<span class="creator-directory-lock">Private</span>` : ""}
            <div class="creator-directory-body">
                <div class="creator-directory-avatar"><img src="${escapeHtml(avatar)}" alt="" loading="lazy"></div>
                <h3><a href="profile.html?user=${encodeURIComponent(username)}">${escapeHtml(displayName)}</a></h3>
                <div class="creator-directory-handle">@${escapeHtml(username)}</div>
                <div class="creator-directory-type">${escapeHtml(profile.creator_type || "Creator")}${profile.profile_status ? ` · ${escapeHtml(profile.profile_status)}` : ""}</div>
                <p class="creator-directory-bio">${escapeHtml(profile.bio || (isPrivate ? "Private creator profile. Send a request to see their published work." : "This creator has not added a bio yet."))}</p>
                <div class="creator-directory-stats">
                    <span>${formatCount(profile.follower_count)} followers</span>
                    <span>${formatCount(contentCount)} creations available</span>
                    <span>${formatCount(galleryCount)} gallery items available</span>
                </div>
                <div class="creator-directory-actions">
                    <a class="creators-button" href="profile.html?user=${encodeURIComponent(username)}">View Profile</a>
                    <button class="creators-button creator-follow-action ${escapeHtml(relationship)}" type="button" data-creator-follow="${escapeHtml(profile.id)}">${escapeHtml(followLabel)}</button>
                    ${canOpenGallery ? `<a class="creators-button" href="creator-gallery.html?user=${encodeURIComponent(username)}">Open Gallery</a>` : `<span class="creators-button" aria-disabled="true">Gallery Locked</span>`}
                </div>
            </div>
        </article>
    `;
}

async function toggleCreatorFollow(button) {
    if (button.disabled) return;
    const creatorId = button.dataset.creatorFollow;
    button.disabled = true;
    const oldLabel = button.textContent;
    button.textContent = "Updating...";

    try {
        const { data, error } = await supabase.rpc("nv_follow_toggle", { p_target_id: creatorId });
        if (error) throw error;
        const result = Array.isArray(data) ? data[0] : data;
        const relationship = result?.relationship_state || "none";
        button.classList.remove("none", "following", "requested");
        button.classList.add(relationship);
        button.textContent = relationship === "following" ? "Following" : relationship === "requested" ? "Requested" : "Follow";

        const card = button.closest(".creator-directory-card");
        if (card && relationship === "following") {
            const locked = card.querySelector('[aria-disabled="true"]');
            const username = card.querySelector(".creator-directory-handle")?.textContent?.replace(/^@/, "") || "";
            if (locked && username) locked.outerHTML = `<a class="creators-button" href="creator-gallery.html?user=${encodeURIComponent(username)}">Open Gallery</a>`;
        }
    } catch (error) {
        alert(error.message || "Could not update this follow relationship.");
        button.textContent = oldLabel;
    } finally {
        button.disabled = false;
    }
}

async function openRandomCreator() {
    const button = document.getElementById("creators-random");
    button.disabled = true;
    button.textContent = "Finding...";
    try {
        const recent = readRecentIds("nv-random-creators");
        let { data, error } = await supabase.rpc("nv_random_creator", {
            p_search: state.search || null,
            p_creator_type: state.creatorType || null,
            p_mode: state.mode,
            p_privacy: state.privacy,
            p_require_gallery: state.requireGallery,
            p_require_content: state.requireContent,
            p_exclude_ids: recent
        });
        if (error) throw error;
        let creator = Array.isArray(data) ? data[0] : data;

        if (!creator && recent.length) {
            ({ data, error } = await supabase.rpc("nv_random_creator", {
                p_search: state.search || null,
                p_creator_type: state.creatorType || null,
                p_mode: state.mode,
                p_privacy: state.privacy,
                p_require_gallery: state.requireGallery,
                p_require_content: state.requireContent,
                p_exclude_ids: []
            }));
            if (error) throw error;
            creator = Array.isArray(data) ? data[0] : data;
        }

        if (!creator?.username) throw new Error("No creators match the current filters.");
        rememberRecentId("nv-random-creators", creator.id);
        location.href = `profile.html?user=${encodeURIComponent(creator.username)}`;
    } catch (error) {
        alert(error.message || "Could not find a random creator.");
        button.disabled = false;
        button.textContent = "Random Creator";
    }
}

function updateHeading() {
    const labels = { for_you: "Creators for You", trending: "Trending Creators", newest: "Newest Creators", following: "Creators You Follow" };
    document.getElementById("creators-title").textContent = labels[state.mode] || labels.for_you;
}

function updateUrl() {
    const next = new URL(location.href);
    setOrDelete(next.searchParams, "q", state.search);
    setOrDelete(next.searchParams, "type", state.creatorType);
    setOrDelete(next.searchParams, "mode", state.mode === "for_you" ? "" : state.mode);
    setOrDelete(next.searchParams, "privacy", state.privacy === "all" ? "" : state.privacy);
    setOrDelete(next.searchParams, "gallery", state.requireGallery ? "1" : "");
    setOrDelete(next.searchParams, "content", state.requireContent ? "1" : "");
    history.replaceState({}, "", next);
}

function setOrDelete(params, key, value) { value ? params.set(key, value) : params.delete(key); }
function formatCount(value) { return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0)); }
function escapeCssUrl(value) { return String(value || "").replace(/[\\'"\n\r]/g, match => `\\${match}`); }
function readRecentIds(key) { try { const value = JSON.parse(sessionStorage.getItem(key) || "[]"); return Array.isArray(value) ? value.slice(0, 12) : []; } catch { return []; } }
function rememberRecentId(key, id) { const next = [id, ...readRecentIds(key).filter(item => item !== id)].slice(0, 12); sessionStorage.setItem(key, JSON.stringify(next)); }
// JavaScript source code
