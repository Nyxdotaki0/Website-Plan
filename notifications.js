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

    if (!recipientId || !actorId) {
        console.warn("Notification skipped: missing IDs");
        return;
    }

    if (recipientId === actorId) {
        console.warn("Notification skipped: self notification");
        return;
    }

    const payload = {
        recipient_id: recipientId,
        actor_id: actorId,
        type,
        message,
        link
    };

    if (worldId !== null) {
        payload.world_id = worldId;
    }

    if (additionId !== null) {
        payload.addition_id = additionId;
    }

    console.log("Creating notification:", payload);

    const result = await supabase
        .from("notifications")
        .insert(payload)
        .select()
        .single();

    if (result.error) {
        console.error(
            "Notification insert failed:",
            result.error
        );
    } else {
        console.log(
            "Notification created:",
            result.data
        );
    }

    return result;
}