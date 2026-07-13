import { supabase } from "./supabaseClient.js";

let finalState = { denied: false, access: null, route: null };

try {
    const route = resolveProtectedRoute();
    finalState.route = route;
    if (route) finalState = await guardProtectedRoute(route);
} catch (error) {
    console.warn("Creator privacy guard failed safely:", error);
    finalState = { ...finalState, denied: false, error: error?.message || String(error) };
} finally {
    const resolver = typeof window.__resolveNvCreatorPrivacy === "function"
        ? window.__resolveNvCreatorPrivacy
        : null;
    resolver?.(finalState);
    window.dispatchEvent(new CustomEvent("nvcreatorprivacyready", { detail: finalState }));
}

function resolveProtectedRoute() {
    const file = location.pathname.split("/").pop()?.toLowerCase() || "";
    const params = new URLSearchParams(location.search);
    if (file === "creator-gallery.html") {
        return { type: "creator_gallery", username: params.get("user") || params.get("username") || "", contentId: null };
    }
    if (file === "creator-gallery-item.html") {
        return { type: "gallery_item", username: "", contentId: params.get("id") || params.get("item") || "" };
    }
    if (["world.html", "literature.html", "comic.html"].includes(file)) {
        return { type: file.replace(".html", ""), username: "", contentId: params.get("id") || "" };
    }
    return null;
}

async function guardProtectedRoute(route) {
    if (route.type === "creator_gallery" && !route.username) {
        const authResult = await withTimeout(
            supabase.auth.getUser(),
            2500,
            "Creator privacy authentication check"
        );
        const user = authResult?.data?.user || null;
        if (!user) return { denied: false, access: null, route };

        const ownerResult = await withTimeout(
            supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
            2500,
            "Creator privacy owner lookup"
        );
        route.username = ownerResult?.data?.username || "";
    }

    if (route.type !== "creator_gallery" && !route.contentId) {
        return { denied: false, access: null, route };
    }
    if (route.type === "creator_gallery" && !route.username) {
        return { denied: false, access: null, route };
    }

    const rpcResult = await withTimeout(
        supabase.rpc("nv_content_access_state", {
            p_content_type: route.type,
            p_content_id: route.contentId || null,
            p_username: route.username || null
        }),
        4500,
        "Creator privacy access check"
    );

    const { data, error } = rpcResult || {};
    if (error) {
        // Database RLS remains the final privacy boundary. The fail-open client result
        // prevents a missing/older preview migration from freezing an otherwise valid page.
        console.warn("Creator privacy guard unavailable until its migration runs:", error.message);
        return { denied: false, access: null, route, migrationMissing: true };
    }

    const access = Array.isArray(data) ? data[0] : data;
    if (!access || access.can_access !== false) {
        return { denied: false, access: access || null, route };
    }

    try {
        await renderLockedCreatorContent(access);
    } catch (error) {
        console.error("Could not render the private creator lock screen:", error);
        renderEmergencyPrivateLock(access);
    }
    return { denied: true, access, route };
}

