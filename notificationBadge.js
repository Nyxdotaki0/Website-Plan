import { supabase } from "./supabaseClient.js";

export async function setupNotificationBadge(options = {}) {
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

    let user = options.user || null;
    if (!user) {
        const { data, error: userError } = await supabase.auth.getUser();
        user = data?.user || null;
        if (userError || !user) {
            badge.style.display = "none";
            return;
        }
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

    if (options.realtime === false) return;

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

    let channelRemoved = false;
    const removeBadgeChannel = () => {
        if (channelRemoved) return;
        channelRemoved = true;
        supabase.removeChannel(channel);
    };
    window.addEventListener("pagehide", removeBadgeChannel, { once: true });
    window.addEventListener("beforeunload", removeBadgeChannel, { once: true });
}// JavaScript source code
