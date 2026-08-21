import { supabase } from "./supabaseClient.js?v=20260818";
import { getNullverseAccessContext, getGuestViewerContext, filterGuestSafeContent } from "./nullverse-guest.js?v=20260821";

export async function loadViewerContext(userId) {
    if (!userId) return getGuestViewerContext();

    const [profileResult, forwardBlocks, reverseBlocks] = await Promise.all([
        supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url, banner_url, bio, creator_type, profile_status, role, role_name, account_status, content_experience, blocked_content_warnings, age_role, profile_completed, age_verified, birth_date, profile_visibility, discoverable")
            .eq("id", userId)
            .maybeSingle(),
        supabase.from("user_blocks").select("blocked_id").eq("blocker_id", userId).limit(1000),
        supabase.from("user_blocks").select("blocker_id").eq("blocked_id", userId).limit(1000)
    ]);

    const profile = profileResult.data || null;
    const blockedUserIds = [...new Set([
        ...(forwardBlocks.data || []).map(row => row.blocked_id),
        ...(reverseBlocks.data || []).map(row => row.blocker_id)
    ].filter(Boolean))];

    return {
        profile,
        blockedUserIds,
        safety: {
            contentExperience: profile?.content_experience || "balanced",
            blockedContentWarnings: profile?.blocked_content_warnings || [],
            ageRole: profile?.age_role || "unknown"
        }
    };
}

async function applyCurrentGuestSafety(rows = []) {
    const access = await getNullverseAccessContext();
    return filterGuestSafeContent(rows, Boolean(access?.isGuest));
}

export async function fetchHomeFeed(mode = "for_you", limit = 12, offset = 0) {
    const rpc = await supabase.rpc("nv_home_feed", {
        p_mode: mode,
        p_limit: limit,
        p_offset: offset
    });

    if (!rpc.error) {
        const accessible = await filterAccessibleCreatorItems(rpc.data || []);
        const guestSafe = await applyCurrentGuestSafety(accessible);
        return hydrateWorldCardCredits(guestSafe);
    }
    console.warn("nv_home_feed unavailable, using direct query:", rpc.error.message);
    return fallbackWorldFeed(mode, limit, offset);
}

async function hydrateWorldCardCredits(rows = []) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const ids = [...new Set(safeRows.map(row => row?.id || row?.content_id).filter(Boolean))];
    if (!ids.length) return safeRows;

    const { data, error } = await supabase
        .from("worlds")
        .select("id, cover_image_url, theme_overview_card_image_url, overview_card_credit_type, overview_card_credit_name, overview_card_credit_url, overview_card_credit_note, overview_card_credit_nullverse_username, cover_credit_type, cover_credit_name, cover_credit_url, cover_credit_note, cover_credit_nullverse_username, updated_at")
        .in("id", ids);

    if (error || !data?.length) {
        if (error) console.warn("Could not refresh World card credits:", error.message);
        return safeRows;
    }

    const byId = new Map(data.map(row => [String(row.id), row]));
    return safeRows.map(row => {
        const latest = byId.get(String(row.id || row.content_id));
        if (!latest) return row;
        return {
            ...row,
            ...latest,
            cover_image_url: latest.cover_image_url || row.cover_image_url || "",
            theme_overview_card_image_url: latest.theme_overview_card_image_url || row.theme_overview_card_image_url || "",
            updated_at: latest.updated_at || row.updated_at
        };
    });
}

export async function fetchGalleryFeed(mode = "trending", limit = 12, offset = 0, options = {}) {
    const rpc = await supabase.rpc("nv_gallery_feed", {
        p_mode: mode,
        p_limit: limit,
        p_offset: offset,
        p_search: options.search || null,
        p_age_rating: options.ageRating || null
    });

    if (!rpc.error) {
        const accessible = await filterAccessibleCreatorItems(rpc.data || []);
        return hydrateGalleryPreviewMedia(await applyCurrentGuestSafety(accessible));
    }
    console.warn("nv_gallery_feed unavailable, using direct query:", rpc.error.message);

    let query = supabase
        .from("creator_proof_gallery")
        .select("*")
        .eq("visibility", "public")
        .in("moderation_status", ["approved", "visible"])
        .order("updated_at", { ascending: false })
        .range(offset, offset + limit - 1);

    if (options.search) {
        const safe = sanitizePostgrestTerm(options.search);
        query = query.or(`title.ilike.%${safe}%,description.ilike.%${safe}%`);
    }
    if (options.ageRating) query = query.eq("age_rating", options.ageRating);

    const { data, error } = await query;
    if (error) throw error;
    const attached = await attachProfiles(data || [], "owner_id");
    const accessible = await filterAccessibleCreatorItems(attached, "owner_id");
    return hydrateGalleryPreviewMedia(await applyCurrentGuestSafety(accessible));
}

