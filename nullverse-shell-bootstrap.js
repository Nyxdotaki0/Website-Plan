import { initNullverseShell } from "./nullverse-shell.js";

const body = document.body;
const guestMode = body.dataset.nvGuestMode || "default";
let guestBrandHref = body.dataset.nvGuestBrandHref || "index.html";
if (guestBrandHref === "self") guestBrandHref = window.location.href;

let guestLoginHref = body.dataset.nvGuestLoginHref || "login.html";
if (body.dataset.nvGuestLoginReturn === "true") {
    const returnPath = `${window.location.pathname.split("/").pop() || "index.html"}${window.location.search || ""}${window.location.hash || ""}`;
    guestLoginHref = `login.html?return=${encodeURIComponent(returnPath)}`;
}

const detail = await initNullverseShell({
    page: body.dataset.page || "",
    betaOnlyUser: body.dataset.nvBetaOnlyUser !== "false",
    activeOnly: body.dataset.nvActiveOnly !== "false",
    guestMode,
    guestBrandHref,
    guestLoginHref
});

if (body.dataset.page === "gallery" && document.title.toLowerCase().includes("showcase")) {
    body.classList.toggle("gallery-item-signed-in", !!detail.user);
    body.classList.toggle("gallery-item-signed-out", !detail.user);
}

document.dispatchEvent(new CustomEvent("nullverse:shell-ready", { detail }));
// JavaScript source code
