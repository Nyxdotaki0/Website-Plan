import { supabase } from "./supabaseClient.js";

export async function createNotification({
    recipientId,
    actorId,
    worldId = null,
    additionId = null,
    type,
    message,
    link = null
}) {
    if (!recipientId || !actorId) return;
    if (recipientId === actorId) return;

    await supabase
        .from("notifications")
        .insert({
            recipient_id: recipientId,
            actor_id: actorId,
            world_id: worldId,
            addition_id: additionId,
            type,
            message,
            link
        });
}// JavaScript source code
