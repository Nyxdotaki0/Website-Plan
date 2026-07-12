import { requireBetaAccess } from "./betaGate.js";
import { supabase } from "./supabaseClient.js";
import { initNullverseShell } from "./nullverse-shell.js";
import {
    bindCardInteractions,
    getEditorContentUrl,
    getPublicContentUrl,
    getSafetyDecision,
    renderActivityCard,
    renderContentCard,
    renderEmptyCard,
    renderGalleryCard,
    renderProjectCard,
    renderSkeletonCards,
    timeAgo,
    escapeHtml
} from "./nullverse-content-cards.js";
import {
    attachProfiles,
    fetchDiscoverCreators,
    fetchFeaturedContent,
    fetchFollowingActivity,
    fetchGalleryFeed,
    fetchHomeFeed,
    fetchRecentContent,
    loadViewerContext
} from "./nullverse-data.js";

const currentUser = await requireBetaAccess();
if (!currentUser) throw new Error("Nullverse session unavailable.");

const viewer = await loadViewerContext(currentUser.id);
const profile = viewer.profile;
await initNullverseShell({ page: "home", user: currentUser, profile });

const state = {
    feedMode: "for_you",
    feedOffset: 0,
    pageSize: 8,
    feedFinished: false,
    feedLoading: false
};

setupWelcome();
setupFeedTabs();
setupRandomDiscovery();
paintInitialSkeletons();

await Promise.all([
    loadContinueSection(),
    loadSpotlight(),
    resetFeed("for_you"),
    loadGalleryShelf(),
    loadTypeShelf("literature", "home-literature-shelf"),
    loadTypeShelf("comic", "home-comic-shelf"),
    loadTypeShelf("world", "home-world-shelf"),
    loadFollowingActivity(),
    loadCreatorSuggestions(),
    loadAnnouncement()
]);

function setupWelcome() {
    const displayName = profile?.display_name || profile?.username || "Creator";
    document.getElementById("home-welcome-title").textContent = `Welcome back, ${displayName}.`;

    if (profile?.username) {
        document.getElementById("home-gallery-quick").href = `creator-gallery.html?user=${encodeURIComponent(profile.username)}&new=item`;
    }
}

function setupFeedTabs() {
    document.querySelectorAll("[data-home-feed]").forEach(button => {
        button.addEventListener("click", () => resetFeed(button.dataset.homeFeed));
    });

    document.getElementById("home-load-more").addEventListener("click", loadMoreFeed);
}

function setupRandomDiscovery() {
    document.getElementById("home-random-button").addEventListener("click", async () => {
        const items = await fetchHomeFeed("trending", 20, 0);
        const visible = items.filter(item => getSafetyDecision(item, viewer.safety).action !== "hide");
        if (!visible.length) {
            window.location.href = "explore.html";
            return;
        }
        const item = visible[Math.floor(Math.random() * visible.length)];
        window.location.href = getPublicContentUrl(item);
    });
}

function paintInitialSkeletons() {
    document.getElementById("home-continue-grid").innerHTML = renderSkeletonCards(2);
    document.getElementById("home-feed").innerHTML = renderSkeletonCards(4);
    ["home-gallery-shelf", "home-literature-shelf", "home-comic-shelf", "home-world-shelf"].forEach(id => {
        document.getElementById(id).innerHTML = renderSkeletonCards(4);
    });
}

async function loadContinueSection() {
    const container = document.getElementById("home-continue-grid");

    const [projectsResult, galleryResult, recent] = await Promise.all([
        supabase.from("worlds").select("*").eq("owner_id", currentUser.id).order("updated_at", { ascending: false }).limit(4),
        supabase.from("creator_proof_gallery").select("*").eq("owner_id", currentUser.id).order("updated_at", { ascending: false }).limit(2),
        fetchRecentContent(currentUser.id, 4)
    ]);

    const projects = projectsResult.data || [];
    const gallery = (galleryResult.data || []).map(item => ({ ...item, __kind: "gallery" }));
    const creationItems = [...projects, ...gallery]
        .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
        .slice(0, 2);

    const creationHtml = creationItems.length
        ? creationItems.map(renderProjectCard).join("")
        : renderEmptyCard("Start your first project", "Create a World, Literature project, Comic, or Gallery item.", { href: "create-world.html", label: "Create Something" });

    let recentHtml = "";
    if (recent.length) {
        recentHtml = recent.slice(0, 2).map(item => {
            const normalized = {
                ...item,
                id: item.content_id,
                title: item.title || "Continue Reading",
                summary: item.progress_label || "Return to where you left off.",
                cover_image_url: item.image_url,
                content_type: item.content_type,
                updated_at: item.last_opened_at,
                display_name: "Your reading progress",
                username: profile?.username,
                avatar_url: profile?.avatar_url,
                like_count: 0
            };
            return renderContentCard(normalized, { safety: { action: "show", warnings: [] } });
        }).join("");
    } else {
        recentHtml = renderEmptyCard("Nothing waiting yet", "Open Literature, Comics, or Worlds and your recent journey will appear here.", { href: "explore.html", label: "Find Something" });
    }

    container.innerHTML = `<div>${creationHtml}</div><div>${recentHtml}</div>`;
    bindCardInteractions(container);
}

