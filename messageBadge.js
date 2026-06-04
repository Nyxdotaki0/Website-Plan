import { supabase } from "./supabaseClient.js";

export async function setupMessageBadge() {
    const navMessagesLink =
        document.querySelector('a[href="messages.html"]');

    if (!navMessagesLink) return;

    navMessagesLink.classList.add("notification-link");

    let badge =
        navMessagesLink.querySelector(".notification-badge");

    if (!badge) {
        badge = document.createElement("span");
        badge.className = "notification-badge";
        navMessagesLink.appendChild(badge);
    }

    const { data: { user }, error: userError } =
        await supabase.auth.getUser();

    if (userError || !user) {
        badge.style.display = "none";
        return;
    }

    async function updateBadge() {
        const { data: memberships, error: memberError } =
            await supabase
                .from("conversation_members")
                .select("conversation_id, last_read_at")
                .eq("user_id", user.id);

        if (memberError) {
            console.error("Message badge member error:", memberError.message);
            badge.style.display = "none";
            return;
        }

        if (!memberships || !memberships.length) {
            badge.style.display = "none";
            badge.textContent = "";
            return;
        }

        let unreadTotal = 0;

        for (const membership of memberships) {
            let query = supabase
                .from("messages")
                .select("id", {
                    count: "exact",
                    head: true
                })
                .eq("conversation_id", membership.conversation_id)
                .neq("sender_id", user.id)
                .is("deleted_at", null)
                .eq("moderation_status", "visible");

            if (membership.last_read_at) {
                query = query.gt("created_at", membership.last_read_at);
            }

            const { count, error } = await query;

            if (error) {
                console.error("Message badge count error:", error.message);
                continue;
            }

            unreadTotal += count || 0;
        }

        if (!unreadTotal || unreadTotal <= 0) {
            badge.style.display = "none";
            badge.textContent = "";
            return;
        }

        badge.style.display = "inline-flex";
        badge.textContent = unreadTotal > 99 ? "99+" : String(unreadTotal);
    }

    await updateBadge();

    const messageChannel = supabase
        .channel(`message-badge-messages-${user.id}`)
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "messages"
            },
            async () => {
                await updateBadge();
            }
        )
        .subscribe();

    const memberChannel = supabase
        .channel(`message-badge-members-${user.id}`)
        .on(
            "postgres_changes",
            {
                event: "*",
                schema: "public",
                table: "conversation_members",
                filter: `user_id=eq.${user.id}`
            },
            async () => {
                await updateBadge();
            }
        )
        .subscribe();

    window.addEventListener("beforeunload", () => {
        supabase.removeChannel(messageChannel);
        supabase.removeChannel(memberChannel);
    });
}// JavaScript source code
