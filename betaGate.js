import { supabase } from "./supabaseClient.js";

export async function requireBetaAccess() {
    const {
        data: { user },
        error: userError
    } = await supabase.auth.getUser();

    if (userError || !user) {
        window.location.href = "/login.html";
        return;
    }

    const { data, error } = await supabase
        .from("beta_access")
        .select("role")
        .eq("email", user.email)
        .maybeSingle();

    if (error || !data) {
        await supabase.auth.signOut();
        window.location.href = "/closed-beta.html";
        return;
    }

    localStorage.setItem("nullverse_user_role", data.role);
}