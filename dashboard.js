import { requireBetaAccess } from "./betaGate.js";
import { supabase } from "./supabaseClient.js";
import { initNullverseShell } from "./nullverse-shell.js?v=5";
import {
    formatCompactNumber,
    renderEmptyCard,
    renderProjectCard,
    renderSkeletonCards,
    escapeHtml
} from "./nullverse-content-cards.js?v=2";
import { fetchDashboardMetrics, loadViewerContext } from "./nullverse-data.js";

const currentUser = await requireBetaAccess({ allowRestricted: false });
if (!currentUser) throw new Error("Nullverse session unavailable.");
const viewer = await loadViewerContext(currentUser.id);
const profile = viewer.profile;
await initNullverseShell({ page: "dashboard", user: currentUser, profile });

const state = {
    projects: [],
    galleryItems: [],
    filter: "all"
};

setupProfileHeader();
setupTabs();
paintSkeletons();
await loadDashboard();

function setupProfileHeader() {
    const displayName = profile?.display_name || profile?.username || "Creator";
    const username = profile?.username || "creator";
    const avatar = profile?.avatar_url || "https://placehold.co/160x160/1b1b28/ffffff?text=NV";

    document.getElementById("dashboard-title").textContent = `Welcome back, ${displayName}.`;
    document.getElementById("dashboard-display-name").textContent = displayName;
    document.getElementById("dashboard-username").textContent = `@${username}`;
    document.getElementById("dashboard-avatar").src = avatar;
    document.getElementById("dashboard-bio").textContent = profile?.bio || "Your creator profile connects everything you publish.";

    if (profile?.banner_url) {
        document.getElementById("dashboard-profile-banner").style.backgroundImage = `url("${profile.banner_url.replaceAll('"', '\\"')}")`;
    }

    if (profile?.username) {
        const profileUrl = `profile.html?user=${encodeURIComponent(profile.username)}`;
        const galleryUrl = `creator-gallery.html?user=${encodeURIComponent(profile.username)}`;
        document.getElementById("dashboard-profile-link").href = profileUrl;
        document.getElementById("dashboard-gallery-link").href = galleryUrl;
        document.getElementById("dashboard-add-gallery").href = `${galleryUrl}&new=item`;
    }

    if (["void_architect", "moderator"].includes(profile?.role)) {
        document.getElementById("dashboard-admin-panel").classList.add("show");
    }
}

function setupTabs() {
    document.querySelectorAll("[data-dashboard-filter]").forEach(button => {
        button.addEventListener("click", () => {
            state.filter = button.dataset.dashboardFilter;
            document.querySelectorAll("[data-dashboard-filter]").forEach(item => item.classList.toggle("active", item === button));
            renderProjects();
        });
    });
}

function paintSkeletons() {
    document.getElementById("dashboard-continue").innerHTML = renderSkeletonCards(4);
    document.getElementById("dashboard-projects").innerHTML = renderSkeletonCards(6);
}

async function loadDashboard() {
    const [projectsResult, galleryResult, metrics, followerResult] = await Promise.all([
        supabase.from("worlds").select("*").eq("owner_id", currentUser.id).order("updated_at", { ascending: false }),
        supabase.from("creator_proof_gallery").select("*").eq("owner_id", currentUser.id).order("updated_at", { ascending: false }),
        fetchDashboardMetrics(),
        supabase.from("follows").select("id", { count: "exact", head: true }).eq("following_id", currentUser.id)
    ]);

    if (projectsResult.error) throw projectsResult.error;
    if (galleryResult.error) throw galleryResult.error;

    state.projects = projectsResult.data || [];
    state.galleryItems = (galleryResult.data || []).map(item => ({ ...item, __kind: "gallery" }));

    await paintMetrics(metrics, followerResult.count || 0);
    renderContinue();
    renderProjects();
    renderCreatorHealth();
    renderAttention();
}

async function paintMetrics(metrics, followers) {
    let fallbackLikes = 0;
    if (!metrics) {
        const ids = state.projects.map(item => item.id);
        if (ids.length) {
            const { count } = await supabase.from("world_likes").select("id", { count: "exact", head: true }).in("world_id", ids);
            fallbackLikes = count || 0;
        }
    }

    const total = Number(metrics?.total_projects ?? state.projects.length);
    const published = Number(metrics?.published_projects ?? state.projects.filter(item => item.visibility === "published").length);
    const drafts = Number(metrics?.draft_projects ?? state.projects.filter(item => item.visibility !== "published").length);
    const gallery = Number(metrics?.gallery_items ?? state.galleryItems.length);
    const likes = Number(metrics?.total_likes ?? fallbackLikes);

    document.getElementById("stat-total-projects").textContent = formatCompactNumber(total);
    document.getElementById("stat-published").textContent = formatCompactNumber(published);
    document.getElementById("stat-drafts").textContent = formatCompactNumber(drafts);
    document.getElementById("stat-gallery").textContent = formatCompactNumber(gallery);
    document.getElementById("stat-likes").textContent = formatCompactNumber(likes);
    document.getElementById("stat-followers").textContent = formatCompactNumber(followers);
}

function renderContinue() {
    const container = document.getElementById("dashboard-continue");
    const items = [...state.projects, ...state.galleryItems]
        .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
        .slice(0, 4);

    container.innerHTML = items.length
        ? items.map(renderProjectWithManagement).join("")
        : renderEmptyCard("Your studio is empty", "Create your first project to begin building in Nullverse.", { href: "create-world.html", label: "Create Something" });
    bindManagementButtons(container);
}

