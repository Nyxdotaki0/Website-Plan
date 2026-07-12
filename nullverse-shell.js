import { supabase } from "./supabaseClient.js";
import { setupNotificationBadge } from "./notificationBadge.js";
import { setupMessageBadge } from "./messageBadge.js";

const ICONS = {
    search: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.2-3.2"></path></svg>`,
    bell: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"></path><path d="M10 21h4"></path></svg>`,
    message: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"></path></svg>`,
    plus: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>`,
    home: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 11 9-8 9 8"></path><path d="M5 10v10h14V10"></path></svg>`,
    explore: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="m15.5 8.5-2 5-5 2 2-5z"></path></svg>`,
    gallery: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"></rect><circle cx="8.5" cy="9" r="1.5"></circle><path d="m5 18 5-5 3 3 2-2 4 4"></path></svg>`,
    dashboard: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect></svg>`,
    profile: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path></svg>`,
    settings: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.2 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.4V9.6h.1A1.7 1.7 0 0 0 4.2 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8.6 4.2a1.7 1.7 0 0 0 1-.6A1.7 1.7 0 0 0 10 2.5v-.1h4v.1a1.7 1.7 0 0 0 1 1.7 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 8.6a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4h-.1a1.7 1.7 0 0 0-1.7 1z"></path></svg>`,
    logout: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5"></path><path d="M15 12H3"></path><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"></path></svg>`,
    book: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5z"></path><path d="M4 6.5v13"></path></svg>`,
    comic: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2"></rect><path d="M4 10h16M12 10v11"></path></svg>`,
    world: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18"></path></svg>`
};

const DEFAULT_AVATAR = "https://placehold.co/160x160/1b1b28/ffffff?text=NV";

export async function initNullverseShell(options = {}) {
    const page = String(options.page || document.body?.dataset?.page || "").toLowerCase();
    const guestMode = String(options.guestMode || "default").toLowerCase();
    const guestBrandHref = options.guestBrandHref || "index.html";
    const guestLoginHref = options.guestLoginHref || "login.html";
    let user = options.user || null;
    let profile = options.profile || null;

    if (!user) {
        const { data } = await supabase.auth.getUser();
        user = data?.user || null;
    }

    if (user && options.betaOnlyUser) {
        const normalizedEmail = String(user.email || "").trim().toLowerCase();
        const { data: betaAccess } = normalizedEmail
            ? await supabase.from("beta_access").select("role").ilike("email", normalizedEmail).maybeSingle()
            : { data: null };
        if (!betaAccess) user = null;
    }

    if (user && !profile) {
        const { data } = await supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url, role, role_name, account_status")
            .eq("id", user.id)
            .maybeSingle();
        profile = data || null;
    }

    if (user && options.activeOnly !== false) {
        const status = String(profile?.account_status || "active").trim().toLowerCase();
        if (["restricted", "suspended", "banned"].includes(status)) {
            user = null;
            profile = null;
        }
    }

    const headerMount = document.getElementById("nv-site-header");
    const mobileMount = document.getElementById("nv-mobile-nav");

    if (headerMount) {
        headerMount.innerHTML = buildHeader({ page, user, profile, guestMode, guestBrandHref, guestLoginHref });
    }

    if (mobileMount) {
        mobileMount.innerHTML = buildMobileNavigation({ page, user, profile });
    }

    document.body.classList.toggle("nv-shell-no-mobile-nav", !user);
    setupShellInteractions({ user, profile });

    if (user) {
        setupNotificationBadge();
        setupMessageBadge();
    }

    return { user, profile };
}

