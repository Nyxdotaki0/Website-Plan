import { supabase } from "./supabaseClient.js";

export async function requireBetaAccess(options = {}) {
    const {
        allowRestricted = true,
        allowSuspended = false,
        allowBanned = false
    } = options;

    const {
        data: { user },
        error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
        window.location.replace("/login.html");
        return null;
    }

    const { data: betaData, error: betaError } = await supabase
        .from("beta_access")
        .select("role")
        .eq("email", user.email)
        .maybeSingle();

    if (betaError || !betaData) {
        await supabase.auth.signOut();
        window.location.replace("/closed-beta.html");
        return null;
    }

    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, role, account_status, moderation_expires_at, moderation_reason")
        .eq("id", user.id)
        .maybeSingle();

    if (profileError || !profile) {
        window.location.replace("/profile-setup.html");
        return null;
    }

    let status = profile.account_status || "active";

    const expiresAt = profile.moderation_expires_at
        ? new Date(profile.moderation_expires_at)
        : null;

    if (
        status !== "active" &&
        expiresAt &&
        expiresAt <= new Date()
    ) {
        const { error: restoreError } = await supabase
            .from("profiles")
            .update({
                account_status: "active",
                moderation_expires_at: null,
                moderation_reason: null
            })
            .eq("id", user.id);

        if (!restoreError) {
            status = "active";
            profile.account_status = "active";
            profile.moderation_expires_at = null;
            profile.moderation_reason = null;
        }
    }

    localStorage.setItem("nullverse_user_role", betaData.role);
    localStorage.setItem("nullverse_profile_role", profile.role || "creator");
    localStorage.setItem("nullverse_account_status", status);
    localStorage.setItem("nullverse_moderation_reason", profile.moderation_reason || "");
    localStorage.setItem("nullverse_moderation_expires_at", profile.moderation_expires_at || "");

    if (status === "banned" && !allowBanned) {
        await supabase.auth.signOut();
        window.location.replace("/banned.html");
        return null;
    }

    if (status === "suspended" && !allowSuspended) {
        window.location.replace("/suspended.html");
        return null;
    }

    if (status === "restricted" && !allowRestricted) {
        window.location.replace("/restricted.html");
        return null;
    }

    return user;
}