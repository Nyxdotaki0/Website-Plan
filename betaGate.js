import { supabase } from "./supabaseClient.js";

function getAgeRoleFromBirthDate(birthDate) {
    const today = new Date();
    const dob = new Date(birthDate + "T00:00:00");

    let age = today.getFullYear() - dob.getFullYear();

    const birthdayPassed =
        today.getMonth() > dob.getMonth() ||
        (
            today.getMonth() === dob.getMonth() &&
            today.getDate() >= dob.getDate()
        );

    if (!birthdayPassed) age--;

    if (age < 13) return "blocked";
    if (age < 18) return "minor";

    return "adult";
}

function clearBrokenSession() {
    Object.keys(localStorage).forEach(key => {
        if (
            key.startsWith("sb-") ||
            key.startsWith("supabase") ||
            key.startsWith("nullverse_")
        ) {
            localStorage.removeItem(key);
        }
    });
}

function redirectTo(path) {
    if (window.location.pathname !== path) {
        window.location.replace(path);
    }
}

export async function requireBetaAccess(options = {}) {
    const {
        allowRestricted = true,
        allowSuspended = false,
        allowBanned = false
    } = options;

    let user = null;

    try {
        const { data: sessionData, error: sessionError } =
            await supabase.auth.getSession();

        if (sessionError || !sessionData?.session) {
            clearBrokenSession();
            redirectTo("/login.html");
            return null;
        }

        const result = await supabase.auth.getUser();

        user = result.data?.user || null;

        if (result.error || !user) {
            clearBrokenSession();
            redirectTo("/login.html");
            return null;
        }
    } catch (error) {
        console.warn("Auth session failed. Clearing broken session:", error);

        clearBrokenSession();
        redirectTo("/login.html");
        return null;
    }

    const { data: betaData, error: betaError } = await supabase
        .from("beta_access")
        .select("role")
        .eq("email", user.email)
        .maybeSingle();

    if (betaError || !betaData) {
        await supabase.auth.signOut();
        clearBrokenSession();
        redirectTo("/closed-beta.html");
        return null;
    }

    const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, role, account_status, moderation_expires_at, moderation_reason, profile_completed, age_verified, age_role, birth_date")
        .eq("id", user.id)
        .maybeSingle();

    if (profileError || !profile) {
        redirectTo("/profile-setup.html");
        return null;
    }

    if (
        !profile.profile_completed ||
        !profile.age_verified ||
        !profile.birth_date ||
        profile.age_role === "unknown"
    ) {
        redirectTo("/profile-setup.html");
        return null;
    }

    const currentAgeRole = getAgeRoleFromBirthDate(profile.birth_date);

    if (
        currentAgeRole !== "blocked" &&
        currentAgeRole !== profile.age_role
    ) {
        await supabase
            .from("profiles")
            .update({ age_role: currentAgeRole })
            .eq("id", user.id);

        profile.age_role = currentAgeRole;
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
        redirectTo("/banned.html");
        return null;
    }

    if (status === "suspended" && !allowSuspended) {
        redirectTo("/suspended.html");
        return null;
    }

    if (status === "restricted" && !allowRestricted) {
        redirectTo("/restricted.html");
        return null;
    }

    return user;
}