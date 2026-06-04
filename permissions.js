import { supabase } from "./supabaseClient.js";

export async function getCurrentProfile(userId) {
    const { data, error } = await supabase
        .from("profiles")
        .select("id, username, display_name, role, role_name, account_status")
        .eq("id", userId)
        .single();

    if (error) {
        console.error(error);
        return null;
    }

    return data;
}

export async function getPermissions(roleName) {
    if (roleName === "void_architect") {
        return ["*"];
    }

    const { data, error } = await supabase
        .from("role_permissions")
        .select("permission")
        .eq("role_name", roleName || "creator");

    if (error) {
        console.error(error);
        return [];
    }

    return data.map(row => row.permission);
}

export function can(userPermissions, permission) {
    return userPermissions.includes("*") || userPermissions.includes(permission);
}

export function canModerateTarget(actorProfile, targetProfile) {
    if (!actorProfile || !targetProfile) return false;

    if (actorProfile.id === targetProfile.id) return false;

    if (actorProfile.role_name === "void_architect") {
        return targetProfile.role_name !== "void_architect";
    }

    if (actorProfile.role_name === "moderator") {
        return !["moderator", "void_architect"].includes(targetProfile.role_name);
    }

    return false;
}// JavaScript source code
