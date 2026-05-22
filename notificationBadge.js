import { supabase } from "./supabaseClient.js";

export async function setupNotificationBadge() {
    const navNotificationLink =
        document.querySelector('a[href="notifications.html"]');

    if (!navNotificationLink) return;

    navNotificationLink.classList.add("notification-link");

    let badge =
        navNotificationLink.querySelector(".notification-badge");

    if (!badge) {
        badge = document.createElement("span");
        badge.className = "notification-badge";
        navNotificationLink.appendChild(badge);
    }

    const { data: { user }, error: userError } =
        await supabase.auth.getUser();

    if (userError || !user) {
        badge.style.display = "none";
        return;
    }

    async function updateBadge() {
        const { count, error } = await supabase
            .from("notifications")
            .select("id", {
                count: "exact",
                head: true
            })
            .eq("recipient_id", user.id)
            .eq("is_read", false);

        if (error) {
            console.error("Notification badge error:", error.message);
            badge.style.display = "none";
            return;
        }

        if (!count || count <= 0) {
            badge.style.display = "none";
            badge.textContent = "";
            return;
        }

        badge.style.display = "inline-flex";
        badge.textContent = count > 99 ? "99+" : String(count);
    }

    await updateBadge();

    const channel = supabase
        .channel(`notification-badge-${user.id}`)
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "notifications",
                filter: `recipient_id=eq.${user.id}`
            },
            async () => {
                await updateBadge();
            }
        )
        .subscribe();

    window.addEventListener("beforeunload", () => {
        supabase.removeChannel(channel);
    });
}// JavaScript source code
