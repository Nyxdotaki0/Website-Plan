import { supabase } from "./supabaseClient.js";

const LOCAL_KEY = "nullverse-recent-content";

export async function setupAutomaticProgressTracking(forcedType = "") {
    if (document.documentElement.dataset.nvProgressReady === "true") return;
    document.documentElement.dataset.nvProgressReady = "true";

    const params = new URLSearchParams(window.location.search);
    const contentId = params.get("id");
    if (!contentId) return;

    const { data: world, error } = await supabase
        .from("worlds")
        .select("id, title, cover_image_url, theme_overview_card_image_url, content_type")
        .eq("id", contentId)
        .maybeSingle();

    if (error || !world) return;

    const contentType = normalizeType(forcedType || world.content_type);
    const { data: { user } } = await supabase.auth.getUser();
    let saveTimer = null;
    let lastSavedBucket = -1;

    const save = async force => {
        const progress = readProgress(contentType);
        const bucket = Math.floor(progress.percent / 5);
        if (!force && bucket === lastSavedBucket) return;
        lastSavedBucket = bucket;

        const record = {
            user_id: user?.id || null,
            content_type: contentType,
            content_id: contentId,
            chapter_id: null,
            page_id: null,
            title: world.title || "Untitled Creation",
            image_url: world.cover_image_url || world.theme_overview_card_image_url || "",
            progress_percent: progress.percent,
            progress_label: progress.label,
            last_opened_at: new Date().toISOString(),
            metadata: {
                url: `${window.location.pathname}${window.location.search}`,
                chapter: progress.chapter || null
            }
        };

        writeLocalRecent(record);

        if (!user) return;
        const { error: saveError } = await supabase
            .from("nv_user_recent_content")
            .upsert(record, { onConflict: "user_id,content_type,content_id" });

        if (saveError && !String(saveError.message || "").includes("nv_user_recent_content")) {
            console.warn("Recent progress sync failed:", saveError.message);
        }
    };

    const queueSave = () => {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => save(false), 900);
    };

    window.addEventListener("scroll", queueSave, { passive: true });
    document.addEventListener("click", event => {
        if (event.target.closest(".chapter-nav-link, .chapter-switch-button, .page-thumb, .reader-arrow, [data-chapter-index]")) {
            setTimeout(() => save(true), 350);
        }
    });
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") save(true);
    });
    window.addEventListener("pagehide", () => save(true));

    await save(true);
}

function readProgress(contentType) {
    const scroller = document.scrollingElement || document.documentElement;
    const maximum = Math.max(1, scroller.scrollHeight - window.innerHeight);
    const percent = Math.max(0, Math.min(100, (scroller.scrollTop / maximum) * 100));
    const params = new URLSearchParams(window.location.search);
    const chapterParam = params.get("chapter");
    const chapterStatus = document.getElementById("current-chapter-status")?.textContent?.trim()
        || document.getElementById("reader-subtitle")?.textContent?.trim()
        || "";
    const chapter = chapterParam || chapterStatus || null;

    let label = `${Math.round(percent)}% viewed`;
    if (contentType === "literature") label = chapter ? `${chapter}   ${Math.round(percent)}%` : `${Math.round(percent)}% read`;
    if (["comic", "manga"].includes(contentType)) label = chapter ? `${chapter}` : "Continue reading";
    if (contentType === "world") label = `${Math.round(percent)}% explored`;

    return { percent: Number(percent.toFixed(2)), label, chapter };
}

function writeLocalRecent(record) {
    try {
        const current = JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]");
        const list = Array.isArray(current) ? current : [];
        const normalized = {
            ...record,
            user_id: undefined,
            id: record.content_id,
            updated_at: record.last_opened_at
        };
        const next = [
            normalized,
            ...list.filter(item => !(item.content_id === record.content_id && item.content_type === record.content_type))
        ].slice(0, 30);
        localStorage.setItem(LOCAL_KEY, JSON.stringify(next));
    } catch (error) {
        console.warn("Could not store local reading progress:", error);
    }
}

function normalizeType(value) {
    const clean = String(value || "world").toLowerCase();
    if (["literature", "comic", "manga", "gallery"].includes(clean)) return clean;
    return "world";
}
// JavaScript source code
