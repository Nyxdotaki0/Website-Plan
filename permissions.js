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

export async function getCurrentUserWithPermissions(userId) {
    const profile = await getCurrentProfile(userId);

    if (!profile) {
        return {
            profile: null,
            permissions: []
        };
    }

    const roleName = getRoleName(profile);
    const permissions = await getPermissions(roleName);

    return {
        profile,
        permissions
    };
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

export function getRoleName(profile) {
    return profile?.role_name || profile?.role || "creator";
}

export function can(userPermissions, permission) {
    return userPermissions.includes("*") || userPermissions.includes(permission);
}

export function canManageRoles(userPermissions) {
    return can(userPermissions, "manage_roles");
}

export function canModerateUsers(userPermissions) {
    return can(userPermissions, "moderate_users");
}

export function canModerateWorlds(userPermissions) {
    return can(userPermissions, "moderate_worlds");
}

export function canModerateAdditions(userPermissions) {
    return can(userPermissions, "moderate_additions");
}

export function canViewReports(userPermissions) {
    return can(userPermissions, "view_reports");
}

export function canViewLogs(userPermissions) {
    return can(userPermissions, "view_logs");
}

export function canDeleteContent(userPermissions) {
    return can(userPermissions, "delete_content");
}

export function canReplaceImages(userPermissions) {
    return can(userPermissions, "replace_images");
}

export function canModerateTarget(actorProfile, targetProfile) {
    if (!actorProfile || !targetProfile) return false;
    if (actorProfile.id === targetProfile.id) return false;

    const actorRole = getRoleName(actorProfile);
    const targetRole = getRoleName(targetProfile);

    if (actorRole === "void_architect") {
        return targetRole !== "void_architect";
    }

    if (actorRole === "moderator") {
        return targetRole === "creator";
    }

    return false;
}