async function hydrateGalleryPreviewMedia(rows = []) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const ids = [...new Set(safeRows.map(row => row?.id).filter(Boolean))];
    if (!ids.length) return safeRows;

    let result = await supabase
        .from("creator_proof_gallery")
        .select("id, image_url, image_placement, image_credit_type, image_credit_name, image_credit_url, image_credit_note, image_credit_nullverse_username, updated_at")
        .in("id", ids);

    // If the universal Gallery credit migration has not been run yet, keep the
    // feed alive and fall back to the older media-only projection.
    if (result.error) {
        result = await supabase
            .from("creator_proof_gallery")
            .select("id, image_url, image_placement, updated_at")
            .in("id", ids);
    }

    // Older schemas may not have image_placement either. Still refresh the image
    // URL so a newly replaced preview never remains stale.
    if (result.error) {
        result = await supabase
            .from("creator_proof_gallery")
            .select("id, image_url, updated_at")
            .in("id", ids);
    }

    if (result.error || !result.data?.length) {
        if (result.error) console.warn("Could not refresh Gallery preview media:", result.error.message);
        return safeRows;
    }

    const mediaById = new Map(result.data.map(row => [String(row.id), row]));
    return safeRows.map(row => {
        const latest = mediaById.get(String(row.id));
        if (!latest) return row;
        return {
            ...row,
            ...latest,
            image_url: latest.image_url || row.image_url || "",
            image_placement: latest.image_placement ?? row.image_placement ?? null,
            updated_at: latest.updated_at || row.updated_at
        };
    });
}

export async function fetchDiscoverCreators(limit = 10) {
    const access = await getNullverseAccessContext();
    const guest = Boolean(access?.isGuest);
    const directory = await supabase.rpc("nv_creator_directory", {
        p_search: null,
        p_creator_type: null,
        p_mode: guest ? "trending" : "for_you",
        p_privacy: guest ? "public" : "all",
        p_require_gallery: false,
        p_require_content: false,
        p_limit: limit,
        p_offset: 0
    });
    if (!directory.error) {
        const rows = directory.data || [];
        return guest ? rows.filter(row => row.profile_visibility !== "private") : rows;
    }

    const rpc = await supabase.rpc("nv_discover_creators", { p_limit: limit });
    if (!rpc.error) {
        const rows = rpc.data || [];
        return guest ? rows.filter(row => row.profile_visibility !== "private") : rows;
    }

    let query = supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, banner_url, bio, creator_type, profile_status, role, role_name, account_status, profile_visibility, discoverable")
        .eq("account_status", "active")
        .not("username", "is", null);
    if (guest) query = query.eq("profile_visibility", "public");
    const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data || [];
}

export async function filterAccessibleCreatorItems(items = [], ownerKey = "owner_id") {
    const rows = Array.isArray(items) ? items : [];
    const ownerIds = [...new Set(rows.map(row => row?.[ownerKey]).filter(Boolean))];
    if (!ownerIds.length) return rows;

    const access = await getNullverseAccessContext();
    const guest = Boolean(access?.isGuest);
    const [{ data, error }, publicProfiles] = await Promise.all([
        supabase.rpc("nv_filter_accessible_creator_ids", { p_owner_ids: ownerIds }),
        guest
            ? supabase.from("profiles").select("id, profile_visibility").in("id", ownerIds)
            : Promise.resolve({ data: null, error: null })
    ]);

    const guestPublicIds = guest
        ? new Set((publicProfiles?.data || []).filter(profile => profile.profile_visibility !== "private").map(profile => String(profile.id)))
        : null;

    if (error) {
        console.warn("Creator privacy filter unavailable until its migration runs:", error.message);
        return guest
            ? rows.filter(row => guestPublicIds.has(String(row?.[ownerKey] || "")))
            : rows;
    }

    const allowed = new Set((data || []).map(row => String(row.owner_id || row)));
    return rows.filter(row => {
        const ownerId = String(row?.[ownerKey] || "");
        return allowed.has(ownerId) && (!guest || guestPublicIds.has(ownerId));
    });
}

