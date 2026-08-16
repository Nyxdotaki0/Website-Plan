const PREMIUM_PLAN = "premium";
const PREMIUM_CACHE_TTL_MS = 30000;
const premiumCache = new Map();

export const PREMIUM_BADGE = Object.freeze({
    key: "premium",
    label: "Premium",
    className: "premium"
});

export const BASIC_ENTITLEMENT = Object.freeze({
    userId: null,
    plan: "basic",
    premiumUntil: null,
    isPremium: false,
    available: true
});

function normalizeDate(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
}

export function normalizePremiumEntitlement(row, userId = null) {
    const plan = String(row?.plan || "basic").trim().toLowerCase();
    const premiumUntilDate = normalizeDate(row?.premium_until);
    const notExpired = !premiumUntilDate || premiumUntilDate.getTime() > Date.now();
    const isPremium = plan === PREMIUM_PLAN && notExpired;

    return {
        userId: row?.user_id || userId || null,
        plan: isPremium ? PREMIUM_PLAN : "basic",
        storedPlan: plan,
        premiumUntil: premiumUntilDate ? premiumUntilDate.toISOString() : null,
        isPremium,
        available: true
    };
}

export async function getPremiumEntitlement(supabase, userId, { force = false } = {}) {
    const id = String(userId || "").trim();
    if (!id || !supabase) return { ...BASIC_ENTITLEMENT, userId: id || null };

    const cached = premiumCache.get(id);
    if (!force && cached && Date.now() - cached.loadedAt < PREMIUM_CACHE_TTL_MS) {
        return cached.value;
    }

    try {
        // The browser only receives the active Premium boolean. Billing/expiry
        // metadata stays private in user_entitlements and is evaluated server-side.
        const { data, error } = await supabase.rpc("nv_has_premium", { p_user_id: id });

        if (error) throw error;
        const value = {
            userId: id,
            plan: data === true ? PREMIUM_PLAN : "basic",
            storedPlan: data === true ? PREMIUM_PLAN : "basic",
            premiumUntil: null,
            isPremium: data === true,
            available: true
        };
        premiumCache.set(id, { loadedAt: Date.now(), value });
        return value;
    } catch (error) {
        console.warn("Premium entitlement lookup failed; using Basic access.", error?.message || error);
        const value = { ...BASIC_ENTITLEMENT, userId: id, available: false, error };
        premiumCache.set(id, { loadedAt: Date.now(), value });
        return value;
    }
}

export function clearPremiumEntitlementCache(userId = null) {
    if (userId) premiumCache.delete(String(userId));
    else premiumCache.clear();
}

export function addPremiumBadge(badges = [], entitlement = null) {
    const output = Array.isArray(badges) ? [...badges] : [];
    if (entitlement?.isPremium && !output.some(badge => badge?.key === PREMIUM_BADGE.key)) {
        output.push({ ...PREMIUM_BADGE });
    }
    return output;
}

function clearThemePresentationFields(record) {
    if (!record || typeof record !== "object") return record;
    Object.keys(record).forEach(key => {
        if (String(key).startsWith("theme_")) delete record[key];
    });
    return record;
}

export function applyBasicProjectAppearance(record) {
    if (!record || typeof record !== "object") return record;
    clearThemePresentationFields(record);
    // Appearance-image credits are hidden together with their Premium-only image.
    // The saved database values are untouched because public pages pass a local copy.
    ["background_credit_", "overview_card_credit_", "index_credit_"].forEach(prefix => {
        Object.keys(record).forEach(key => {
            if (String(key).startsWith(prefix)) delete record[key];
        });
    });
    // Keep explicit selectors for older renderers that do not use || "default".
    record.theme_background_style = "default";
    record.theme_index_style = "default";
    record.theme_overview_card_style = "default";
    record.theme_button_style = "default";
    record.theme_index_button_style = "default";
    record.theme_card_style = "default";
    record.theme_gradient_enabled = false;
    return record;
}

export function applyBasicSectionAppearance(record) {
    if (!record || typeof record !== "object") return record;
    clearThemePresentationFields(record);
    Object.keys(record).forEach(key => {
        if (String(key).startsWith("card_credit_")) delete record[key];
    });
    record.theme_card_style = "default";
    return record;
}

export function applyBasicProfileAppearance(profile) {
    if (!profile || typeof profile !== "object") return profile;
    profile.profile_layout_mode = "default";
    return profile;
}

export function premiumMessage(feature = "This customization") {
    return `${feature} is a Premium feature. Your existing Premium design is kept safely if you return to Basic, but it stays inactive until Premium is active again.`;
}

export function showPremiumNotice(feature = "This customization") {
    const message = premiumMessage(feature);
    if (typeof window !== "undefined") {
        if (typeof window.showAccountSettingsToast === "function") {
            window.showAccountSettingsToast("Premium feature", message, "warning");
        } else {
            window.alert(message);
        }
    }
    return false;
}

function ensurePremiumGateStyles() {
    if (typeof document === "undefined" || document.getElementById("nullverse-premium-gate-styles")) return;
    const style = document.createElement("style");
    style.id = "nullverse-premium-gate-styles";
    style.textContent = `
        /* Basic accounts should see a clean creation experience, not disabled upsell clutter. */
        .nv-premium-hidden,
        .nv-premium-section-hidden {
            display: none !important;
            visibility: hidden !important;
            pointer-events: none !important;
        }
        .profile-badge.premium,
        .custom-profile-badge.premium {
            background: linear-gradient(180deg, rgba(255,214,102,.18), rgba(255,214,102,.055)), #050506;
            color: #fff2be;
            border-color: rgba(255,214,102,.8);
            box-shadow: 0 0 0 1px rgba(255,214,102,.2), 0 0 18px rgba(255,214,102,.16);
        }
    `;
    document.head.appendChild(style);
}

function hidePremiumSection(section) {
    if (!section || section.dataset.premiumGateApplied === "1") return;
    section.dataset.premiumGateApplied = "1";
    section.classList.add("nv-premium-section-hidden");
    section.hidden = true;
    section.setAttribute("aria-hidden", "true");
}

function hidePremiumControl(control) {
    if (!control || control.dataset.premiumGateApplied === "1") return;
    control.dataset.premiumGateApplied = "1";
    control.classList.add("nv-premium-hidden");
    control.hidden = true;
    control.setAttribute("aria-hidden", "true");
    control.setAttribute("tabindex", "-1");
}

export function lockAppearanceSections(root = document, { isPremium = false, featureLabel = "Appearance customization" } = {}) {
    if (typeof document === "undefined" || isPremium) return;
    ensurePremiumGateStyles();
    const scope = root || document;

    scope.querySelectorAll("section,div").forEach(section => {
        const heading = section.querySelector(":scope > h2, :scope > h3, :scope > .section-head h2, :scope > .section-head h3");
        if (!heading) return;
        const title = String(heading.textContent || "").trim();
        if (!/(appearance|page design|reader theme|index design|overview card)/i.test(title)) return;
        hidePremiumSection(section);
    });

    scope.querySelectorAll('[onclick*="openAppearanceSettings"], #appearance-card, [data-premium-only="true"]').forEach(hidePremiumControl);
}

export function installAppearanceGate({ isPremium = false, root = document, featureLabel = "Appearance customization" } = {}) {
    if (isPremium || typeof MutationObserver === "undefined") return null;
    ensurePremiumGateStyles();
    const apply = () => lockAppearanceSections(root, { isPremium, featureLabel });
    apply();
    const observer = new MutationObserver(() => apply());
    observer.observe(root === document ? document.body : root, { childList: true, subtree: true });
    return observer;
}
// JavaScript source code
