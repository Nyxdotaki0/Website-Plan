const DRAFT_TABLE = "editor_drafts";
const AUTOSAVE_DELAY_MS = 1800;
const AUTOSAVE_HEARTBEAT_MS = 30000;

const CREDIT_PARTS = [
    "credit_type",
    "credit_name",
    "credit_url",
    "credit_note",
    "credit_no_ai",
    "credit_nullverse_username"
];

function creditFields(prefixes) {
    return prefixes.flatMap(prefix => CREDIT_PARTS.map(part => `${prefix}_${part}`));
}

const COMMON_PROJECT_FIELDS = [
    "title",
    "summary",
    "genres",
    "themes",
    "visibility",
    "featured",
    "content_type",
    "content_rating",
    "content_warnings",
    "cover_image_url",
    "cover_image_placement",
    "theme_name",
    "theme_background_style",
    "theme_background_color_1",
    "theme_background_color_2",
    "theme_background_image_url",
    "theme_background_image_placement",
    "theme_background_image_opacity",
    "theme_background_image_blur",
    "theme_background_image_position",
    "theme_background_position_x",
    "theme_background_position_y",
    "theme_background_zoom",
    "theme_background_image_size",
    "theme_background_image_repeat",
    "theme_background_overlay_strength",
    "theme_index_style",
    "theme_index_color_1",
    "theme_index_color_2",
    "theme_index_text_color",
    "theme_index_image_url",
    "theme_index_image_placement",
    "theme_index_opacity",
    "theme_index_overlay",
    "theme_index_button_style",
    "theme_index_button_color_1",
    "theme_index_button_color_2",
    "theme_index_button_text_color"
];

const PROJECT_FIELDS = {
    world: [
        ...COMMON_PROJECT_FIELDS,
        "addition_mode",
        "theme_gradient_enabled",
        "theme_gradient_color_1",
        "theme_gradient_color_2",
        "theme_gradient_direction",
        "theme_gradient_strength",
        "theme_overview_card_style",
        "theme_overview_card_color_1",
        "theme_overview_card_color_2",
        "theme_overview_card_text_color",
        "theme_overview_card_image_url",
        "theme_overview_card_image_placement",
        "theme_overview_card_opacity",
        "theme_overview_card_overlay",
        "theme_button_style",
        "theme_button_color_1",
        "theme_button_color_2",
        "theme_button_text_color",
        ...creditFields(["cover", "overview_card", "index", "background"])
    ],
    literature: [
        ...COMMON_PROJECT_FIELDS,
        ...creditFields(["cover", "index", "background"])
    ],
    comic: [
        ...COMMON_PROJECT_FIELDS,
        "comic_reading_mode",
        "comic_page_direction",
        ...creditFields(["cover", "index", "background"])
    ]
};

const CHILD_SPECS = {
    world: [
        {
            payloadKey: "sections",
            table: "world_sections",
            foreignKey: "world_id",
            fields: [
                "display_order",
                "section_type",
                "title",
                "content",
                "image_url",
                "image_placement",
                "image_position",
                "theme_card_style",
                "theme_card_color_1",
                "theme_card_color_2",
                "theme_card_text_color",
                "theme_card_image_url",
                "theme_card_image_placement",
                "theme_card_opacity",
                "theme_card_overlay",
                ...creditFields(["image", "card"])
            ]
        }
    ],
    literature: [
        {
            payloadKey: "chapters",
            table: "literature_chapters",
            foreignKey: "literature_id",
            fields: [
                "display_order",
                "title",
                "subtitle",
                "visibility",
                "body",
                "author_note",
                "image_url",
                "image_placement",
                "image_position",
                "spacing_type",
                "text_color",
                "chapter_panel_color",
                "theme_card_style",
                "theme_card_color_1",
                "theme_card_color_2",
                "theme_card_text_color",
                "theme_card_image_url",
                "theme_card_image_placement",
                "theme_card_opacity",
                "theme_card_overlay",
                ...creditFields(["image", "card"])
            ]
        }
    ],
    comic: [
        {
            payloadKey: "chapters",
            table: "comic_chapters",
            foreignKey: "world_id",
            fields: [
                "display_order",
                "title",
                "subtitle",
                "visibility",
                "author_note"
            ]
        },
        {
            payloadKey: "pagesByChapter",
            table: "comic_pages",
            foreignKey: "world_id",
            flattenObjectArrays: true,
            fields: [
                "display_order",
                "image_placement",
                "image_credit_type",
                "image_credit_nullverse_username",
                "image_credit_name",
                "image_credit_url",
                "image_credit_note",
                "image_credit_no_ai"
            ]
        }
    ]
};