export async function fetchFollowingActivity(limit = 8) {
    const rpc = await supabase.rpc("nv_following_activity", { p_limit: limit });
    if (!rpc.error) return rpc.data || [];
    console.warn("Following activity is unavailable until the Home 2.0 SQL migration is run.");
    return [];
}

export async function fetchFeaturedContent(limit = 6) {
    const { data, error } = await supabase
        .from("nv_featured_content")
        .select("*")
        .eq("is_active", true)
        .or(`starts_at.is.null,starts_at.lte.${new Date().toISOString()}`)
        .or(`ends_at.is.null,ends_at.gte.${new Date().toISOString()}`)
        .order("priority", { ascending: false })
        .limit(limit);

    if (error) {
        console.warn("Featured content unavailable until migration runs:", error.message);
        return [];
    }
    return applyCurrentGuestSafety(data || []);
}

export async function fetchRecentContent(userId, limit = 8) {
    const { data, error } = await supabase
        .from("nv_user_recent_content")
        .select("*")
        .eq("user_id", userId)
        .order("last_opened_at", { ascending: false })
        .limit(limit);

    if (error) {
        console.warn("Recent content sync unavailable until migration runs:", error.message);
        return hydrateWorldCardCredits(readLocalRecentContent(limit));
    }
    return hydrateWorldCardCredits(data || []);
}

export async function fetchDashboardMetrics() {
    const { data, error } = await supabase.rpc("nv_dashboard_metrics");
    if (!error && data?.length) return data[0];
    return null;
}

export async function attachProfiles(items, ownerKey = "owner_id") {
    const ids = [...new Set((items || []).map(item => item?.[ownerKey]).filter(Boolean))];
    if (!ids.length) return items || [];

    const { data } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, banner_url, bio, creator_type, profile_status, account_status, profile_visibility, discoverable")
        .in("id", ids);

    const map = Object.fromEntries((data || []).map(profile => [profile.id, profile]));
    return (items || []).map(item => ({ ...item, ...(map[item?.[ownerKey]] || {}) }));
}

async function fallbackWorldFeed(mode, limit, offset) {
    let query = supabase
        .from("worlds")
        .select("*")
        .eq("visibility", "published")
        .eq("moderation_status", "visible");

    if (mode === "following") {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return [];
        const { data: follows } = await supabase
            .from("follows")
            .select("following_id")
            .eq("follower_id", user.id);
        const ids = (follows || []).map(row => row.following_id);
        if (!ids.length) return [];
        query = query.in("owner_id", ids);
    }

    query = query.order(mode === "newest" ? "created_at" : "updated_at", { ascending: false });
    const { data, error } = await query.range(offset, offset + limit - 1);
    if (error) throw error;

    const withProfiles = await attachProfiles(data || [], "owner_id");
    const accessible = await filterAccessibleCreatorItems(withProfiles, "owner_id");
    const guestSafe = await applyCurrentGuestSafety(accessible);
    return attachLikeCounts(guestSafe);
}

async function attachLikeCounts(items) {
    const ids = items.map(item => item.id).filter(Boolean);
    if (!ids.length) return items;
    const { data } = await supabase.from("world_likes").select("world_id").in("world_id", ids);
    const counts = {};
    (data || []).forEach(row => counts[row.world_id] = (counts[row.world_id] || 0) + 1);
    return items.map(item => ({ ...item, like_count: counts[item.id] || 0 }));
}

function readLocalRecentContent(limit) {
    const candidates = [
        "nullverse-recent-content",
        "nullverse_recent_content",
        "nv-recent-content"
    ];

    for (const key of candidates) {
        try {
            const parsed = JSON.parse(localStorage.getItem(key) || "[]");
            if (Array.isArray(parsed)) return parsed.slice(0, limit);
        } catch { }
    }
    return [];
}

function sanitizePostgrestTerm(value) {
    return String(value || "").replace(/[,%()]/g, " ").trim();
}