async function loadSpotlight() {
    const container = document.getElementById("home-spotlight");
    const featured = await fetchFeaturedContent(5);
    let item = featured.find(entry => entry.feature_type !== "announcement") || null;

    if (!item) {
        const fallback = await fetchHomeFeed("trending", 1, 0);
        if (fallback.length) {
            const content = fallback[0];
            item = {
                feature_type: content.content_type || "world",
                title: content.title,
                description: content.summary,
                image_url: content.cover_image_url,
                link: getPublicContentUrl(content),
                creator_label: content.display_name || content.username || "Nullverse Creator"
            };
        }
    }

    if (!item) {
        container.innerHTML = `
            <div class="home-spotlight-shade"></div>
            <div class="home-spotlight-content">
                <span class="home-spotlight-label">Nullverse Spotlight</span>
                <h2>Only you can fill the void.</h2>
                <p>Discover living worlds, stories, comics, artwork, and creators across Nullverse.</p>
                <div class="home-hero-actions"><a class="home-action" href="explore.html">Explore Nullverse</a></div>
            </div>`;
        return;
    }

    container.innerHTML = `
        <div class="home-spotlight-media" style="background-image:url('${escapeCssUrl(item.image_url || "https://placehold.co/1600x900/111118/ffffff?text=Nullverse+Spotlight")}')"></div>
        <div class="home-spotlight-shade"></div>
        <div class="home-spotlight-content">
            <span class="home-spotlight-label">${escapeHtml(formatFeatureLabel(item.feature_type))}</span>
            <h2>${escapeHtml(item.title || "Featured in Nullverse")}</h2>
            <p>${escapeHtml(item.description || "A creation selected from across Nullverse.")}</p>
            ${item.creator_label ? `<p style="font-size:.82rem;margin-top:9px;">By ${escapeHtml(item.creator_label)}</p>` : ""}
            <div class="home-hero-actions"><a class="home-action" href="${escapeHtml(item.link || "explore.html")}">Open Spotlight</a></div>
        </div>`;
}

async function resetFeed(mode) {
    state.feedMode = mode;
    state.feedOffset = 0;
    state.feedFinished = false;
    document.getElementById("home-feed").innerHTML = renderSkeletonCards(4);

    document.querySelectorAll("[data-home-feed]").forEach(button => {
        button.classList.toggle("active", button.dataset.homeFeed === mode);
    });

    const titles = {
        for_you: "For You",
        following: "From Creators You Follow",
        trending: "Trending Across Nullverse",
        newest: "Newest Creations"
    };
    document.getElementById("home-feed-title").textContent = titles[mode] || "For You";
    await loadMoreFeed(true);
}

async function loadMoreFeed(replace = false) {
    if (state.feedLoading || state.feedFinished) return;
    state.feedLoading = true;
    const button = document.getElementById("home-load-more");
    button.disabled = true;
    button.textContent = "Loading...";

    try {
        const items = await fetchHomeFeed(state.feedMode, state.pageSize, state.feedOffset);
        const html = items
            .map(item => renderContentCard(item, { safety: getSafetyDecision(item, viewer.safety) }))
            .filter(Boolean)
            .join("");

        const container = document.getElementById("home-feed");
        if (replace) container.innerHTML = "";

        if (!html && state.feedOffset === 0) {
            container.innerHTML = renderEmptyCard(
                state.feedMode === "following" ? "Your following feed is empty" : "No creations found",
                state.feedMode === "following" ? "Follow creators from Explore to see their new work here." : "The void is quiet right now.",
                { href: "explore.html", label: "Explore Creators" }
            );
            state.feedFinished = true;
        } else {
            container.insertAdjacentHTML("beforeend", html);
            state.feedOffset += items.length;
            state.feedFinished = items.length < state.pageSize;
        }

        bindCardInteractions(container);
    } catch (error) {
        document.getElementById("home-feed").innerHTML = renderEmptyCard("Could not load the feed", error.message || "Refresh and try again.");
    } finally {
        state.feedLoading = false;
        button.disabled = state.feedFinished;
        button.textContent = state.feedFinished ? "You reached the edge" : "Load More";
    }
}

