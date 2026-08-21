import { supabase } from "./supabaseClient.js?v=20260818";

export const NULLVERSE_GUEST_FLAGS = Object.freeze({
    // Public guest browsing is production-ready but intentionally disabled
    // during private beta. Flip this single flag to true when Guest Mode launches.
    publicGuestAccess: false,
    architectGuestPreview: true
});

const PREVIEW_KEY = "nullverse_architect_guest_preview";
const PREVIEW_ROLE_KEY = "nullverse_architect_guest_role";
const GUEST_STYLE_ID = "nv-guest-runtime-style";

export const GUEST_USER = Object.freeze({
    id: null,
    email: null,
    isGuest: true,
    isArchitectGuestPreview: false
});

function normalizeRole(value) {
    return String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
}

export function isGuestUser(user) {
    return Boolean(user?.isGuest || user?.__nullverseGuest);
}

export function isArchitectGuestPreviewRequested() {
    return sessionStorage.getItem(PREVIEW_KEY) === "true";
}

export function clearArchitectGuestPreview() {
    sessionStorage.removeItem(PREVIEW_KEY);
    sessionStorage.removeItem(PREVIEW_ROLE_KEY);
    document.documentElement.removeAttribute("data-nv-guest-preview");
}

export async function isVoidArchitectSessionUser(user) {
    if (!user?.id) return false;

    const [{ data: profile }, { data: betaAccess }] = await Promise.all([
        supabase
            .from("profiles")
            .select("id, role, role_name, account_status")
            .eq("id", user.id)
            .maybeSingle(),
        user.email
            ? supabase
                .from("beta_access")
                .select("role")
                .ilike("email", String(user.email).trim().toLowerCase())
                .maybeSingle()
            : Promise.resolve({ data: null })
    ]);

    const profileRole = normalizeRole(profile?.role_name || profile?.role);
    const betaRole = normalizeRole(betaAccess?.role);
    const status = String(profile?.account_status || "active").trim().toLowerCase();

    return status === "active" && (profileRole === "void_architect" || betaRole === "void_architect");
}

export async function enableArchitectGuestPreview(user) {
    if (!NULLVERSE_GUEST_FLAGS.architectGuestPreview) return false;
    if (!(await isVoidArchitectSessionUser(user))) return false;

    sessionStorage.setItem(PREVIEW_KEY, "true");
    sessionStorage.setItem(PREVIEW_ROLE_KEY, "void_architect");
    document.documentElement.setAttribute("data-nv-guest-preview", "true");
    return true;
}

export async function getNullverseAccessContext() {
    let session = null;
    try {
        const result = await supabase.auth.getSession();
        session = result?.data?.session || null;
    } catch (error) {
        console.warn("Could not resolve Nullverse access context:", error);
    }

    const actualUser = session?.user || null;

    if (isArchitectGuestPreviewRequested()) {
        if (actualUser && NULLVERSE_GUEST_FLAGS.architectGuestPreview) {
            // Never trust browser storage as authorization. The preview flag is
            // only a requested UI state; the Void Architect role is re-checked
            // against Supabase on every fresh page load.
            const allowed = await isVoidArchitectSessionUser(actualUser);
            if (allowed) {
                sessionStorage.setItem(PREVIEW_ROLE_KEY, "void_architect");
                document.documentElement.setAttribute("data-nv-guest-preview", "true");
                return {
                    mode: "architect_guest_preview",
                    isGuest: true,
                    isArchitectGuestPreview: true,
                    actualUser,
                    effectiveUser: { ...GUEST_USER, isArchitectGuestPreview: true, __nullverseGuest: true }
                };
            }
        }
        clearArchitectGuestPreview();
    }

    if (actualUser) {
        return {
            mode: "authenticated",
            isGuest: false,
            isArchitectGuestPreview: false,
            actualUser,
            effectiveUser: actualUser
        };
    }

    if (NULLVERSE_GUEST_FLAGS.publicGuestAccess) {
        return {
            mode: "guest",
            isGuest: true,
            isArchitectGuestPreview: false,
            actualUser: null,
            effectiveUser: { ...GUEST_USER, __nullverseGuest: true }
        };
    }

    return {
        mode: "locked_beta",
        isGuest: false,
        isArchitectGuestPreview: false,
        actualUser: null,
        effectiveUser: null
    };
}

