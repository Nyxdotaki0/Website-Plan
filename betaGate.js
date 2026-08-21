import { supabase } from "./supabaseClient.js?v=20260818";
import {
    getNullverseAccessContext,
    showGuestProtectedPage
} from "./nullverse-guest.js?v=20260821-fix3";

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

function normalizeEmail(email) {
    return String(email || "")
        .trim()
        .toLowerCase();
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

function showBetaAccessError(email) {
    const safeEmail = escapeHtml(normalizeEmail(email));

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
                max-width:560px;
                background:rgba(255,255,255,0.06);
                border:1px solid rgba(255,255,255,0.12);
                border-radius:22px;
                padding:34px;
                box-shadow:0 20px 60px rgba(0,0,0,0.35);
            ">
                <h1 style="margin-top:0;">Beta Access Needed</h1>
                <p style="color:#c9c9d4; line-height:1.6;">
                    This account is logged in, but the email is not currently on the Nullverse beta access list.
                </p>
                <p style="color:#c9c9d4; line-height:1.6;">
                    Account email:<br>
                    <strong style="color:white; word-break:break-word;">${safeEmail || "Unknown email"}</strong>
                </p>
                <p style="color:#a8a8b8; line-height:1.6; font-size:.95rem;">
                    If this should be a beta tester, add this exact email to the <strong>beta_access</strong> table.
                </p>
                <button onclick="localStorage.clear(); location.href='/login.html'" style="
                    margin-top:14px;
                    padding:12px 16px;
                    border-radius:12px;
                    border:1px solid rgba(255,255,255,0.14);
                    background:#1f1f26;
                    color:white;
                    cursor:pointer;
                ">
                    Back to Login
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

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function withRetry(factory, { attempts = 3, timeoutMs = 9000, delayMs = 450 } = {}) {
    let lastError = null;
    let lastResult = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
        try {
            const result = await withTimeout(Promise.resolve().then(factory), timeoutMs);
            lastResult = result;
            if (!result?.error) return result;
            lastError = result.error;
        } catch (error) {
            lastError = error;
        }

        if (attempt < attempts) await wait(delayMs * attempt);
    }

    if (lastResult) return lastResult;
    throw lastError || new Error("Connection failed");
}

function escapeHtml(value) {
    return String(value || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

export async function requireBetaAccess(options = {}) {
    const {
        allowRestricted = true,
        allowSuspended = false,
        allowBanned = false,
        allowGuest = false,
        guestAction = "use this feature"
    } = options;

    let user = null;

    try {
        const access = await withTimeout(
            getNullverseAccessContext(),
            6500
        );

        if (access?.isGuest) {
            if (allowGuest) {
                return access.effectiveUser;
            }

            showGuestProtectedPage(guestAction);
            // Keep the calling page suspended so legacy editors/personal tools
            // cannot continue initialization with the Architect session that
            // exists underneath Guest Preview.
            await new Promise(() => {});
            return null;
        }

        if (!access?.actualUser) {
            clearBrokenSession();
            redirectTo("/login.html");
            return null;
        }

        // The access resolver already validated the saved browser session.
        // In Architect Guest Preview it masks the real architect identity;
        // protected pages are stopped above before any privileged code runs.
        user = access.actualUser;
    } catch (error) {
        console.warn("Auth connection failed:", error);
        // Never destroy a valid saved session because the network/backend had
        // a temporary failure. Give the user a retry screen instead.
        showConnectionError();
        return null;
    }

    try {
        const normalizedEmail = normalizeEmail(user.email);

        // Beta membership and profile status are independent. Load them in
        // parallel so a slow mobile request cannot make editor startup wait
        // through two long retry chains back-to-back.
        const [betaResult, profileResult] = await Promise.all([
            withRetry(
                () => supabase
                    .from("beta_access")
                    .select("role")
                    .ilike("email", normalizedEmail)
                    .maybeSingle(),
                { attempts: 2, timeoutMs: 5000, delayMs: 300 }
            ),
            withRetry(
                () => supabase
                    .from("profiles")
                    .select("id, role, account_status, moderation_expires_at, moderation_reason, profile_completed, age_verified, age_role, birth_date")
                    .eq("id", user.id)
                    .maybeSingle(),
                { attempts: 2, timeoutMs: 5000, delayMs: 300 }
            )
        ]);

        const betaData = betaResult?.data || null;
        const betaError = betaResult?.error || null;
        const profile = profileResult?.data || null;
        const profileError = profileResult?.error || null;

        // A backend error is not the same thing as revoked beta access.
        if (betaError) {
            console.warn("Beta access lookup failed:", betaError);
            showConnectionError();
            return null;
        }

        if (profileError) {
            console.warn("Profile gate lookup failed:", profileError);
            showConnectionError();
            return null;
        }

        if (!betaData) {
            await supabase.auth.signOut();
            clearBrokenSession();
            showBetaAccessError(normalizedEmail);
            return null;
        }

        if (!profile) {
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