function buildHeader({ page, user, profile, guestMode, guestBrandHref, guestLoginHref }) {
    const avatar = profile?.avatar_url || DEFAULT_AVATAR;
    const displayName = profile?.display_name || profile?.username || "Creator";
    const username = profile?.username || "creator";

    if (!user && guestMode === "restricted") {
        return `
            <header class="nv-site-header nv-restricted-guest-header">
                <div class="nv-header-inner">
                    <a class="nv-brand" href="${escapeHtml(guestBrandHref)}" aria-label="Nullverse">
                        <img src="Nullverse-3.png" alt="Nullverse">
                    </a>
                    <div class="nv-guest-header-space" aria-hidden="true"></div>
                    <div class="nv-header-actions">
                        <a class="nv-header-button" href="${escapeHtml(guestLoginHref)}">Beta Login</a>
                    </div>
                </div>
            </header>
        `;
    }

    return `
        <header class="nv-site-header">
            <div class="nv-header-inner">
                <a class="nv-brand" href="index.html" aria-label="Nullverse Home">
                    <img src="Nullverse-3.png" alt="Nullverse">
                </a>

                <nav class="nv-primary-nav" aria-label="Primary navigation">
                    ${navLink("Home", "index.html", "home", page)}
                    ${navLink("Explore", "explore.html", "explore", page)}
                    ${navLink("Gallery", "gallery.html", "gallery", page)}
                    <button class="nv-nav-link" type="button" data-nv-search-open>Search</button>
                </nav>

                <div class="nv-header-actions">
                    <div class="nv-menu-wrap nv-create-wrap">
                        <button class="nv-header-button primary" type="button" data-nv-menu-button="create" aria-expanded="false">
                            ${ICONS.plus}<span>Create</span>
                        </button>
                        <div id="nv-create-menu" class="nv-dropdown" data-nv-menu="create">
                            <div class="nv-menu-label">Start something new</div>
                            ${menuItem("Create a World", "create-world.html?type=world", ICONS.world)}
                            ${menuItem("Write Literature", "create-world.html?type=literature", ICONS.book)}
                            ${menuItem("Create a Comic", "create-world.html?type=comic", ICONS.comic)}
                            ${menuItem("Add Gallery Item", galleryCreateUrl(profile), ICONS.gallery)}
                            <div class="nv-menu-divider"></div>
                            ${menuItem("Customize Profile", "account-settings.html#profile-design", ICONS.profile)}
                        </div>
                    </div>

                    <button class="nv-icon-button" type="button" data-nv-search-open aria-label="Search Nullverse">
                        ${ICONS.search}
                    </button>

                    ${user ? `
                        <a class="nv-icon-button nv-message-link message-link${page === "messages" ? " active" : ""}" href="messages.html" aria-label="Messages">
                            ${ICONS.message}<span class="message-badge" aria-hidden="true"></span>
                        </a>
                        <a class="nv-icon-button notification-link${page === "notifications" ? " active" : ""}" href="notifications.html" aria-label="Notifications">
                            ${ICONS.bell}<span class="notification-badge" aria-hidden="true"></span>
                        </a>
                        <div class="nv-menu-wrap">
                            <button class="nv-account-button" type="button" data-nv-menu-button="account" aria-expanded="false">
                                <img src="${escapeHtml(avatar)}" alt="">
                                <span class="nv-account-label">${escapeHtml(displayName)}</span>
                            </button>
                            <div id="nv-account-menu" class="nv-dropdown" data-nv-menu="account">
                                <div class="nv-dropdown-head">
                                    <img src="${escapeHtml(avatar)}" alt="">
                                    <div>
                                        <strong>${escapeHtml(displayName)}</strong>
                                        <span>@${escapeHtml(username)}</span>
                                    </div>
                                </div>
                                ${menuItem("View Profile", profileUrl(profile), ICONS.profile)}
                                ${menuItem("My Gallery", creatorGalleryUrl(profile), ICONS.gallery)}
                                ${menuItem("Creator Dashboard", "dashboard.html", ICONS.dashboard)}
                                ${menuItem("Account Settings", "account-settings.html", ICONS.settings)}
                                ${isStaffProfile(profile) ? menuItem("Admin Console", "admin.html", ICONS.dashboard) : ""}
                                <div class="nv-menu-divider"></div>
                                <button class="nv-menu-item danger" type="button" data-nv-logout>${ICONS.logout}<span>Log Out</span></button>
                            </div>
                        </div>
                    ` : `
                        <a class="nv-header-button" href="login.html">Beta Login</a>
                    `}
                </div>
            </div>
        </header>

        <div id="nv-global-search" class="nv-global-search" aria-hidden="true">
            <form class="nv-search-card" action="explore.html" method="get">
                <div class="nv-search-row">
                    <input id="nv-global-search-input" class="nv-search-input" type="search" name="q" placeholder="Search worlds, literature, comics, creators..." autocomplete="off">
                    <button class="nv-search-submit" type="submit">Search</button>
                </div>
                <p class="nv-search-hint">Press Enter to search Explore, or press Escape to close.</p>
            </form>
        </div>
    `;
}