export function getGuestViewerContext() {
    return {
        profile: null,
        blockedUserIds: [],
        safety: {
            contentExperience: "balanced",
            blockedContentWarnings: [],
            ageRole: "guest"
        }
    };
}

export function isGuestBlockedAdultContent() {
    // Guest Mode intentionally has no adult/18+ hard block. Guests are permanently
    // Balanced instead: sensitive ratings and warnings are blurred/gated until the
    // viewer explicitly chooses to reveal them.
    return false;
}

export function filterGuestSafeContent(rows = [], isGuest = true) {
    // Kept as a compatibility helper for existing feeds. Guest Mode no longer
    // removes Mature/Adult records from discovery; card/reader safety gates handle them.
    return Array.isArray(rows) ? rows : [];
}

function ensureGuestStyles() {
    if (document.getElementById(GUEST_STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = GUEST_STYLE_ID;
    style.textContent = `
        .nv-guest-modal-backdrop{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:22px;background:rgba(0,0,0,.76);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
        .nv-guest-modal{width:min(520px,100%);padding:28px;border-radius:22px;border:1px solid rgba(255,255,255,.13);background:linear-gradient(145deg,rgba(30,30,38,.98),rgba(9,9,13,.98));box-shadow:0 30px 80px rgba(0,0,0,.55);color:#f7f7fb;font-family:Arial,sans-serif}
        .nv-guest-modal h2{margin:0 0 10px;font-size:1.45rem}.nv-guest-modal p{margin:0;color:#b9b9c7;line-height:1.6}.nv-guest-modal-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:22px}
        .nv-guest-modal a,.nv-guest-modal button{appearance:none;border:1px solid rgba(255,255,255,.14);border-radius:12px;padding:11px 15px;background:#22222b;color:#fff;text-decoration:none;font:inherit;cursor:pointer}.nv-guest-modal a.primary,.nv-guest-modal button.primary{background:#f3f3f7;color:#08080b;font-weight:800}.nv-guest-modal button.secondary{background:transparent;color:#c8c8d3}
        .nv-guest-protected{min-height:100vh;display:grid;place-items:center;padding:28px;background:#05050a;color:white;font-family:Arial,sans-serif}.nv-guest-protected-card{width:min(560px,100%);padding:34px;border:1px solid rgba(255,255,255,.12);border-radius:24px;background:rgba(255,255,255,.05);text-align:center}.nv-guest-protected-card p{color:#bdbdca;line-height:1.65}.nv-guest-protected-actions{display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:22px}.nv-guest-protected-actions a{padding:12px 16px;border-radius:12px;border:1px solid rgba(255,255,255,.14);color:#fff;text-decoration:none;background:#1d1d24}.nv-guest-protected-actions a.primary{background:#f2f2f5;color:#09090c;font-weight:800}
    `;
    document.head.appendChild(style);
}

export function showGuestActionPrompt(action = "use this feature", options = {}) {
    ensureGuestStyles();
    document.querySelector(".nv-guest-modal-backdrop")?.remove();

    const returnTo = options.returnTo || `${location.pathname.split("/").pop() || "index.html"}${location.search || ""}${location.hash || ""}`;
    const loginHref = `login.html?return=${encodeURIComponent(returnTo)}`;
    const architectPreview = isArchitectGuestPreviewRequested();
    const backdrop = document.createElement("div");
    backdrop.className = "nv-guest-modal-backdrop";
    backdrop.innerHTML = `
        <section class="nv-guest-modal" role="dialog" aria-modal="true" aria-labelledby="nv-guest-modal-title">
            <h2 id="nv-guest-modal-title">Log in to ${escapeHtml(action)}</h2>
            <p>${architectPreview ? "You are previewing Nullverse with guest permissions. Return to your Void Architect account to use personal, creation, interaction, reporting, or moderation features." : "A Nullverse account is required for personal, creation, interaction, reporting, and moderation features."}</p>
            <div class="nv-guest-modal-actions">
                ${architectPreview ? `<button class="primary" type="button" data-nv-exit-guest-preview>Log In as Architect</button>` : `<a class="primary" href="${escapeHtml(loginHref)}">Log In</a><a href="${escapeHtml(loginHref)}">Create Account</a>`}
                <button class="secondary" type="button" data-nv-guest-close>Continue Browsing</button>
            </div>
        </section>`;

    document.body.appendChild(backdrop);
    backdrop.querySelector("[data-nv-guest-close]")?.addEventListener("click", () => backdrop.remove());
    backdrop.addEventListener("click", event => { if (event.target === backdrop) backdrop.remove(); });
    backdrop.querySelector("[data-nv-exit-guest-preview]")?.addEventListener("click", () => exitArchitectGuestPreview());
    return false;
}

export function showAdultGuestGate(options = {}) {
    ensureGuestStyles();
    document.querySelector(".nv-guest-modal-backdrop")?.remove();
    const returnTo = options.returnTo || `${location.pathname.split("/").pop() || "index.html"}${location.search || ""}${location.hash || ""}`;
    const backdrop = document.createElement("div");
    backdrop.className = "nv-guest-modal-backdrop";
    backdrop.innerHTML = `
        <section class="nv-guest-modal" role="dialog" aria-modal="true">
            <h2>This creation is restricted to adults</h2>
            <p>18+ material is not available in Guest Mode. To view adult content, sign in to a Nullverse account and complete age verification.</p>
            <div class="nv-guest-modal-actions">
                ${isArchitectGuestPreviewRequested() ? `<button class="primary" type="button" data-nv-exit-guest-preview>Log In as Architect</button>` : `<a class="primary" href="login.html?return=${encodeURIComponent(returnTo)}">Log In</a>`}
                <a href="explore.html">Continue Exploring</a>
            </div>
        </section>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector("[data-nv-exit-guest-preview]")?.addEventListener("click", () => exitArchitectGuestPreview());
    return false;
}

export function showGuestProtectedPage(action = "use this feature") {
    clearTransientGuestUi();
    document.body.innerHTML = `
        <main class="nv-guest-protected">
            <section class="nv-guest-protected-card">
                <img src="Nullverse-3.png" alt="Nullverse" style="width:min(240px,70%);height:auto;margin-bottom:20px">
                <h1>Account required</h1>
                <p>You need to be logged in to ${escapeHtml(action)}. Guest Mode is read-only and cannot use personal pages, creation tools, messaging, reporting, or moderation controls.</p>
                <div class="nv-guest-protected-actions">
                    ${isArchitectGuestPreviewRequested() ? `<a class="primary" href="#" data-nv-protected-exit>Log In as Architect</a>` : `<a class="primary" href="login.html">Log In</a>`}
                    <a href="index.html">Continue Browsing</a>
                </div>
            </section>
        </main>`;
    ensureGuestStyles();
    document.querySelector("[data-nv-protected-exit]")?.addEventListener("click", event => {
        event.preventDefault();
        exitArchitectGuestPreview("index.html");
    });
}

export function showBetaGuestUnavailable() {
    ensureGuestStyles();
    document.querySelector(".nv-guest-modal-backdrop")?.remove();
    const backdrop = document.createElement("div");
    backdrop.className = "nv-guest-modal-backdrop";
    backdrop.innerHTML = `
        <section class="nv-guest-modal" role="dialog" aria-modal="true">
            <h2>Guest access is still in beta</h2>
            <p>Public Guest Mode is not available yet. Nullverse is still in private beta while guest browsing is tested by the Void Architects.</p>
            <div class="nv-guest-modal-actions"><button class="primary" type="button" data-nv-guest-close>Got it</button></div>
        </section>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector("[data-nv-guest-close]")?.addEventListener("click", () => backdrop.remove());
}

export function exitArchitectGuestPreview(destination = null) {
    clearArchitectGuestPreview();
    const target = destination || `${location.pathname.split("/").pop() || "index.html"}${location.search || ""}${location.hash || ""}`;
    window.location.href = target;
}

export function installGuestInteractionGuards(isGuest = true) {
    if (!isGuest || document.documentElement.dataset.nvGuestGuards === "true") return;
    document.documentElement.dataset.nvGuestGuards = "true";

    const restrictedHref = /^(?:\.?\/?)(?:account-settings|dashboard|messages|notifications|admin|create-world|create-addition|edit-world|edit-literature|edit-comic|edit-addition|creator-gallery-studio|profile-setup|chat)\.html(?:[?#]|$)/i;
    const actionWords = /^(?:like|unlike|follow|following|follow back|request|requested|comment|post comment|submit comment|add comment|reply|report|submit report|message|join|post|create|edit|delete|save|publish|ask question|submit question|answer|submit answer|add addition|moderate|ban|restrict|suspend|hide|restore|appeal|block|unblock|add gallery item|open my gallery)$/i;

    document.addEventListener("click", event => {
        const target = event.target.closest("a,button,[role='button']");
        if (!target) return;

        if (target.matches("[data-nv-exit-guest-preview],[data-nv-guest-close],[data-nv-protected-exit]")) return;
        if (target.closest(".nv-guest-modal-backdrop,.nv-guest-protected")) return;

        // Content-warning review/reveal controls are part of Balanced guest browsing,
        // not account-only interactions. Never swallow these clicks.
        if (target.matches("[data-nv-gallery-warning-gate],[data-nv-warning-reveal],#gallery-warning-confirm,#home-gallery-warning-confirm,[data-nv-content-warning-confirm]") ||
            target.closest("#gallery-warning-modal,#home-gallery-warning-modal,#safety-modal,.content-warning-panel,.locked-showcase-shell") ||
            /revealGalleryItemSafety|showSafetyGate|contentOk/i.test(String(target.getAttribute("onclick") || ""))) {
            return;
        }

        const href = target.getAttribute("href") || "";
        const explicitAction = target.dataset.guestAction || target.dataset.nvGuestAction || "";
        const text = String(target.textContent || "").trim().replace(/\s+/g, " ");
        const className = String(target.className || "");
        const looksInteractive = actionWords.test(text) || /(follow|like|comment|report|message|moder|owner-action|edit-button|delete|publish|save)/i.test(className);

        if (restrictedHref.test(href) || explicitAction || looksInteractive) {
            event.preventDefault();
            event.stopImmediatePropagation();
            const action = explicitAction || (text ? text.toLowerCase() : "use this feature");
            showGuestActionPrompt(action);
        }
    }, true);
}

export function applyGuestLegacyNavigation(isGuest = true) {
    if (!isGuest) return;
    const nav = document.querySelector("header nav");
    if (!nav) return;
    nav.innerHTML = `
        <a href="index.html">Home</a>
        <a href="explore.html">Explore</a>
        <a href="creators.html">Creators</a>
        <a href="gallery.html">Gallery</a>
        ${isArchitectGuestPreviewRequested() ? `<button type="button" data-nv-exit-guest-preview>Log In</button>` : `<a href="login.html">Log In</a>`}
    `;
    nav.querySelector("[data-nv-exit-guest-preview]")?.addEventListener("click", () => exitArchitectGuestPreview());
}

function clearTransientGuestUi() {
    document.querySelector(".nv-guest-modal-backdrop")?.remove();
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