function renderProjects() {
    const container = document.getElementById("dashboard-projects");
    const all = [...state.projects, ...state.galleryItems];
    const items = all.filter(matchesDashboardFilter);
    container.innerHTML = items.length
        ? items.map(renderProjectWithManagement).join("")
        : renderEmptyCard("No projects in this view", "Choose another filter or start something new.", { href: "create-world.html", label: "Create Something" });
    bindManagementButtons(container);
}

function renderProjectWithManagement(item) {
    const base = renderProjectCard(item);
    const hidden = isHidden(item);
    const controls = `
        <div class="nv-card-actions" style="padding:0 16px 16px;margin-top:-2px;">
            ${hidden && item.__kind === "gallery" ? `<button class="nv-card-button" type="button" data-appeal-item="${item.id}">Appeal</button>` : ""}
            <button class="nv-card-button danger" type="button" data-delete-kind="${item.__kind === "gallery" ? "gallery" : "project"}" data-delete-id="${item.id}">Delete</button>
        </div>`;
    return base.replace("</article>", `${controls}</article>`);
}

function matchesDashboardFilter(item) {
    if (state.filter === "all") return true;
    if (state.filter === "gallery") return item.__kind === "gallery";
    if (state.filter === "hidden") return isHidden(item);
    if (item.__kind === "gallery") return false;
    if (state.filter === "comic") return ["comic", "manga"].includes(item.content_type);
    return item.content_type === state.filter || (state.filter === "world" && !["literature", "comic", "manga"].includes(item.content_type));
}

function bindManagementButtons(root) {
    root.querySelectorAll("[data-delete-id]").forEach(button => {
        button.addEventListener("click", () => deleteItem(button.dataset.deleteKind, button.dataset.deleteId));
    });

    root.querySelectorAll("[data-appeal-item]").forEach(button => {
        button.addEventListener("click", () => submitAppeal(button.dataset.appealItem));
    });
}

async function deleteItem(kind, id) {
    const item = kind === "gallery"
        ? state.galleryItems.find(entry => entry.id === id)
        : state.projects.find(entry => entry.id === id);
    if (!item) return;

    const label = item.title || "this item";
    if (!confirm(`Delete “${label}”? This cannot be undone.`)) return;

    const table = kind === "gallery" ? "creator_proof_gallery" : "worlds";
    const { error } = await supabase.from(table).delete().eq("id", id).eq("owner_id", currentUser.id);
    if (error) {
        alert(error.message);
        return;
    }

    if (kind === "gallery") state.galleryItems = state.galleryItems.filter(entry => entry.id !== id);
    else state.projects = state.projects.filter(entry => entry.id !== id);
    renderContinue();
    renderProjects();
    renderAttention();
}

async function submitAppeal(id) {
    const item = state.galleryItems.find(entry => entry.id === id);
    if (!item) return;
    const message = prompt("Explain why this Gallery item should be restored.");
    if (!message?.trim()) return;

    const { error } = await supabase.from("moderation_appeals").insert({
        target_type: "gallery_item",
        target_id: id,
        owner_id: currentUser.id,
        appeal_message: message.trim()
    });
    if (error) alert(error.message);
    else alert("Appeal submitted to Nullverse moderation.");
}

function renderCreatorHealth() {
    const rows = [
        ["Profile setup", profile?.profile_completed ? "Complete" : "Incomplete", profile?.profile_completed],
        ["Age verification", profile?.age_verified ? "Complete" : "Incomplete", profile?.age_verified],
        ["Public profile", profile?.username ? "Ready" : "Needs username", !!profile?.username],
        ["Creator gallery", state.galleryItems.length ? "Active" : "Empty", state.galleryItems.length > 0],
        ["Published work", state.projects.some(item => item.visibility === "published") ? "Online" : "None yet", state.projects.some(item => item.visibility === "published")]
    ];

    document.getElementById("dashboard-health").innerHTML = rows.map(([label, value, good]) => `
        <div class="dashboard-health-row"><span>${escapeHtml(label)}</span><strong class="${good ? "good" : "warn"}">${escapeHtml(value)}</strong></div>`).join("");
}

function renderAttention() {
    const hidden = [...state.projects, ...state.galleryItems].filter(isHidden);
    const drafts = state.projects.filter(item => item.visibility !== "published");
    const container = document.getElementById("dashboard-attention");

    if (hidden.length) {
        container.innerHTML = `<div class="dashboard-moderation-alert"><strong>${hidden.length} item${hidden.length === 1 ? "" : "s"} hidden by moderation.</strong><br>Open the Moderation tab to review reasons and appeal eligible Gallery items.</div>`;
        return;
    }

    if (drafts.length) {
        container.innerHTML = `<div class="dashboard-moderation-alert" style="border-color:rgba(255,220,140,.25);background:rgba(255,220,140,.07);color:#ffe0a8;"><strong>${drafts.length} draft${drafts.length === 1 ? "" : "s"} waiting.</strong><br>Continue editing when you are ready. Saving a draft does not remove your already published version.</div>`;
        return;
    }

    container.innerHTML = renderEmptyCard("Everything looks clear", "No moderation issues or unfinished drafts need attention.");
}

function isHidden(item) {
    const status = String(item.moderation_status || "visible").toLowerCase();
    return ["hidden", "removed", "rejected", "suspended", "banned"].includes(status);
}
