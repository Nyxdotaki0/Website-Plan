const DEFAULT_AVATAR = "https://placehold.co/160x160/1b1b28/ffffff?text=NV";
const DEFAULT_COVER = "https://placehold.co/900x520/16161d/ffffff?text=Nullverse";
const DEFAULT_GALLERY = "https://placehold.co/800x800/16161d/ffffff?text=Gallery";

export function normalizeContentType(value) {
    const clean = String(value || "world").trim().toLowerCase();
    if (clean === "literature") return "literature";
    if (clean === "comic") return "comic";
    if (clean === "manga") return "manga";
    return "world";
}

export function contentTypeLabel(value) {
    const type = normalizeContentType(value);
    return type.charAt(0).toUpperCase() + type.slice(1);
}

export function getPublicContentUrl(item = {}) {
    const type = normalizeContentType(item.content_type);
    const id = encodeURIComponent(item.id || item.content_id || "");
    if (type === "literature") return `literature.html?id=${id}`;
    if (type === "comic" || type === "manga") return `comic.html?id=${id}`;
    return `world.html?id=${id}`;
}

export function getEditorContentUrl(item = {}) {
    const type = normalizeContentType(item.content_type);
    const id = encodeURIComponent(item.id || item.content_id || "");
    if (type === "literature") return `edit-literature.html?id=${id}`;
    if (type === "comic" || type === "manga") return `edit-comic.html?id=${id}`;
    return `edit-world.html?id=${id}`;
}

export function getProfileUrl(item = {}) {
    const username = item.username || item.owner_username || item.creator?.username || "";
    return username ? `profile.html?user=${encodeURIComponent(username)}` : "profile.html";
}

export function normalizeWarningList(value) {
    let list = value;
    if (typeof list === "string") {
        const raw = list.trim();
        if (!raw) list = [];
        else {
            try {
                list = JSON.parse(raw);
            } catch {
                list = raw.replace(/^\{|\}$/g, "").split(",");
            }
        }
    }

    return [...new Set((Array.isArray(list) ? list : [])
        .map(entry => String(entry || "").trim().toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, ""))
        .filter(Boolean))];
}

export function getSafetyDecision(item, preferences = {}) {
    const warnings = normalizeWarningList(item?.content_warnings);
    const blocked = new Set(normalizeWarningList(preferences.blockedContentWarnings));
    const rating = String(item?.content_rating || item?.age_rating || "general").toLowerCase();
    const experience = String(preferences.contentExperience || "balanced").toLowerCase();
    const ageRole = String(preferences.ageRole || "unknown").toLowerCase();
    const hardBlocked = warnings.some(warning => blocked.has(warning));
    const sensitive = warnings.length > 0 || ["mature", "adult", "18+"].includes(rating);

    if (hardBlocked) return { action: "hide", warnings, rating };
    if (ageRole === "minor" && sensitive) return { action: "hide", warnings, rating };
    if (experience === "safe" && sensitive) return { action: "hide", warnings, rating };
    if (experience === "balanced" && sensitive) return { action: "warn", warnings, rating };
    return { action: "show", warnings, rating };
}

