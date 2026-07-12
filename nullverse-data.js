import { supabase } from "./supabaseClient.js";

export async function loadViewerContext(userId) {
    const [profileResult, forwardBlocks, reverseBlocks] = await Promise.all([
        supabase
            .from("profiles")
            .select("id, username, display_name, avatar_url, banner_url, bio, role, account_status, content_experience, blocked_content_warnings, age_role, profile_completed, age_verified, birth_date")
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

export async function fetchHomeFeed(mode = "for_you", limit = 12, offset = 0) {
    const rpc = await supabase.rpc("nv_home_feed", {
        p_mode: mode,
        p_limit: limit,
        p_offset: offset
    });

    if (!rpc.error) return rpc.data || [];
    console.warn("nv_home_feed unavailable, using direct query:", rpc.error.message);
    return fallbackWorldFeed(mode, limit, offset);
}

export async function fetchGalleryFeed(mode = "trending", limit = 12, offset = 0, options = {}) {
    const rpc = await supabase.rpc("nv_gallery_feed", {
        p_mode: mode,
        p_limit: limit,
        p_offset: offset,
        p_search: options.search || null,
        p_age_rating: options.ageRating || null
    });

    if (!rpc.error) return rpc.data || [];
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
    return attachProfiles(data || [], "owner_id");
}

export async function fetchDiscoverCreators(limit = 10) {
    const rpc = await supabase.rpc("nv_discover_creators", { p_limit: limit });
    if (!rpc.error) return rpc.data || [];

    const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url, banner_url, bio, role, account_status")
        .eq("account_status", "active")
        .not("username", "is", null)
        .order("created_at", { ascending: false })
        .limit(limit);
    if (error) throw error;
    return data || [];
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
    return data || [];
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
        return readLocalRecentContent(limit);
    }
    return data || [];
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
        .select("id, username, display_name, avatar_url, banner_url, bio, account_status")
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
    return attachLikeCounts(withProfiles);
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
// JavaScript source code