async function renderLockedCreatorContent(access) {
    document.documentElement.dataset.nvCreatorAccess = "denied";
    document.body.classList.add("nv-private-content-locked");

    const authResult = await withTimeout(
        supabase.auth.getUser(),
        2200,
        "Private profile viewer check"
    ).catch(() => ({ data: { user: null } }));
    const user = authResult?.data?.user || null;

    let relationship = "signed_out";
    if (user) {
        const result = await withTimeout(
            supabase.rpc("nv_relationship_state", { p_target_id: access.owner_id }),
            2500,
            "Private profile relationship check"
        ).catch(() => ({ data: null }));
        const row = Array.isArray(result?.data) ? result.data[0] : result?.data;
        relationship = row?.relationship_state || "none";
    }

    const username = access.username || "creator";
    const displayName = access.display_name || username;
    const avatar = access.avatar_url || "https://placehold.co/160x160/1b1b28/ffffff?text=NV";
    const actionLabel = relationship === "requested" ? "Requested" : relationship === "following" ? "Following" : "Request to Follow";

    const style = document.createElement("style");
    style.id = "nv-private-content-lock-style";
    style.textContent = `
        html[data-nv-creator-access="denied"] body > :not(#nv-site-header):not(#nv-mobile-nav):not(#nv-private-content-lock):not(script):not(style) { visibility:hidden !important; }
        #nv-private-content-lock {
            position:fixed; inset:var(--nv-header-height,74px) 0 0; z-index:4990;
            overflow:auto; display:grid; place-items:center; padding:28px 18px 100px;
            background:var(--page-bg); color:var(--text-primary); visibility:visible !important;
        }
        .nv-private-content-card { width:min(620px,100%); padding:clamp(28px,5vw,52px); border:1px solid var(--border-color); border-radius:28px; background:linear-gradient(135deg,rgba(255,255,255,.065),rgba(255,255,255,.015)),var(--panel-bg); box-shadow:0 28px 90px rgba(0,0,0,.4); text-align:center; }
        .nv-private-content-avatar { width:92px;height:92px;margin:0 auto 16px;padding:4px;border:1px solid var(--border-color);border-radius:50%;background:var(--bg-secondary); }
        .nv-private-content-avatar img { width:100%;height:100%;border-radius:50%;object-fit:cover; }
        .nv-private-content-card h1 { margin:0;font-size:clamp(1.8rem,6vw,3rem); }
        .nv-private-content-handle { margin-top:5px;color:var(--text-muted); }
        .nv-private-content-lock-icon { width:52px;height:52px;display:grid;place-items:center;margin:22px auto 13px;border:1px solid var(--border-color);border-radius:50%;background:var(--bg-elevated);font-size:1.35rem; }
        .nv-private-content-card p { max-width:500px;margin:0 auto;color:var(--text-secondary);line-height:1.65; }
        .nv-private-content-actions { display:flex;justify-content:center;gap:10px;flex-wrap:wrap;margin-top:22px; }
        .nv-private-content-actions a,.nv-private-content-actions button { min-height:44px;display:inline-flex;align-items:center;justify-content:center;padding:0 16px;border:1px solid var(--border-color);border-radius:13px;background:var(--bg-elevated);color:var(--text-primary);text-decoration:none;font:inherit;font-weight:850;cursor:pointer; }
        .nv-private-content-actions .primary { color:#fff;background:linear-gradient(180deg,#42424b,#141419);border-color:rgba(255,255,255,.17); }
        .nv-private-content-actions .requested { color:#ffe2a2;border-color:rgba(255,211,107,.35); }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement("section");
    overlay.id = "nv-private-content-lock";
    overlay.innerHTML = `
        <div class="nv-private-content-card">
            <div class="nv-private-content-avatar"><img src="${escapeHtml(avatar)}" alt=""></div>
            <h1>${escapeHtml(displayName)}</h1>
            <div class="nv-private-content-handle">@${escapeHtml(username)}</div>
            <div class="nv-private-content-lock-icon" aria-hidden="true">🔒</div>
            <p>This creator has a private profile. Their published creations, Creator Gallery, and detailed showcases unlock after they approve your follow request.</p>
            <div class="nv-private-content-actions">
                <a href="profile.html?user=${encodeURIComponent(username)}">View Profile</a>
                ${user
            ? `<button id="nv-private-follow-action" class="primary ${escapeHtml(relationship)}" type="button">${escapeHtml(actionLabel)}</button>`
            : `<a class="primary" href="login.html">Beta Login to Request</a>`}
            </div>
        </div>`;
    document.body.appendChild(overlay);

    document.getElementById("nv-private-follow-action")?.addEventListener("click", async event => {
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = "Updating...";
        try {
            const result = await withTimeout(
                supabase.rpc("nv_follow_toggle", { p_target_id: access.owner_id }),
                5000,
                "Follow request update"
            );
            if (result?.error) throw result.error;
            const row = Array.isArray(result?.data) ? result.data[0] : result?.data;
            const next = row?.relationship_state || "none";
            button.className = `primary ${next}`;
            button.textContent = next === "requested" ? "Requested" : next === "following" ? "Following" : "Request to Follow";
            if (row?.can_access === true) location.reload();
        } catch (error) {
            alert(error?.message || "Could not update this follow request.");
            button.textContent = actionLabel;
        } finally {
            button.disabled = false;
        }
    });
}

function renderEmergencyPrivateLock(access) {
    document.documentElement.dataset.nvCreatorAccess = "denied";
    document.body.innerHTML = `
        <main style="min-height:100vh;display:grid;place-items:center;padding:24px;background:#08080d;color:#fff;font-family:Arial,sans-serif;text-align:center;">
            <section style="width:min(560px,100%);padding:36px;border:1px solid rgba(255,255,255,.18);border-radius:24px;background:#111119;">
                <div style="font-size:2rem;">🔒</div>
                <h1>${escapeHtml(access?.display_name || access?.username || "Private Creator")}</h1>
                <p style="color:#b7b7c4;line-height:1.6;">This creator profile is private. Open their profile to request access.</p>
                <a style="display:inline-flex;margin-top:14px;padding:12px 16px;border-radius:12px;background:#fff;color:#111;text-decoration:none;font-weight:800;" href="profile.html?user=${encodeURIComponent(access?.username || "")}">View Profile</a>
            </section>
        </main>`;
}

function withTimeout(promise, milliseconds, label) {
    let timeoutId;
    const timeout = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(`${label} timed out.`)), milliseconds);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId));
}

function escapeHtml(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}
