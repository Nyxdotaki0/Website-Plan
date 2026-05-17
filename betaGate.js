import { supabase } from "./supabaseClient.js";

export async function requireBetaAccess() {
    console.log("Checking beta access...");

    const {
        data: { user },
        error: userError
    } = await supabase.auth.getUser();

    console.log("Current user:", user);

    if (userError || !user) {
        console.log("No user found. Redirecting to login.");
        window.location.replace("/login.html");
        return;
    }

    const { data, error } = await supabase
        .from("beta_access")
        .select("role")
        .eq("email", user.email)
        .maybeSingle();

    console.log("Beta access result:", data, error);

    if (error || !data) {
        console.log("User is not approved. Redirecting to closed beta page.");
        await supabase.auth.signOut();
        window.location.replace("/closed-beta.html");
        return;
    }

    localStorage.setItem("nullverse_user_role", data.role);
    console.log("Access approved:", data.role);
}