export function renderContentCard(item = {}, options = {}) {
    const safety = options.safety || { action: "show", warnings: [] };
    if (safety.action === "hide") return "";

    const type = normalizeContentType(item.content_type);
    const url = getPublicContentUrl(item);
    const cover = item.cover_image_url || item.theme_overview_card_image_url || DEFAULT_COVER;
    const title = item.title || "Untitled Creation";
    const summary = item.summary || "No summary has been added yet.";
    const displayName = item.display_name || item.owner_display_name || item.username || "Creator";
    const avatar = item.avatar_url || DEFAULT_AVATAR;
    const likeCount = Number(item.like_count || 0);
    const date = item.updated_at || item.created_at;
    const tags = splitTags(item.genres, item.themes).slice(0, 3);
    const warningClass = safety.action === "warn" ? " warning-hidden" : "";
    const credit = buildOverviewCredit(item);

    return `
        <article class="nv-content-card${warningClass}" data-nv-warning-card>
            <a class="nv-card-media" href="${escapeHtml(url)}">
                <img src="${escapeHtml(cover)}" alt="${escapeHtml(title)}" loading="lazy" onerror="this.src='${DEFAULT_COVER}'">
                <span class="nv-card-type nv-type-${type}">${escapeHtml(contentTypeLabel(type))}</span>
                ${likeCount ? `<span class="nv-card-count">${formatCompactNumber(likeCount)} likes</span>` : ""}
                ${credit}
                ${safety.action === "warn" ? renderSafetyOverlay(safety) : ""}
            </a>
            <div class="nv-card-body">
                <div class="nv-card-creator">
                    <img src="${escapeHtml(avatar)}" alt="" loading="lazy">
                    <a href="${escapeHtml(getProfileUrl(item))}">${escapeHtml(displayName)}</a>
                </div>
                <h3><a href="${escapeHtml(url)}">${escapeHtml(title)}</a></h3>
                <p class="nv-card-summary">${escapeHtml(summary)}</p>
                ${tags.length ? `<div class="nv-tag-row">${tags.map(tag => `<span class="nv-mini-tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
                <div class="nv-card-meta">
                    <span>${date ? escapeHtml(timeAgo(date)) : "Recently added"}</span>
                    ${item.featured ? `<span>★ Featured</span>` : ""}
                </div>
            </div>
        </article>
    `;
}

export function renderGalleryCard(item = {}, options = {}) {
    const safety = options.safety || { action: "show", warnings: [] };
    if (safety.action === "hide") return "";

    const itemUrl = `creator-gallery-item.html?id=${encodeURIComponent(item.id || "")}`;
    const creatorUsername = item.username || item.owner_username || item.creator_username || "";
    const creatorGalleryUrl = creatorUsername
        ? `creator-gallery.html?user=${encodeURIComponent(creatorUsername)}`
        : "creator-gallery.html";
    const routeToCreatorGallery = options.galleryDestination === "creator";
    const primaryUrl = routeToCreatorGallery ? creatorGalleryUrl : itemUrl;
    const profileUrl = getProfileUrl(item);
    const title = item.title || "Untitled Gallery Item";
    const image = item.image_url || DEFAULT_GALLERY;
    const displayName = item.display_name || creatorUsername || "Creator";
    const avatar = item.avatar_url || DEFAULT_AVATAR;
    const likeCount = Number(item.like_count || 0);
    const showcaseLocked = normalizeBooleanFlag(item.showcase_locked);
    const lockedClass = showcaseLocked ? " locked" : "";
    const viewerRole = String(options.viewerRole || "creator").trim().toLowerCase();
    const viewerStatus = String(options.viewerStatus || "active").trim().toLowerCase();
    const viewerIsStaff = viewerStatus === "active" && ["moderator", "void_architect"].includes(viewerRole);
    const canOpenGalleryItem = !showcaseLocked || viewerIsStaff;
    const showGalleryActions = options.showGalleryActions === true;
    const requireWarningConfirmation = options.requireWarningConfirmation === true;
    const warningRevealed = options.warningRevealed === true;
    const shouldConfirmWarning = requireWarningConfirmation && !warningRevealed && safety.action === "warn";
    const useGenericWarning = !requireWarningConfirmation && !warningRevealed && safety.action === "warn";
    const warningClass = shouldConfirmWarning ? " warning-gated" : (useGenericWarning ? " warning-hidden" : "");
    const revealedClass = warningRevealed ? " warning-revealed" : "";

    const linkAttributes = url => shouldConfirmWarning
        ? `href="#" data-nv-protected-href="${escapeHtml(url)}" aria-disabled="true" tabindex="-1"`
        : `href="${escapeHtml(url)}"`;

    return `
        <article class="nv-gallery-card${warningClass}${revealedClass}${lockedClass}" data-nv-warning-card data-gallery-item-id="${escapeHtml(item.id || "")}">
            <a class="nv-card-media" ${linkAttributes(primaryUrl)}>
                <img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" loading="lazy" onerror="this.src='${DEFAULT_GALLERY}'">
                <span class="nv-card-type nv-type-gallery">Gallery</span>
                ${likeCount ? `<span class="nv-card-count">${formatCompactNumber(likeCount)} likes</span>` : ""}
                ${useGenericWarning ? renderSafetyOverlay(safety) : ""}
            </a>
            ${shouldConfirmWarning ? renderGalleryWarningGate(item, safety) : ""}
            <div class="nv-card-body">
                <div class="nv-card-creator">
                    <img src="${escapeHtml(avatar)}" alt="" loading="lazy">
                    <a ${linkAttributes(profileUrl)}>${escapeHtml(displayName)}</a>
                </div>
                <h3><a ${linkAttributes(primaryUrl)}>${escapeHtml(title)}</a></h3>
                ${item.description ? `<p class="nv-card-summary">${escapeHtml(item.description)}</p>` : ""}
                <div class="nv-card-meta">
                    <span>${escapeHtml(formatLabel(item.proof_type || "artwork"))}</span>
                    <span>${item.updated_at ? escapeHtml(timeAgo(item.updated_at)) : "Recently added"}</span>
                </div>
                ${showGalleryActions ? `
                    <div class="nv-card-actions nv-gallery-card-actions">
                        <a class="nv-card-button primary" ${linkAttributes(creatorGalleryUrl)}>Open Creator Gallery</a>
                        ${canOpenGalleryItem
                ? `<a class="nv-card-button" ${linkAttributes(itemUrl)}>Open Gallery Item</a>`
                : `<span class="nv-card-button disabled" aria-disabled="true" title="This creator has locked the detailed showcase.">Showcase Locked</span>`}
                    </div>
                ` : ""}
            </div>
        </article>
    `;
}

function renderGalleryWarningGate(item = {}, safety = {}) {
    const warnings = normalizeWarningList(safety.warnings || item.content_warnings);
    const rating = String(safety.rating || item.content_rating || item.age_rating || "general").trim().toLowerCase();
    const labels = [...warnings.map(formatLabel)];
    if (["mature", "adult", "18+", "18_plus"].includes(rating) && !labels.some(label => ["Mature", "Adult", "18+", "18 Plus"].includes(label))) {
        labels.unshift(formatLabel(rating));
    }
    if (!labels.length) labels.push("Sensitive Content");

    const warningCount = warnings.length || 1;
    const warningText = `${warningCount} warning${warningCount === 1 ? "" : "s"}`;
    const warningList = labels
        .slice(0, 6)
        .map(label => `<span>${escapeHtml(label)}</span>`)
        .join(`<span class="nv-gallery-warning-dot" aria-hidden="true">•</span>`);
    const summary = labels.join(" · ");

    return `
        <button
            class="nv-gallery-warning-gate"
            type="button"
            data-nv-gallery-warning-gate
            data-gallery-item-id="${escapeHtml(item.id || "")}"
            data-gallery-item-title="${escapeHtml(item.title || "Gallery item")}"
            data-gallery-warning-summary="${escapeHtml(summary)}"
            data-gallery-warning-tags="${escapeHtml(labels.join("|"))}"
            aria-label="Review content warning for ${escapeHtml(item.title || "this gallery item")}">
            <span class="nv-gallery-warning-count">${escapeHtml(warningText)}</span>
            <strong class="nv-gallery-warning-title">Content Warning</strong>
            <span class="nv-gallery-warning-list">${warningList}</span>
            <span class="nv-gallery-warning-hint">Tap to review</span>
        </button>
    `;
}

export function renderCreatorCard(profile = {}) {
    const username = profile.username || "creator";
    const displayName = profile.display_name || username;
    const avatar = profile.avatar_url || DEFAULT_AVATAR;
    const banner = profile.banner_url || "";
    const contentCount = Number(profile.content_count || 0);
    const followerCount = Number(profile.follower_count || 0);

    return `
        <article class="nv-creator-card">
            <div class="nv-creator-banner"${banner ? ` style="background-image:url('${escapeCssUrl(banner)}')"` : ""}></div>
            <div class="nv-creator-body">
                <div class="nv-creator-avatar"><img src="${escapeHtml(avatar)}" alt="" loading="lazy"></div>
                <h3><a href="profile.html?user=${encodeURIComponent(username)}">${escapeHtml(displayName)}</a></h3>
                <div class="nv-creator-handle">@${escapeHtml(username)}</div>
                ${profile.bio ? `<p class="nv-creator-bio">${escapeHtml(profile.bio)}</p>` : ""}
                <div class="nv-card-meta">
                    <span>${formatCompactNumber(contentCount)} creations</span>
                    <span>${formatCompactNumber(followerCount)} followers</span>
                </div>
                <div class="nv-card-actions">
                    <a class="nv-card-button" href="profile.html?user=${encodeURIComponent(username)}">View Profile</a>
                    <a class="nv-card-button" href="creator-gallery.html?user=${encodeURIComponent(username)}">Gallery</a>
                </div>
            </div>
        </article>
    `;
}

export function renderProjectCard(item = {}) {
    const isGallery = item.__kind === "gallery";
    const type = isGallery ? "gallery" : normalizeContentType(item.content_type);
    const image = isGallery ? (item.image_url || DEFAULT_GALLERY) : (item.cover_image_url || DEFAULT_COVER);
    const title = item.title || "Untitled Project";
    const editorUrl = isGallery
        ? `gallery-item-studio.html?item=${encodeURIComponent(item.id || "")}`
        : getEditorContentUrl(item);
    const publicUrl = isGallery
        ? `creator-gallery-item.html?id=${encodeURIComponent(item.id || "")}`
        : getPublicContentUrl(item);
    const published = isGallery ? item.visibility === "public" : item.visibility === "published";
    const hidden = isHiddenModeration(item);

    return `
        <article class="nv-project-card">
            <a class="nv-card-media" href="${escapeHtml(editorUrl)}">
                <img src="${escapeHtml(image)}" alt="${escapeHtml(title)}" loading="lazy" onerror="this.src='${isGallery ? DEFAULT_GALLERY : DEFAULT_COVER}'">
                <span class="nv-card-type nv-type-${type}">${escapeHtml(contentTypeLabel(type))}</span>
            </a>
            <div class="nv-card-body">
                <h3><a href="${escapeHtml(editorUrl)}">${escapeHtml(title)}</a></h3>
                <div class="nv-card-meta">
                    <span>${published ? "Published" : "Draft"}</span>
                    <span>${item.updated_at ? escapeHtml(timeAgo(item.updated_at)) : "Recently edited"}</span>
                    ${hidden ? `<span style="color:#ffad8c">Hidden by moderation</span>` : ""}
                </div>
                <div class="nv-card-actions">
                    <a class="nv-card-button primary" href="${escapeHtml(editorUrl)}">Continue Editing</a>
                    ${published ? `<a class="nv-card-button" href="${escapeHtml(publicUrl)}">View</a>` : ""}
                </div>
            </div>
        </article>
    `;
}

export function renderActivityCard(activity = {}) {
    const avatar = activity.avatar_url || DEFAULT_AVATAR;
    const displayName = activity.display_name || activity.username || "A creator";
    const profileUrl = getProfileUrl(activity);
    const link = activity.link || "#";
    const label = activity.message || activityLabel(activity);

    return `
        <article class="nv-activity-card">
            <img class="nv-activity-avatar" src="${escapeHtml(avatar)}" alt="" loading="lazy">
            <p><a href="${escapeHtml(profileUrl)}">${escapeHtml(displayName)}</a> ${escapeHtml(label)} ${activity.title ? `<a href="${escapeHtml(link)}">${escapeHtml(activity.title)}</a>` : ""}</p>
            <time>${activity.created_at ? escapeHtml(timeAgo(activity.created_at)) : "Recently"}</time>
        </article>
    `;
}

export function renderEmptyCard(title, message, action = null) {
    return `
        <div class="nv-empty-card">
            <div>
                <strong>${escapeHtml(title)}</strong>
                <span>${escapeHtml(message)}</span>
                ${action ? `<div class="nv-card-actions" style="justify-content:center"><a class="nv-card-button primary" href="${escapeHtml(action.href)}">${escapeHtml(action.label)}</a></div>` : ""}
            </div>
        </div>
    `;
}

export function renderSkeletonCards(count = 4) {
    return Array.from({ length: count }, () => `
        <div class="nv-skeleton-card" aria-hidden="true">
            <div class="nv-skeleton-media"></div>
            <div class="nv-skeleton-lines">
                <div class="nv-skeleton-line short"></div>
                <div class="nv-skeleton-line"></div>
                <div class="nv-skeleton-line"></div>
            </div>
        </div>
    `).join("");
}

export function bindCardInteractions(root = document) {
    root.querySelectorAll("[data-nv-warning-card]").forEach(card => {
        const overlay = card.querySelector("[data-nv-warning-reveal]");
        if (!overlay || overlay.dataset.bound === "true") return;
        overlay.dataset.bound = "true";
        overlay.addEventListener("click", event => {
            event.preventDefault();
            event.stopPropagation();
            card.classList.add("warning-revealed");
        });
    });
}

function renderSafetyOverlay(safety) {
    const labels = [];
    if (["mature", "adult", "18+"].includes(String(safety.rating || "").toLowerCase())) labels.push(formatLabel(safety.rating));
    labels.push(...(safety.warnings || []).slice(0, 4).map(formatLabel));
    return `
        <span class="nv-safety-cover" data-nv-warning-reveal>
            <span>
                <strong>Content warning</strong>
                <span>${escapeHtml(labels.join(" · ") || "Sensitive content")}<br>Tap to reveal</span>
            </span>
        </span>
    `;
}

function buildOverviewCredit(item) {
    const type = item.overview_card_credit_type || item.cover_credit_type || "no_credit_needed";
    if (type === "no_credit_needed") return "";

    let label = item.overview_card_credit_name || item.cover_credit_name || "Image credit";
    let href = item.overview_card_credit_url || item.cover_credit_url || "";
    const username = item.overview_card_credit_nullverse_username || item.cover_credit_nullverse_username || item.username || "";

    if (type === "own_work" || type === "nullverse_creator") {
        label = `@${username || "creator"}`;
        href = username ? `profile.html?user=${encodeURIComponent(username)}` : "";
    }

    const inner = `Image credit: ${escapeHtml(label)}`;
    return href
        ? `<a class="nv-credit-pill" href="${escapeHtml(href)}"${href.startsWith("http") ? ' target="_blank" rel="noopener"' : ""}>${inner}</a>`
        : `<span class="nv-credit-pill">${inner}</span>`;
}


function normalizeBooleanFlag(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value === 1;
    const clean = String(value ?? "").trim().toLowerCase();
    return ["true", "1", "yes", "locked", "private", "closed"].includes(clean);
}

function splitTags(...values) {
    return [...new Set(values
        .flatMap(value => String(value || "").split(","))
        .map(value => value.trim())
        .filter(Boolean))];
}

function isHiddenModeration(item) {
    const status = String(item.moderation_status || "visible").toLowerCase();
    return ["hidden", "removed", "rejected", "suspended", "banned"].includes(status);
}

function activityLabel(activity) {
    const type = String(activity.activity_type || "updated");
    const labels = {
        world_published: "published",
        literature_published: "published",
        comic_published: "published",
        manga_published: "published",
        content_updated: "updated",
        literature_chapter_published: "published a new chapter in",
        comic_chapter_published: "published a new chapter in",
        gallery_item_published: "added new artwork"
    };
    return labels[type] || "updated";
}

export function formatCompactNumber(value) {
    const number = Number(value || 0);
    return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(number);
}

export function timeAgo(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Recently";
    const seconds = Math.round((date.getTime() - Date.now()) / 1000);
    const ranges = [
        [60, "second"],
        [60, "minute"],
        [24, "hour"],
        [7, "day"],
        [4.345, "week"],
        [12, "month"],
        [Number.POSITIVE_INFINITY, "year"]
    ];
    let amount = seconds;
    for (const [limit, unit] of ranges) {
        if (Math.abs(amount) < limit) {
            return new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }).format(Math.round(amount), unit);
        }
        amount /= limit;
    }
    return "Recently";
}

export function formatLabel(value) {
    return String(value || "")
        .replaceAll("_", " ")
        .replace(/\b\w/g, letter => letter.toUpperCase());
}

export function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function escapeCssUrl(value) {
    return String(value || "").replace(/["'\\()]/g, "\\$&");
}