function buildMobileNavigation({ page, user, profile }) {
    if (!user) return "";

    return `
        <nav class="nv-mobile-bottom-nav" aria-label="Mobile navigation">
            ${mobileLink("Home", "index.html", "home", page, ICONS.home)}
            ${mobileLink("Explore", "explore.html", "explore", page, ICONS.explore)}
            ${mobileLink("Gallery", "gallery.html", "gallery", page, ICONS.gallery)}
            <button class="nv-mobile-nav-item create" type="button" data-nv-mobile-create>${ICONS.plus}<span>Create</span></button>
            ${mobileLink("Studio", "dashboard.html", "dashboard", page, ICONS.dashboard)}
        </nav>
    `;
}

function navLink(label, href, key, page) {
    return `<a class="nv-nav-link${page === key ? " active" : ""}" href="${href}">${label}</a>`;
}

function mobileLink(label, href, key, page, icon) {
    return `<a class="nv-mobile-nav-item${page === key ? " active" : ""}" href="${href}">${icon}<span>${label}</span></a>`;
}

function menuItem(label, href, icon) {
    return `<a class="nv-menu-item" href="${escapeHtml(href)}">${icon}<span>${escapeHtml(label)}</span></a>`;
}

function isStaffProfile(profile) {
    const role = String(profile?.role_name || profile?.role || "").trim().toLowerCase();
    return role === "void_architect" || role === "moderator";
}

function profileUrl(profile) {
    return profile?.username
        ? `profile.html?user=${encodeURIComponent(profile.username)}`
        : "profile.html";
}

function creatorGalleryUrl(profile) {
    return profile?.username
        ? `creator-gallery.html?user=${encodeURIComponent(profile.username)}`
        : "creator-gallery.html";
}

function galleryCreateUrl(profile) {
    const base = creatorGalleryUrl(profile);
    return `${base}${base.includes("?") ? "&" : "?"}new=item`;
}

function setupShellInteractions({ user }) {
    const searchOverlay = document.getElementById("nv-global-search");
    const searchInput = document.getElementById("nv-global-search-input");

    const closeMenus = except => {
        document.querySelectorAll("[data-nv-menu]").forEach(menu => {
            if (menu.dataset.nvMenu !== except) menu.classList.remove("open");
        });
        document.querySelectorAll("[data-nv-menu-button]").forEach(button => {
            if (button.dataset.nvMenuButton !== except) button.setAttribute("aria-expanded", "false");
        });
    };

    document.querySelectorAll("[data-nv-menu-button]").forEach(button => {
        button.addEventListener("click", event => {
            event.stopPropagation();
            const key = button.dataset.nvMenuButton;
            const menu = document.querySelector(`[data-nv-menu="${key}"]`);
            const opening = !menu?.classList.contains("open");
            closeMenus(opening ? key : "");
            menu?.classList.toggle("open", opening);
            button.setAttribute("aria-expanded", String(opening));
        });
    });

    document.querySelector("[data-nv-mobile-create]")?.addEventListener("click", event => {
        event.stopPropagation();
        const menu = document.querySelector('[data-nv-menu="create"]');
        if (!menu) return;
        const opening = !menu.classList.contains("open");
        closeMenus(opening ? "create" : "");
        menu.classList.toggle("open", opening);
    });

    document.querySelectorAll("[data-nv-search-open]").forEach(button => {
        button.addEventListener("click", () => {
            closeMenus("");
            searchOverlay?.classList.add("open");
            searchOverlay?.setAttribute("aria-hidden", "false");
            document.body.style.overflow = "hidden";
            setTimeout(() => searchInput?.focus(), 20);
        });
    });

    searchOverlay?.addEventListener("click", event => {
        if (event.target !== searchOverlay) return;
        closeSearch();
    });

    document.addEventListener("click", () => closeMenus(""));

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeMenus("");
            closeSearch();
        }

        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
            event.preventDefault();
            document.querySelector("[data-nv-search-open]")?.click();
        }
    });

    document.querySelector("[data-nv-logout]")?.addEventListener("click", async () => {
        await supabase.auth.signOut();
        window.location.href = "login.html";
    });

    function closeSearch() {
        if (!searchOverlay?.classList.contains("open")) return;
        searchOverlay.classList.remove("open");
        searchOverlay.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
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