function safeDate(value) {
    const time = Date.parse(value || "");
    return Number.isFinite(time) ? time : 0;
}

function isMissingDraftTableError(error) {
    const code = String(error?.code || "");
    const message = String(error?.message || "").toLowerCase();

    return code === "42P01"
        || code === "PGRST205"
        || message.includes("editor_drafts")
        || message.includes("schema cache")
        || message.includes("does not exist");
}

function hasSerializableValue(value) {
    if (
        typeof value === "undefined"
        || typeof value === "function"
        || typeof value === "symbol"
    ) {
        return false;
    }

    if (typeof File !== "undefined" && value instanceof File) return false;
    if (typeof Blob !== "undefined" && value instanceof Blob) return false;

    return true;
}

function isPendingImageValue(value) {
    return value === "__NV_IMAGE_NEEDS_SAVE__"
        || (
            value
            && typeof value === "object"
            && (
                (typeof File !== "undefined" && value instanceof File)
                || (typeof Blob !== "undefined" && value instanceof Blob)
            )
        );
}

function pickWritableFields(record, fields) {
    const update = {};

    for (const field of fields) {
        if (!Object.prototype.hasOwnProperty.call(record || {}, field)) continue;

        const value = record[field];

        if (!hasSerializableValue(value)) continue;
        if (field.endsWith("_url") && isPendingImageValue(value)) continue;

        update[field] = value;
    }

    update.updated_at = new Date().toISOString();

    return update;
}

function flattenPayloadCollection(payload, spec) {
    const value = payload?.[spec.payloadKey];

    if (spec.flattenObjectArrays) {
        return Object.values(value || {}).flatMap(rows =>
            Array.isArray(rows) ? rows : []
        );
    }

    return Array.isArray(value) ? value : [];
}

function createStatusNode(editorType) {
    const existing = document.getElementById("nv-editor-autosave-status");

    if (existing) return existing;

    const group = document.querySelector(".nv-save-button-group");

    if (!group) return null;

    const node = document.createElement("span");

    node.id = "nv-editor-autosave-status";
    node.dataset.editorType = editorType;
    node.textContent = "Autosave ready";

    Object.assign(node.style, {
        display: "inline-flex",
        alignItems: "center",
        minHeight: "34px",
        padding: "7px 11px",
        border: "1px solid rgba(255,255,255,.12)",
        borderRadius: "999px",
        background: "rgba(255,255,255,.045)",
        color: "var(--text-muted)",
        fontSize: ".78rem",
        fontWeight: "700",
        whiteSpace: "nowrap"
    });

    group.appendChild(node);

    return node;
}