async function loadGalleryShelf() {
    const container = document.getElementById("home-gallery-shelf");
    try {
        const items = await fetchGalleryFeed("trending", 8, 0);
        const html = items
            .map(item => renderGalleryCard(item, { safety: getSafetyDecision(item, viewer.safety) }))
            .filter(Boolean)
            .join("");
        container.innerHTML = html || renderEmptyCard("No public gallery items yet", "Artwork will appear here as creators publish it.");
        bindCardInteractions(container);
    } catch (error) {
        container.innerHTML = renderEmptyCard("Gallery unavailable", error.message || "Refresh and try again.");
    }
}

async function loadTypeShelf(type, containerId) {
    const container = document.getElementById(containerId);
    try {
        const { data, error } = await supabase
            .from("worlds")
            .select("*")
            .eq("visibility", "published")
            .eq("moderation_status", "visible")
            .eq("content_type", type)
            .order("updated_at", { ascending: false })
            .limit(8);
        if (error) throw error;
        const items = await attachProfiles(data || [], "owner_id");
        const html = items
            .map(item => renderContentCard(item, { safety: getSafetyDecision(item, viewer.safety) }))
            .filter(Boolean)
            .join("");
        container.innerHTML = html || renderEmptyCard(`No ${type} projects yet`, "Published creations will appear here.");
        bindCardInteractions(container);
    } catch (error) {
        container.innerHTML = renderEmptyCard("Could not load this shelf", error.message || "Refresh and try again.");
    }
}

async function loadFollowingActivity() {
    const container = document.getElementById("home-activity-list");
    const activity = await fetchFollowingActivity(8);
    container.innerHTML = activity.length
        ? activity.map(renderActivityCard).join("")
        : renderEmptyCard("No new activity", "Follow creators to see meaningful publishing updates here.", { href: "explore.html", label: "Discover Creators" });
}

async function loadCreatorSuggestions() {
    const container = document.getElementById("home-creators-list");
    try {
        const creators = (await fetchDiscoverCreators(6)).filter(item => !viewer.blockedUserIds.includes(item.id));
        container.innerHTML = creators.length ? creators.map(creator => `
            <a class="home-mini-item" href="profile.html?user=${encodeURIComponent(creator.username || "")}">
                <img src="${escapeHtml(creator.avatar_url || "https://placehold.co/100x100/1b1b28/ffffff?text=NV")}" alt="" loading="lazy">
                <span><strong>${escapeHtml(creator.display_name || creator.username || "Creator")}</strong><span>@${escapeHtml(creator.username || "creator")} · ${Number(creator.content_count || 0)} creations</span></span>
            </a>`).join("") : renderEmptyCard("No suggestions yet", "More creators will appear as Nullverse grows.");
    } catch (error) {
        container.innerHTML = renderEmptyCard("Creator suggestions unavailable", error.message || "Refresh and try again.");
    }
}

async function loadAnnouncement() {
    const featured = await fetchFeaturedContent(8);
    const announcement = featured.find(item => item.feature_type === "announcement");
    if (!announcement) return;
    document.getElementById("home-announcement").innerHTML = `
        <strong>${escapeHtml(announcement.title || "Nullverse Update")}</strong>
        <p>${escapeHtml(announcement.description || "A new update is available.")}</p>
        ${announcement.link ? `<div class="nv-card-actions"><a class="nv-card-button" href="${escapeHtml(announcement.link)}">Learn More</a></div>` : ""}`;
}

function formatFeatureLabel(value) {
    return String(value || "spotlight").replaceAll("_", " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function escapeCssUrl(value) {
    return String(value || "").replace(/["'\\()]/g, "\\$&");
}
// JavaScript source code
