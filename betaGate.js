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

function showConnectionError() {
    document.body.innerHTML = `
        <main style="
            min-height:100vh;
            display:flex;
            align-items:center;
            justify-content:center;
            background:#05040a;
            color:white;
            font-family:Arial,sans-serif;
            padding:30px;
            text-align:center;
        ">
            <section style="
                max-width:520px;
                background:rgba(255,255,255,0.06);
                border:1px solid rgba(255,255,255,0.12);
                border-radius:22px;
                padding:34px;
                box-shadow:0 20px 60px rgba(0,0,0,0.35);
            ">
                <h1 style="margin-top:0;">Connection Issue</h1>
                <p style="color:#c9c9d4; line-height:1.6;">
                    Nullverse could not connect to its servers.
                    Please refresh, try again later, or switch networks.
                </p>
                <button onclick="location.reload()" style="
                    margin-top:14px;
                    padding:12px 16px;
                    border-radius:12px;
                    border:1px solid rgba(255,255,255,0.14);
                    background:#1f1f26;
                    color:white;
                    cursor:pointer;
                ">
                    Try Again
                </button>
                <button onclick="localStorage.clear(); location.href='/login.html'" style="
                    margin-top:10px;
                    padding:12px 16px;
                    border-radius:12px;
                    border:1px solid rgba(255,255,255,0.14);
                    background:#111116;
                    color:white;
                    cursor:pointer;
                ">
                    Reset Login
                </button>
            </section>
        </main>
    `;
}

function redirectTo(path) {
    if (window.location.pathname !== path) {
        window.location.replace(path);
    }
}

async function withTimeout(promise, ms = 8000) {
    let timeout;

    const timeoutPromise = new Promise((_, reject) => {
        timeout = setTimeout(() => {
            reject(new Error("Connection timed out"));
        }, ms);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        clearTimeout(timeout);
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
        const sessionResult = await withTimeout(
            supabase.auth.getSession(),
            8000
        );

        const session = sessionResult.data?.session || null;

        if (!session || sessionResult.error) {
            clearBrokenSession();
            redirectTo("/login.html");
            return null;
        }

        const userResult = await withTimeout(
            supabase.auth.getUser(),
            8000
        );

        user = userResult.data?.user || null;

        if (!user || userResult.error) {
            clearBrokenSession();
            redirectTo("/login.html");
            return null;
        }
    } catch (error) {
        console.warn("Auth connection failed:", error);
        showConnectionError();
        return null;
    }

    try {
        const { data: betaData, error: betaError } = await withTimeout(
            supabase
                .from("beta_access")
                .select("role")
                .eq("email", user.email)
                .maybeSingle(),
            8000
        );

        if (betaError || !betaData) {
            await supabase.auth.signOut();
            clearBrokenSession();
            redirectTo("/closed-beta.html");
            return null;
        }

        const { data: profile, error: profileError } = await withTimeout(
            supabase
                .from("profiles")
                .select("id, role, account_status, moderation_expires_at, moderation_reason, profile_completed, age_verified, age_role, birth_date")
                .eq("id", user.id)
                .maybeSingle(),
            8000
        );

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
            await withTimeout(
                supabase
                    .from("profiles")
                    .update({ age_role: currentAgeRole })
                    .eq("id", user.id),
                8000
            );

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
            const { error: restoreError } = await withTimeout(
                supabase
                    .from("profiles")
                    .update({
                        account_status: "active",
                        moderation_expires_at: null,
                        moderation_reason: null
                    })
                    .eq("id", user.id),
                8000
            );

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

    } catch (error) {
        console.warn("Beta gate failed:", error);
        showConnectionError();
        return null;
    }
}