export function createEditorDraftManager(options) {
    const {
        supabase,
        editorType,
        projectId,
        ownerId,
        buildPayload,
        applyPayload,
        localStorageKey,
        prepareActivePublish,
        hasPendingFiles = () => false,
        markClean = () => { },
        showToast = () => { },
        setMessage = () => { },
        looksLikeSaveFailure = () => false,
        getVisibilitySelector = () => null
    } = options || {};

    if (!supabase || !editorType || !projectId || !ownerId) {
        throw new Error(
            "Editor draft manager is missing its project configuration."
        );
    }

    if (
        typeof buildPayload !== "function"
        || typeof applyPayload !== "function"
    ) {
        throw new Error(
            "Editor draft manager requires buildPayload and applyPayload callbacks."
        );
    }

    let autosaveTimer = null;
    let heartbeatTimer = null;
    let queue = Promise.resolve();

    let dirty = false;
    let publishing = false;
    let installed = false;
    let cloudAvailable = true;

    let lastPayload = null;
    let lastSavedAt = 0;
    let statusNode = null;

    function status(text, mode = "idle") {
        statusNode = statusNode || createStatusNode(editorType);

        if (!statusNode) return;

        statusNode.textContent = text;

        statusNode.style.color =
            mode === "error"
                ? "#ffb3b3"
                : mode === "warning"
                    ? "#ffe0a3"
                    : mode === "saving"
                        ? "#dbe9ff"
                        : mode === "saved"
                            ? "#cffff0"
                            : "var(--text-muted)";

        statusNode.style.borderColor =
            mode === "error"
                ? "rgba(255,120,120,.34)"
                : mode === "warning"
                    ? "rgba(255,214,102,.34)"
                    : mode === "saved"
                        ? "rgba(120,255,190,.28)"
                        : "rgba(255,255,255,.12)";
    }

    function enqueue(task) {
        queue = queue
            .catch(() => undefined)
            .then(task);

        return queue;
    }

    /*
     * ============================================================
     * LOCAL DRAFT STORAGE
     * ============================================================
     *
     * IMPORTANT:
     *
     * The old system stored the entire serialized editor snapshot in
     * localStorage. A large Literature project can easily exceed the
     * browser's localStorage quota because the snapshot contains every
     * chapter and all of the rich-text HTML.
     *
     * IndexedDB is used instead.
     *
     * Each project gets ONE stable key:
     *
     *     ownerId:editorType:projectId
     *
     * objectStore.put() replaces the previous value for that key.
     *
     * Autosave therefore NEVER intentionally creates a pile of local
     * draft copies.
     */

    function getLocalKey() {
        return typeof localStorageKey === "function"
            ? localStorageKey()
            : String(
                localStorageKey
                || `nullverse-editor-draft:${editorType}:${projectId}:${ownerId}`
            );
    }

    function getLocalRecordId() {
        return `${ownerId}:${editorType}:${projectId}`;
    }

    function openLocalDraftDb() {
        return new Promise((resolve, reject) => {
            if (!("indexedDB" in window)) {
                reject(
                    new Error(
                        "IndexedDB is unavailable in this browser."
                    )
                );

                return;
            }

            const request = indexedDB.open(
                "nullverse-editor-drafts",
                1
            );

            request.onupgradeneeded = () => {
                const db = request.result;

                if (!db.objectStoreNames.contains("drafts")) {
                    db.createObjectStore(
                        "drafts",
                        {
                            keyPath: "id"
                        }
                    );
                }
            };

            request.onsuccess = () => {
                resolve(request.result);
            };

            request.onerror = () => {
                reject(
                    request.error
                    || new Error(
                        "Could not open the local draft database."
                    )
                );
            };

            request.onblocked = () => {
                reject(
                    new Error(
                        "The local draft database is blocked by another tab."
                    )
                );
            };
        });
    }

    async function readIndexedDraft() {
        const db = await openLocalDraftDb();

        try {
            return await new Promise((resolve, reject) => {
                const tx = db.transaction(
                    "drafts",
                    "readonly"
                );

                const request = tx
                    .objectStore("drafts")
                    .get(getLocalRecordId());

                request.onsuccess = () => {
                    resolve(
                        request.result?.payload
                        || null
                    );
                };

                request.onerror = () => {
                    reject(
                        request.error
                        || new Error(
                            "Could not read the local draft."
                        )
                    );
                };
            });
        } finally {
            db.close();
        }
    }

    async function writeIndexedDraft(payload) {
        const db = await openLocalDraftDb();

        try {
            await new Promise((resolve, reject) => {
                const tx = db.transaction(
                    "drafts",
                    "readwrite"
                );

                tx.oncomplete = () => {
                    resolve();
                };

                tx.onerror = () => {
                    reject(
                        tx.error
                        || new Error(
                            "Could not write the local draft."
                        )
                    );
                };

                tx.onabort = () => {
                    reject(
                        tx.error
                        || new Error(
                            "The local draft write was aborted."
                        )
                    );
                };

                /*
                 * put() is intentional.
                 *
                 * If this project already has a draft, the record with
                 * this exact ID is overwritten rather than duplicated.
                 */
                tx.objectStore("drafts").put({
                    id: getLocalRecordId(),
                    ownerId,
                    projectId,
                    editorType,
                    savedAt:
                        payload?.savedAt
                        || new Date().toISOString(),
                    payload
                });
            });
        } finally {
            db.close();
        }
    }

    async function deleteIndexedDraft() {
        const db = await openLocalDraftDb();

        try {
            await new Promise((resolve, reject) => {
                const tx = db.transaction(
                    "drafts",
                    "readwrite"
                );

                tx.oncomplete = () => {
                    resolve();
                };

                tx.onerror = () => {
                    reject(
                        tx.error
                        || new Error(
                            "Could not remove the local draft."
                        )
                    );
                };

                tx.onabort = () => {
                    reject(
                        tx.error
                        || new Error(
                            "The local draft delete was aborted."
                        )
                    );
                };

                tx
                    .objectStore("drafts")
                    .delete(getLocalRecordId());
            });
        } finally {
            db.close();
        }
    }

    /*
     * The user's old draft may still exist in localStorage from a
     * previous version of the editor.
     *
     * We read it once, migrate it into IndexedDB, and then delete the
     * localStorage version.
     */

    function readLegacyLocalStorageDraft() {
        try {
            const raw = localStorage.getItem(
                getLocalKey()
            );

            return raw
                ? JSON.parse(raw)
                : null;
        } catch (error) {
            console.warn(
                "Could not read the legacy local editor draft.",
                error
            );

            return null;
        }
    }

    function clearLegacyLocalStorageDraft() {
        try {
            localStorage.removeItem(
                getLocalKey()
            );
        } catch {
            // Ignore cleanup errors.
        }
    }

    async function readLocal() {
        /*
         * IndexedDB is the primary local recovery source.
         */
        try {
            const indexed = await readIndexedDraft();

            if (indexed) {
                return indexed;
            }
        } catch (error) {
            console.warn(
                "Could not read the IndexedDB editor draft.",
                error
            );
        }

        /*
         * No IndexedDB record?
         *
         * Check once for an old localStorage snapshot.
         */
        const legacy =
            readLegacyLocalStorageDraft();

        if (!legacy) {
            return null;
        }

        /*
         * Migrate old snapshot.
         *
         * IndexedDB put() uses one stable record key, so every later
         * save replaces this snapshot.
         */
        try {
            await writeIndexedDraft(
                legacy
            );

            clearLegacyLocalStorageDraft();
        } catch (error) {
            console.warn(
                "Could not migrate the legacy editor draft to IndexedDB.",
                error
            );
        }

        return legacy;
    }

    async function writeLocal(payload) {
        /*
         * Primary local storage.
         *
         * This is a single IndexedDB record per project.
         */
        try {
            await writeIndexedDraft(
                payload
            );

            /*
             * If an old localStorage copy exists, remove it so it
             * cannot continue consuming the browser quota.
             */
            clearLegacyLocalStorageDraft();

            return true;
        } catch (error) {
            console.warn(
                "Could not write the IndexedDB editor draft.",
                error
            );
        }

        /*
         * Emergency fallback only.
         *
         * Do NOT attempt to dump a novel-sized snapshot into
         * localStorage.
         *
         * localStorage generally has a relatively small synchronous
         * quota and this was the source of:
         *
         *     QuotaExceededError
         *
         * A relatively small project can still receive the fallback
         * recovery copy if IndexedDB is unavailable.
         */
        try {
            const serialized =
                JSON.stringify(payload);

            /*
             * Roughly 180 KB maximum for the emergency fallback.
             *
             * Large projects rely on:
             *
             *     1. IndexedDB
             *     2. Supabase editor_drafts
             *
             * rather than filling localStorage.
             */
            if (serialized.length > 180000) {
                return false;
            }

            localStorage.setItem(
                getLocalKey(),
                serialized
            );

            return true;
        } catch (error) {
            console.warn(
                "Could not write the fallback local editor draft.",
                error
            );

            return false;
        }
    }

    async function clearLocal() {
        try {
            await deleteIndexedDraft();
        } catch (error) {
            console.warn(
                "Could not remove the IndexedDB editor draft.",
                error
            );
        }

        clearLegacyLocalStorageDraft();
    }

    /*
     * ============================================================
     * DRAFT PAYLOAD
     * ============================================================
     */

    async function buildFreshPayload(
        reason = "manual"
    ) {
        const built = await buildPayload();
        const savedAt =
            new Date().toISOString();

        return {
            ...(built || {}),
            type: editorType,
            editorType,
            projectId,
            ownerId,
            savedAt,
            saveReason: reason,
            draftVersion: 3
        };
    }

    /*
     * ============================================================
     * CLOUD DRAFT STORAGE
     * ============================================================
     *
     * The database must have a UNIQUE constraint on:
     *
     *     owner_id,
     *     project_id,
     *     editor_type
     *
     * upsert() then updates the same draft row instead of creating
     * a new row for every autosave.
     */

    async function writeCloud(payload) {
        const { error } = await supabase
            .from(DRAFT_TABLE)
            .upsert(
                {
                    owner_id: ownerId,
                    project_id: projectId,
                    editor_type: editorType,

                    payload,

                    status: "draft",

                    saved_at:
                        payload.savedAt,

                    published_at: null,

                    updated_at:
                        new Date().toISOString()
                },
                {
                    onConflict:
                        "owner_id,project_id,editor_type"
                }
            );

        if (error) {
            if (
                isMissingDraftTableError(error)
            ) {
                cloudAvailable = false;

                return {
                    ok: false,
                    missingTable: true,
                    error
                };
            }

            return {
                ok: false,
                missingTable: false,
                error
            };
        }

        cloudAvailable = true;

        return {
            ok: true,
            missingTable: false,
            error: null
        };
    }

    async function readCloud() {
        const { data, error } =
            await supabase
                .from(DRAFT_TABLE)
                .select(
                    "payload,saved_at,updated_at,status"
                )
                .eq(
                    "owner_id",
                    ownerId
                )
                .eq(
                    "project_id",
                    projectId
                )
                .eq(
                    "editor_type",
                    editorType
                )
                .eq(
                    "status",
                    "draft"
                )
                .maybeSingle();

        if (error) {
            if (
                isMissingDraftTableError(error)
            ) {
                cloudAvailable = false;

                return null;
            }

            console.warn(
                "Could not load the cloud editor draft.",
                error
            );

            return null;
        }

        cloudAvailable = true;

        if (!data?.payload) {
            return null;
        }

        return {
            ...data.payload,

            savedAt:
                data.payload.savedAt
                || data.saved_at
                || data.updated_at
        };
    }

    async function markCloudPublished() {
        const now =
            new Date().toISOString();

        /*
         * Mark first, then delete.
         *
         * This makes the publish lifecycle explicit while ensuring
         * the private draft disappears after a successful publish.
         */
        const { error } =
            await supabase
                .from(DRAFT_TABLE)
                .update({
                    status: "published",
                    published_at: now,
                    updated_at: now
                })
                .eq(
                    "owner_id",
                    ownerId
                )
                .eq(
                    "project_id",
                    projectId
                )
                .eq(
                    "editor_type",
                    editorType
                );

        if (
            error
            && !isMissingDraftTableError(error)
        ) {
            console.warn(
                "Could not mark the cloud draft as published.",
                error
            );
        }

        const { error: deleteError } =
            await supabase
                .from(DRAFT_TABLE)
                .delete()
                .eq(
                    "owner_id",
                    ownerId
                )
                .eq(
                    "project_id",
                    projectId
                )
                .eq(
                    "editor_type",
                    editorType
                )
                .eq(
                    "status",
                    "published"
                );

        if (
            deleteError
            && !isMissingDraftTableError(
                deleteError
            )
        ) {
            console.warn(
                "Could not remove the published cloud draft marker.",
                deleteError
            );
        }
    }

    /*
     * ============================================================
     * SAVE DRAFT
     * ============================================================
     */

    async function persistDraft({
        manual = false,
        reason = "autosave",
        preserveDirty = false
    } = {}) {
        status(
            manual
                ? "Saving draft"
                : "Autosaving",
            "saving"
        );

        let payload;

        try {
            payload =
                await buildFreshPayload(
                    reason
                );
        } catch (error) {
            status(
                "Autosave failed",
                "error"
            );

            if (manual) {
                showToast(
                    "Draft save failed",
                    error?.message
                    || "The editor could not collect the current draft.",
                    "error"
                );
            }

            return {
                ok: false,
                error
            };
        }

        /*
         * These are intentionally independent.
         *
         * A local browser failure must NOT cause a successful cloud
         * save to be reported as a failed draft.
         *
         * Likewise, temporary network trouble can still leave the
         * IndexedDB recovery copy intact.
         */
        const localSaved =
            await writeLocal(payload);

        const cloudResult =
            await writeCloud(payload);

        lastPayload = payload;
        lastSavedAt =
            safeDate(payload.savedAt);

        /*
         * Keep the live editor's in-memory objects synchronized with
         * the normalized payload returned by buildPayload().
         */
        try {
            applyPayload(payload);
        } catch (error) {
            console.warn(
                "The saved draft could not be reapplied to the editor state.",
                error
            );
        }

        const pendingFiles =
            !!hasPendingFiles();

        const fullyProtected =
            cloudResult.ok
            && !pendingFiles;

        if (
            !preserveDirty
            && fullyProtected
        ) {
            dirty = false;

            markClean(
                manual
                    ? "Draft saved"
                    : "Autosaved"
            );
        } else if (
            !preserveDirty
            && localSaved
            && !pendingFiles
            && !cloudResult.ok
        ) {
            dirty = false;

            markClean(
                manual
                    ? "Draft saved locally"
                    : "Autosaved locally"
            );
        }

        /*
         * Pending File / Blob instances cannot safely be serialized as
         * part of this draft snapshot.
         *
         * Existing uploaded image URLs ARE saved.
         */
        if (pendingFiles) {
            dirty = true;

            status(
                "Text autosaved  image pending",
                "warning"
            );
        } else if (cloudResult.ok) {
            status(
                manual
                    ? "Draft saved"
                    : "Autosaved",
                "saved"
            );
        } else if (localSaved) {
            status(
                "Saved locally  cloud unavailable",
                "warning"
            );
        } else {
            status(
                "Draft save failed",
                "error"
            );
        }

        if (manual) {
            if (pendingFiles) {
                showToast(
                    cloudResult.ok
                        ? "Draft saved"
                        : "Draft saved locally",

                    "Text, layout, colors, credits, and existing image URLs are protected. A newly selected image file must remain open until Save & Publish uploads it.",

                    "warning"
                );
            } else if (
                cloudResult.ok
            ) {
                showToast(
                    "Draft saved",

                    "Your private draft was saved to your Nullverse account and this device. The public page was not changed.",

                    "success"
                );
            } else if (
                localSaved
            ) {
                showToast(
                    "Draft saved on this device",

                    cloudResult.missingTable
                        ? "Run the included editor_drafts SQL migration to enable account-wide cloud drafts."
                        : "The cloud copy could not be reached, but the local recovery copy was saved.",

                    "warning"
                );
            } else {
                showToast(
                    "Draft save failed",

                    cloudResult.error?.message
                    || "Neither the cloud draft nor local recovery copy could be saved.",

                    "error"
                );
            }
        }

        return {
            /*
             * A draft counts as successfully protected when EITHER:
             *
             * 1. IndexedDB/local fallback succeeded
             * 2. Supabase succeeded
             *
             * A local quota problem can therefore no longer turn a
             * successful Supabase save into a false failure.
             */
            ok:
                localSaved
                || cloudResult.ok,

            payload,

            cloudSaved:
                cloudResult.ok,

            pendingFiles
        };
    }

    /*
     * ============================================================
     * PUBLISH EXISTING CHILD RECORDS
     * ============================================================
     */

    async function updateRows(
        table,
        foreignKey,
        rows,
        fields
    ) {
        for (const record of rows) {
            /*
             * New unsaved child rows are handled by the editor's
             * prepareActivePublish callback.
             */
            if (!record?.id) {
                continue;
            }

            const update =
                pickWritableFields(
                    record,
                    fields
                );

            /*
             * updated_at is automatically added.
             *
             * If that is the only field, there is nothing meaningful
             * to write.
             */
            if (
                Object.keys(update).length <= 1
            ) {
                continue;
            }

            const { error } =
                await supabase
                    .from(table)
                    .update(update)
                    .eq(
                        "id",
                        record.id
                    )
                    .eq(
                        foreignKey,
                        projectId
                    )
                    .eq(
                        "owner_id",
                        ownerId
                    );

            if (error) {
                throw new Error(
                    `${table}: ${error.message}`
                );
            }
        }
    }

    async function publishSnapshot(payload) {
        const specs =
            CHILD_SPECS[editorType]
            || [];

        /*
         * Update every persisted child object in the draft.
         */
        for (const spec of specs) {
            const rows =
                flattenPayloadCollection(
                    payload,
                    spec
                );

            await updateRows(
                spec.table,
                spec.foreignKey,
                rows,
                spec.fields
            );
        }

        /*
         * Project-level data.
         *
         * Literature, World, and Comic records are all backed by the
         * worlds table in this editor architecture.
         */
        const project =
            payload?.project
            || payload?.world
            || payload?.literature
            || payload?.comic
            || {};

        const projectUpdate =
            pickWritableFields(
                {
                    ...project,
                    visibility: "published"
                },

                PROJECT_FIELDS[editorType]
                || COMMON_PROJECT_FIELDS
            );

        projectUpdate.visibility =
            "published";

        projectUpdate.updated_at =
            new Date().toISOString();

        const { error } =
            await supabase
                .from("worlds")
                .update(projectUpdate)
                .eq(
                    "id",
                    projectId
                )
                .eq(
                    "owner_id",
                    ownerId
                );

        if (error) {
            throw new Error(
                `worlds: ${error.message}`
            );
        }

        return true;
    }

    /*
     * ============================================================
     * RESTORE
     * ============================================================
     */

    async function restoreLatest() {
        status(
            "Checking for drafts",
            "saving"
        );

        /*
         * Read both copies.
         *
         * Whichever has the latest savedAt wins.
         */
        const local =
            await readLocal();

        const cloud =
            await readCloud();

        const candidates =
            [
                local,
                cloud
            ].filter(Boolean);

        if (!candidates.length) {
            status(
                cloudAvailable
                    ? "Autosave ready"
                    : "Local autosave ready",

                "idle"
            );

            return false;
        }

        const latest =
            candidates.sort(
                (a, b) =>
                    safeDate(b.savedAt)
                    - safeDate(a.savedAt)
            )[0];

        /*
         * Never restore another project/user's record even if some old
         * malformed local data somehow exists.
         */
        if (
            latest.ownerId
            && String(latest.ownerId)
            !== String(ownerId)
        ) {
            return false;
        }

        if (
            latest.projectId
            && String(latest.projectId)
            !== String(projectId)
        ) {
            return false;
        }

        if (
            latest.type
            && String(latest.type)
            !== String(editorType)
        ) {
            return false;
        }

        const applied =
            applyPayload(latest);

        if (!applied) {
            status(
                "Draft could not load",
                "error"
            );

            return false;
        }

        /*
         * Normalize/migrate the winning draft back into IndexedDB.
         *
         * This still overwrites the single stable record.
         */
        await writeLocal(latest);

        lastPayload =
            latest;

        lastSavedAt =
            safeDate(latest.savedAt);

        dirty = false;

        markClean(
            "Draft restored"
        );

        status(
            cloud && latest === cloud
                ? "Cloud draft restored"
                : "Draft restored",

            "saved"
        );

        showToast(
            cloud && latest === cloud
                ? "Cloud draft restored"
                : "Draft restored",

            "Your private work was loaded. The public page still shows the last published version.",

            "warning"
        );

        return true;
    }

    /*
     * ============================================================
     * PUBLISH
     * ============================================================
     */

    async function publish() {
        if (publishing) {
            return false;
        }

        clearTimeout(
            autosaveTimer
        );

        publishing = true;

        status(
            "Publishing",
            "saving"
        );

        return enqueue(
            async () => {
                try {
                    /*
                     * Make a safety snapshot BEFORE modifying the live
                     * database.
                     */
                    const prePublishDraft =
                        await persistDraft({
                            manual: false,
                            reason: "before-publish",
                            preserveDirty: true
                        });

                    if (
                        !prePublishDraft.ok
                    ) {
                        throw new Error(
                            "The safety draft could not be created before publishing."
                        );
                    }

                    /*
                     * Tell the editor that the desired final project
                     * visibility is published.
                     */
                    const selector =
                        getVisibilitySelector();

                    if (selector) {
                        selector.value =
                            "published";
                    }

                    /*
                     * Give the active editor panel a chance to commit
                     * a new chapter/section/page or pending upload.
                     */
                    if (
                        typeof prepareActivePublish
                        === "function"
                    ) {
                        const activeResult =
                            await prepareActivePublish();

                        if (
                            activeResult === false
                            || looksLikeSaveFailure()
                        ) {
                            throw new Error(
                                document
                                    .getElementById(
                                        "message"
                                    )
                                    ?.textContent
                                || "The active editor panel could not be prepared for publishing."
                            );
                        }
                    }

                    /*
                     * Build one final normalized snapshot after the
                     * active panel has finished.
                     */
                    const payload =
                        await buildFreshPayload(
                            "publish"
                        );

                    const finalLocalSaved =
                        await writeLocal(
                            payload
                        );

                    const cloudResult =
                        await writeCloud(
                            payload
                        );

                    /*
                     * We require at least one protected copy of the
                     * final snapshot before publishing.
                     */
                    if (
                        !cloudResult.ok
                        && !finalLocalSaved
                    ) {
                        throw new Error(
                            "The final publish snapshot could not be protected."
                        );
                    }

                    /*
                     * Apply every stored project/child field.
                     */
                    await publishSnapshot(
                        payload
                    );

                    /*
                     * Only after the public data finished successfully
                     * do we clear the private draft.
                     */
                    await markCloudPublished();

                    await clearLocal();

                    lastPayload = null;
                    lastSavedAt = 0;
                    dirty = false;

                    markClean(
                        "Saved and published"
                    );

                    setMessage(
                        "Saved and published."
                    );

                    status(
                        "Published",
                        "saved"
                    );

                    showToast(
                        "Saved and published",

                        `The complete ${editorType} draft is now live. Your private draft was cleared only after every saved record finished.`,

                        "success"
                    );

                    return true;
                } catch (error) {
                    /*
                     * Never delete the draft after a failed publish.
                     */
                    dirty = true;

                    status(
                        "Publish failed  draft kept",
                        "error"
                    );

                    showToast(
                        "Publish failed  draft kept",

                        error?.message
                        || "The public update did not finish. Your private draft is still available.",

                        "error"
                    );

                    return false;
                } finally {
                    publishing = false;
                }
            }
        );
    }

    /*
     * ============================================================
     * AUTOSAVE
     * ============================================================
     */

    function markDirtyAndSchedule() {
        if (publishing) {
            return;
        }

        dirty = true;

        status(
            "Autosave pending",
            "warning"
        );

        clearTimeout(
            autosaveTimer
        );

        /*
         * Debounced autosave.
         *
         * Repeated typing keeps replacing this timer rather than
         * starting parallel save calls.
         */
        autosaveTimer =
            setTimeout(
                () => {
                    if (
                        !dirty
                        || publishing
                    ) {
                        return;
                    }

                    enqueue(
                        () =>
                            persistDraft({
                                manual: false,
                                reason: "autosave"
                            })
                    );
                },

                AUTOSAVE_DELAY_MS
            );
    }

    function eventBelongsToEditor(
        target
    ) {
        if (
            !(target instanceof Element)
        ) {
            return false;
        }

        /*
         * Modal controls and search boxes should not generate a giant
         * project draft just because the user typed into them.
         */
        if (
            target.closest(
                ".nv-unsaved-modal-backdrop"
            )
        ) {
            return false;
        }

        if (
            target.id === "chapter-search"
            || target.id === "section-search"
        ) {
            return false;
        }

        return !!target.closest(
            "#editor-content, .writing-studio-overlay, .page-studio-overlay, .image-placement-overlay"
        );
    }

    function installAutosave() {
        if (installed) {
            return;
        }

        installed = true;

        status(
            "Autosave ready",
            "idle"
        );

        /*
         * Rich text, text inputs, sliders, etc.
         */
        document.addEventListener(
            "input",

            event => {
                if (
                    !eventBelongsToEditor(
                        event.target
                    )
                ) {
                    return;
                }

                markDirtyAndSchedule();
            },

            true
        );

        /*
         * Select menus, file selection state, color controls, etc.
         */
        document.addEventListener(
            "change",

            event => {
                if (
                    !eventBelongsToEditor(
                        event.target
                    )
                ) {
                    return;
                }

                markDirtyAndSchedule();
            },

            true
        );

        /*
         * Several existing editors use clickable custom controls that
         * do not naturally fire an input/change event.
         */
        document.addEventListener(
            "click",

            event => {
                if (
                    !eventBelongsToEditor(
                        event.target
                    )
                ) {
                    return;
                }

                const control =
                    event.target.closest(
                        ".style-choice, "
                        + ".gradient-direction, "
                        + ".gradient-strength, "
                        + ".warning-choice, "
                        + ".theme-color, "
                        + ".move-button, "
                        + ".page-actions button, "
                        + ".image-placement-button-row button"
                    );

                if (control) {
                    /*
                     * Let the original click handler update editor
                     * state first.
                     */
                    setTimeout(
                        markDirtyAndSchedule,
                        0
                    );
                }
            },

            true
        );

        /*
         * If a user changes tabs/apps after editing, save the latest
         * state.
         */
        document.addEventListener(
            "visibilitychange",

            () => {
                if (
                    document.visibilityState
                    !== "hidden"
                    || !dirty
                    || publishing
                ) {
                    return;
                }

                clearTimeout(
                    autosaveTimer
                );

                enqueue(
                    () =>
                        persistDraft({
                            manual: false,
                            reason: "visibility-hidden"
                        })
                );
            }
        );

        /*
         * pagehide is more reliable than beforeunload on mobile.
         *
         * We cannot guarantee a network request will finish during
         * pagehide, but IndexedDB gives the browser a local recovery
         * opportunity.
         */
        window.addEventListener(
            "pagehide",

            () => {
                if (
                    !dirty
                    || publishing
                ) {
                    return;
                }

                clearTimeout(
                    autosaveTimer
                );

                void persistDraft({
                    manual: false,
                    reason: "pagehide"
                });
            }
        );

        /*
         * Heartbeat protects long writing sessions where a custom
         * rich-text interaction might not have generated the expected
         * input event.
         *
         * It still overwrites the SAME local/cloud draft.
         */
        heartbeatTimer =
            window.setInterval(
                () => {
                    if (
                        !dirty
                        || publishing
                    ) {
                        return;
                    }

                    clearTimeout(
                        autosaveTimer
                    );

                    enqueue(
                        () =>
                            persistDraft({
                                manual: false,
                                reason: "heartbeat"
                            })
                    );
                },

                AUTOSAVE_HEARTBEAT_MS
            );
    }

    /*
     * ============================================================
     * MANUAL SAVE DRAFT
     * ============================================================
     */

    function saveDraft() {
        clearTimeout(
            autosaveTimer
        );

        return enqueue(
            () =>
                persistDraft({
                    manual: true,
                    reason: "manual"
                })
        ).then(
            result =>
                !!result?.ok
        );
    }

    /*
     * ============================================================
     * CLEANUP
     * ============================================================
     */

    function destroy() {
        clearTimeout(
            autosaveTimer
        );

        clearInterval(
            heartbeatTimer
        );

        installed = false;
    }

    /*
     * ============================================================
     * PUBLIC MANAGER API
     * ============================================================
     */

    return {
        restoreLatest,
        installAutosave,
        saveDraft,
        publish,
        destroy,

        getLastPayload:
            () => lastPayload,

        getLastSavedAt:
            () => lastSavedAt
    };
}