const DATA_URL = "./data/packages.json";

const metaInfoEl = document.getElementById("metaInfo");
const searchInputEl = document.getElementById("searchInput");
const reloadBtnEl = document.getElementById("reloadBtn");
const packageListEl = document.getElementById("packageList");
const previewFrameEl = document.getElementById("previewFrame");
const previewHintEl = document.getElementById("previewHint");
const openExternalLinkEl = document.getElementById("openExternalLink");
const libraryTabsEl = document.getElementById("libraryTabs");
const listTitleEl = document.getElementById("listTitle");
const previewSourceTabsEl = document.getElementById("previewSourceTabs");

const state = {
    generatedAt: "",
    libraries: [],
    activeLibraryId: "",
    filtered: [],
    selectedByLibrary: {},
    previewSource: "unitycollection"
};

function escapeHtml(text) {
    return String(text ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#39;");
}

function confidenceLabel(confidence) {
    switch (confidence) {
        case "high":
            return "Chinh xac cao";
        case "medium":
            return "Kha khop";
        case "low":
            return "Can kiem tra";
        default:
            return "Chua co link";
    }
}

function sourceLabel(sourceType) {
    switch (sourceType) {
        case "mixed":
            return "folder + file nen";
        case "folder":
            return "folder";
        case "archive":
            return "file nen";
        default:
            return "khong ro";
    }
}

function getItemKey(item) {
    if (!item || typeof item !== "object") {
        return "";
    }
    return (
        item.primaryPath ||
        item.folderPath ||
        (Array.isArray(item.sourcePaths) && item.sourcePaths[0]) ||
        item.name ||
        item.bestArticleUrl ||
        ""
    );
}

function getOpenUrl(item) {
    if (!item || typeof item !== "object") {
        return "";
    }
    return item.bestArticleUrl || item.assetStoreSearchUrl || item.fallbackSearchUrl || "";
}

function getAssetStoreSearchUrl(item) {
    if (!item || typeof item !== "object") {
        return "";
    }
    return item.assetStoreSearchUrl || item.fallbackSearchUrl || "";
}

function hasAssetStoreDirectMatch(item) {
    if (!item || typeof item !== "object") {
        return false;
    }

    if (item.originalPackageUrl) {
        return true;
    }

    const confidence = String(item.assetStoreConfidence || "").toLowerCase();
    if (confidence && confidence !== "none") {
        return true;
    }

    return String(item.bestLinkSource || "") === "unityassetstore";
}

function getAssetStorePreviewUrl(item) {
    if (!item || typeof item !== "object") {
        return "";
    }
    if (!hasAssetStoreDirectMatch(item)) {
        return "";
    }
    return item.assetStoreBestUrl || item.originalPackageUrl || "";
}

function getUnityPreviewUrl(item) {
    if (!item || typeof item !== "object") {
        return "";
    }
    return (
        item.previewArticleUrl ||
        item.unitySearchUrl ||
        item.bestArticleUrl ||
        item.fallbackSearchUrl ||
        ""
    );
}

function getThumbnail(item) {
    if (!item || typeof item !== "object") {
        return "";
    }
    if (item.assetStoreThumbnail) {
        return item.assetStoreThumbnail;
    }
    if (Array.isArray(item.topCandidates)) {
        for (const candidate of item.topCandidates) {
            if (candidate.thumbnail) {
                return candidate.thumbnail;
            }
        }
    }
    if (Array.isArray(item.topAssetStoreCandidates)) {
        for (const candidate of item.topAssetStoreCandidates) {
            if (candidate.thumbnail) {
                return candidate.thumbnail;
            }
        }
    }
    return "";
}

function setOpenExternalLink(url) {
    const safeUrl = String(url || "").trim();
    if (!safeUrl) {
        openExternalLinkEl.href = "#";
        openExternalLinkEl.classList.add("disabled-link");
        return;
    }
    openExternalLinkEl.href = safeUrl;
    openExternalLinkEl.classList.remove("disabled-link");
}

function setFrameUrl(url) {
    previewFrameEl.removeAttribute("srcdoc");
    previewFrameEl.src = url;
}

function setFrameDoc(doc) {
    previewFrameEl.srcdoc = doc;
}

function formatAssetStorePrice(item) {
    const promo = String(item?.assetStorePromoPrice ?? "").trim();
    const normal = String(item?.assetStorePrice ?? "").trim();
    if (promo) {
        return normal ? `$${promo} (sale, goc $${normal})` : `$${promo}`;
    }
    if (normal) {
        return `$${normal}`;
    }
    return "Khong ro";
}

function buildAssetStorePreviewDoc(item, assetStoreUrl, unityPreviewUrl) {
    const title = escapeHtml(item.assetStoreBestTitle || item.displayName || item.name || "Unity Asset Store");
    const publisher = escapeHtml(item.assetStorePublisher || "Khong ro");
    const category = escapeHtml(item.assetStoreCategory || "Khong ro");
    const rating = escapeHtml(String(item.assetStoreRating || "Khong ro"));
    const ratingCount = escapeHtml(String(item.assetStoreRatingCount || "0"));
    const minUnityVersion = escapeHtml(String(item.assetStoreMinUnityVersion || "Khong ro"));
    const description = escapeHtml(item.assetStoreShortDescription || item.assetStoreDescription || "Khong lay duoc mo ta tu Asset Store.");
    const thumbnail = String(item.assetStoreThumbnail || "").trim();
    const safeAssetStoreUrl = escapeHtml(assetStoreUrl);
    const safeUnityPreviewUrl = unityPreviewUrl ? escapeHtml(unityPreviewUrl) : "";
    const fallbackLink = unityPreviewUrl
        ? `<a class="ghost" href="${safeUnityPreviewUrl}" target="_top" rel="noopener noreferrer">Mo preview unityassetcollection</a>`
        : "";
    const imageHtml = thumbnail
        ? `<img src="${escapeHtml(thumbnail)}" alt="${title}" loading="lazy" />`
        : `<div class="image-placeholder">No Image</div>`;

    return `<!doctype html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
        margin: 0;
        font-family: "Segoe UI", Arial, sans-serif;
        background: radial-gradient(circle at 85% 12%, rgba(111,230,201,.16), transparent 42%), linear-gradient(140deg, #071423, #0e2d3f);
        color: #e8f6ff;
        padding: 18px;
    }
    .card {
        max-width: 980px;
        margin: 0 auto;
        border: 1px solid rgba(255,255,255,.18);
        border-radius: 14px;
        background: rgba(0,0,0,.32);
        overflow: hidden;
    }
    .hero {
        display: grid;
        grid-template-columns: minmax(220px, 300px) 1fr;
        gap: 16px;
        padding: 16px;
    }
    img, .image-placeholder {
        width: 100%;
        min-height: 180px;
        max-height: 220px;
        object-fit: cover;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,.2);
        background: rgba(255,255,255,.06);
    }
    .image-placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        color: #9bc2d6;
        font-weight: 600;
    }
    h1 {
        margin: 0 0 8px;
        font-size: clamp(24px, 3vw, 36px);
        line-height: 1.08;
    }
    .meta {
        margin: 0;
        color: #9bc2d6;
        font-size: 13px;
        line-height: 1.55;
    }
    .description {
        margin: 12px 0 0;
        color: #d3ebf8;
        font-size: 14px;
        line-height: 1.6;
    }
    .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 14px;
    }
    .actions a {
        text-decoration: none;
        font-size: 13px;
        font-weight: 700;
        border-radius: 9px;
        padding: 8px 12px;
    }
    .primary {
        background: linear-gradient(120deg, #ffa95a, #ff7a59);
        color: #111827;
    }
    .ghost {
        color: #8ce7d0;
        border: 1px solid rgba(140,231,208,.45);
    }
    .notice {
        border-top: 1px solid rgba(255,255,255,.12);
        background: rgba(0,0,0,.2);
        color: #b0d0e2;
        font-size: 12px;
        padding: 10px 16px;
    }
    @media (max-width: 760px) {
        .hero { grid-template-columns: 1fr; }
    }
</style>
</head>
<body>
    <section class="card">
        <div class="hero">
            <div>${imageHtml}</div>
            <div>
                <h1>${title}</h1>
                <p class="meta">Publisher: ${publisher}</p>
                <p class="meta">Category: ${category}</p>
                <p class="meta">Gia: ${escapeHtml(formatAssetStorePrice(item))} | Rating: ${rating} (${ratingCount})</p>
                <p class="meta">Min Unity: ${minUnityVersion}</p>
                <p class="description">${description}</p>
                <div class="actions">
                    <a class="primary" href="${safeAssetStoreUrl}" target="_top" rel="noopener noreferrer">Mo trang Unity Asset Store</a>
                    ${fallbackLink}
                </div>
            </div>
        </div>
        <div class="notice">Asset Store khong cho nhung iframe tu domain ngoai (CSP frame-ancestors), nen preview o day la du lieu chinh chu da tom tat.</div>
    </section>
</body>
</html>`;
}

function buildSourceNoticePreviewDoc(options = {}) {
    const title = escapeHtml(options.title || "Khong co preview");
    const message = escapeHtml(options.message || "Khong co du lieu preview cho lua chon nay.");
    const primaryUrl = String(options.primaryUrl || "").trim();
    const primaryLabel = escapeHtml(options.primaryLabel || "Mo link");
    const secondaryUrl = String(options.secondaryUrl || "").trim();
    const secondaryLabel = escapeHtml(options.secondaryLabel || "Mo link phu");
    const primaryAction = primaryUrl ? `<a class="primary" href="${escapeHtml(primaryUrl)}" target="_top" rel="noopener noreferrer">${primaryLabel}</a>` : "";
    const secondaryAction = secondaryUrl ? `<a class="ghost" href="${escapeHtml(secondaryUrl)}" target="_top" rel="noopener noreferrer">${secondaryLabel}</a>` : "";

    return `<!doctype html>
<html lang="vi">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 18px;
        font-family: "Segoe UI", Arial, sans-serif;
        background: radial-gradient(circle at 18% 20%, rgba(255,169,90,.2), transparent 44%), linear-gradient(140deg, #091726, #102f44);
        color: #e8f6ff;
    }
    .notice-card {
        width: min(760px, 100%);
        border: 1px solid rgba(255,255,255,.2);
        border-radius: 14px;
        padding: 18px;
        background: rgba(0,0,0,.35);
    }
    h1 {
        margin: 0 0 10px;
        font-size: clamp(22px, 3vw, 32px);
    }
    p {
        margin: 0;
        color: #c6dfef;
        line-height: 1.6;
        font-size: 14px;
    }
    .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 14px;
    }
    .actions a {
        text-decoration: none;
        font-size: 13px;
        font-weight: 700;
        border-radius: 9px;
        padding: 8px 12px;
    }
    .primary {
        background: linear-gradient(120deg, #ffa95a, #ff7a59);
        color: #111827;
    }
    .ghost {
        color: #8ce7d0;
        border: 1px solid rgba(140,231,208,.45);
    }
</style>
</head>
<body>
    <section class="notice-card">
        <h1>${title}</h1>
        <p>${message}</p>
        <div class="actions">
            ${primaryAction}
            ${secondaryAction}
        </div>
    </section>
</body>
</html>`;
}

function formatDate(dateText) {
    if (!dateText) {
        return "khong ro";
    }
    const date = new Date(dateText);
    if (Number.isNaN(date.getTime())) {
        return dateText;
    }
    return date.toLocaleString("vi-VN", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
    });
}

function normalizeLibraries(data) {
    if (Array.isArray(data?.libraries) && data.libraries.length > 0) {
        return data.libraries.map((library, idx) => ({
            id: String(library.id || `lib_${idx}`),
            label: String(library.label || `Library ${idx + 1}`),
            root: String(library.root || ""),
            packages: Array.isArray(library.packages) ? library.packages : [],
            totalPackages: Number.isFinite(library.totalPackages) ? library.totalPackages : (Array.isArray(library.packages) ? library.packages.length : 0)
        }));
    }

    const fallbackPackages = Array.isArray(data?.packages) ? data.packages : [];
    return [{
        id: "package",
        label: "Unity Package",
        root: String(data?.assetsRoot || ""),
        packages: fallbackPackages,
        totalPackages: fallbackPackages.length
    }];
}

function getActiveLibrary() {
    if (!state.libraries.length) {
        return null;
    }
    return state.libraries.find((lib) => lib.id === state.activeLibraryId) || state.libraries[0];
}

function renderTabs() {
    if (!libraryTabsEl) {
        return;
    }

    if (!state.libraries.length) {
        libraryTabsEl.innerHTML = "";
        return;
    }

    libraryTabsEl.innerHTML = state.libraries
        .map((library) => {
            const isActive = library.id === state.activeLibraryId;
            return `<button class="tab-btn ${isActive ? "active" : ""}" type="button" data-lib="${escapeHtml(library.id)}">${escapeHtml(library.label)}</button>`;
        })
        .join("");

    libraryTabsEl.querySelectorAll(".tab-btn").forEach((buttonEl) => {
        buttonEl.addEventListener("click", () => {
            const targetId = buttonEl.getAttribute("data-lib") || "";
            if (!targetId || targetId === state.activeLibraryId) {
                return;
            }
            state.activeLibraryId = targetId;
            applyFilter();
        });
    });
}

function renderPreviewSourceTabs() {
    if (!previewSourceTabsEl) {
        return;
    }

    previewSourceTabsEl.querySelectorAll(".preview-source-btn").forEach((buttonEl) => {
        const source = buttonEl.getAttribute("data-source") || "";
        const isActive = source === state.previewSource;
        const label = (buttonEl.getAttribute("data-label") || buttonEl.textContent || "")
            .replace(/\s*\[dang xem\]\s*$/i, "")
            .trim();
        buttonEl.setAttribute("data-label", label);
        buttonEl.classList.toggle("active", isActive);
        buttonEl.setAttribute("aria-pressed", isActive ? "true" : "false");
        buttonEl.textContent = isActive ? `${label} [dang xem]` : label;
    });
}

function getSelectedItemFromCurrentFilter() {
    if (!state.filtered.length) {
        return null;
    }

    const activeLibrary = getActiveLibrary();
    const selectedKey = activeLibrary ? (state.selectedByLibrary[activeLibrary.id] || "") : "";
    return state.filtered.find((item) => getItemKey(item) === selectedKey) || state.filtered[0];
}

function updateMetaInfo() {
    const active = getActiveLibrary();
    if (!active) {
        return;
    }

    const total = state.libraries.reduce((sum, lib) => sum + (Array.isArray(lib.packages) ? lib.packages.length : 0), 0);
    const counts = state.libraries.map((lib) => `${lib.label}: ${Array.isArray(lib.packages) ? lib.packages.length : 0}`).join(" | ");
    const rootInfo = active.root ? ` | Root: ${active.root}` : "";
    metaInfoEl.textContent = `Da nap ${total} item (${counts}). Dang xem ${active.label}: ${active.totalPackages} item${rootInfo}. Cap nhat luc ${formatDate(state.generatedAt)} (ICT).`;
}

function clearPreview(message) {
    previewFrameEl.removeAttribute("srcdoc");
    previewFrameEl.src = "about:blank";
    previewHintEl.textContent = message;
    setOpenExternalLink("");
}

async function loadData() {
    metaInfoEl.textContent = "Dang tai du lieu...";
    try {
        let data = window.PACKAGE_DATA;
        if (!data || (!Array.isArray(data.packages) && !Array.isArray(data.libraries))) {
            const response = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: "no-store" });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            data = await response.json();
        }

        state.generatedAt = data.generatedAt ?? "";
        state.libraries = normalizeLibraries(data);

        const defaultLibraryId = String(data.defaultLibraryId || "");
        const canUseDefault = state.libraries.some((library) => library.id === defaultLibraryId);
        state.activeLibraryId = canUseDefault ? defaultLibraryId : (state.libraries[0]?.id || "");

        renderTabs();
        renderPreviewSourceTabs();
        applyFilter();
        updateMetaInfo();
    } catch (error) {
        metaInfoEl.textContent = `Khong doc duoc ${DATA_URL}. Chay generate-links.ps1 roi tai lai.`;
        packageListEl.innerHTML = `<div class="empty">${escapeHtml(String(error.message || error))}</div>`;
        clearPreview("Khong tai duoc du lieu preview.");
        if (libraryTabsEl) {
            libraryTabsEl.innerHTML = "";
        }
    }
}

function applyFilter() {
    const activeLibrary = getActiveLibrary();
    if (!activeLibrary) {
        state.filtered = [];
        renderTabs();
        renderPreviewSourceTabs();
        renderList();
        clearPreview("Khong co du lieu de hien thi.");
        return;
    }

    if (listTitleEl) {
        listTitleEl.textContent = `Danh sach ${activeLibrary.label}`;
    }

    const keyword = searchInputEl.value.trim().toLowerCase();
    const sourceItems = Array.isArray(activeLibrary.packages) ? activeLibrary.packages : [];

    if (!keyword) {
        state.filtered = [...sourceItems];
    } else {
        state.filtered = sourceItems.filter((item) => {
            const sourceNames = Array.isArray(item.sourceNames) ? item.sourceNames.join(" ") : "";
            const haystack = `${item.name ?? ""} ${item.displayName ?? ""} ${item.bestArticleTitle ?? ""} ${sourceNames}`.toLowerCase();
            return haystack.includes(keyword);
        });
    }

    const selectedKey = state.selectedByLibrary[activeLibrary.id] || "";

    if (!state.filtered.length) {
        renderTabs();
        renderPreviewSourceTabs();
        renderList();
        clearPreview("Khong co pack khop bo loc trong tab nay.");
        return;
    }

    const selectedItem = state.filtered.find((item) => getItemKey(item) === selectedKey);
    if (!selectedItem) {
        setPreview(state.filtered[0], { rerender: false });
    }

    renderTabs();
    renderPreviewSourceTabs();
    renderList();
    updateMetaInfo();
}

function setPreview(item, options = {}) {
    const { rerender = true } = options;
    if (!item || typeof item !== "object") {
        clearPreview("Khong co package de preview.");
        return;
    }

    const activeLibrary = getActiveLibrary();
    const assetStorePreviewUrl = getAssetStorePreviewUrl(item);
    const assetStoreSearchUrl = getAssetStoreSearchUrl(item);
    const unityPreviewUrl = getUnityPreviewUrl(item);

    if (activeLibrary) {
        state.selectedByLibrary[activeLibrary.id] = getItemKey(item);
    }

    if (state.previewSource === "assetstore") {
        if (assetStorePreviewUrl) {
            setFrameDoc(buildAssetStorePreviewDoc(item, assetStorePreviewUrl, unityPreviewUrl));
            previewHintEl.textContent = "Nguon preview: Unity Asset Store (native).";
            setOpenExternalLink(assetStorePreviewUrl);
        } else if (assetStoreSearchUrl) {
            setFrameDoc(buildSourceNoticePreviewDoc({
                title: item.displayName || item.name || "Unity Asset Store",
                message: "Khong tim thay link package direct tren Asset Store cho item nay. Ban co the mo trang search de xac nhan nhanh.",
                primaryLabel: "Mo Unity Asset Store Search",
                primaryUrl: assetStoreSearchUrl,
                secondaryLabel: unityPreviewUrl ? "Mo preview unityassetcollection" : "",
                secondaryUrl: unityPreviewUrl || ""
            }));
            previewHintEl.textContent = "Nguon preview: Unity Asset Store (search fallback).";
            setOpenExternalLink(assetStoreSearchUrl);
        } else {
            setFrameDoc(buildSourceNoticePreviewDoc({
                title: item.displayName || item.name || "Unity Asset Store",
                message: "Item nay chua co du lieu tu Unity Asset Store.",
                primaryLabel: unityPreviewUrl ? "Mo unityassetcollection" : "",
                primaryUrl: unityPreviewUrl || ""
            }));
            previewHintEl.textContent = "Khong co du lieu Asset Store cho item nay.";
            setOpenExternalLink(unityPreviewUrl || "");
        }
    } else if (unityPreviewUrl) {
        setFrameUrl(unityPreviewUrl);
        previewHintEl.textContent = `Nguon preview: unityassetcollection (${item.bestArticleTitle || item.name}).`;
        setOpenExternalLink(unityPreviewUrl);
    } else {
        const fallbackUrl = assetStorePreviewUrl || assetStoreSearchUrl;
        setFrameDoc(buildSourceNoticePreviewDoc({
            title: item.displayName || item.name || "unityassetcollection",
            message: "Item nay khong co link preview unityassetcollection.",
            primaryLabel: fallbackUrl ? "Mo Unity Asset Store" : "",
            primaryUrl: fallbackUrl || ""
        }));
        previewHintEl.textContent = "Khong co link unityassetcollection cho item nay.";
        setOpenExternalLink(fallbackUrl || "");
    }

    if (rerender) {
        renderList();
        renderTabs();
        renderPreviewSourceTabs();
    }
}

async function copyText(value) {
    if (!value) {
        return;
    }
    try {
        await navigator.clipboard.writeText(value);
    } catch {
        window.prompt("Copy duong dan:", value);
    }
}

function renderList() {
    if (!state.filtered.length) {
        packageListEl.innerHTML = `<div class="empty">Khong co pack khop bo loc.</div>`;
        return;
    }

    const activeLibrary = getActiveLibrary();
    const selectedKey = activeLibrary ? (state.selectedByLibrary[activeLibrary.id] || "") : "";

    packageListEl.innerHTML = state.filtered
        .map((item, index) => {
            const itemKey = getItemKey(item);
            const isActive = itemKey && itemKey === selectedKey ? "active" : "";
            const thumbnailSrc = getThumbnail(item);
            const imageHtml = thumbnailSrc
                ? `<img class="package-thumbnail" src="${escapeHtml(thumbnailSrc)}" alt="${escapeHtml(item.name)}" loading="lazy" />`
                : `<div class="package-thumbnail placeholder">No Image</div>`;

            return `
                <article class="package-card ${isActive}" data-idx="${index}">
                    <div class="thumbnail-container">
                        ${imageHtml}
                    </div>
                    <h3 class="package-title" title="${escapeHtml(item.name || "(no name)")}">${escapeHtml(item.name || "(no name)")}</h3>
                </article>
            `;
        })
        .join("");

    const cards = packageListEl.querySelectorAll(".package-card");
    cards.forEach((card) => {
        const idx = Number(card.getAttribute("data-idx"));
        const item = state.filtered[idx];
        if (!item) {
            return;
        }

        card.addEventListener("click", () => {
            setPreview(item);
        });
    });
}

function setupPreviewSourceTabs() {
    if (!previewSourceTabsEl) {
        return;
    }

    const preferredSourceOrder = ["unitycollection", "assetstore"];
    const sourceButtons = Array.from(previewSourceTabsEl.querySelectorAll(".preview-source-btn"));
    sourceButtons.forEach((buttonEl) => {
        const cleanLabel = (buttonEl.getAttribute("data-label") || buttonEl.textContent || "")
            .replace(/\s*\[dang xem\]\s*$/i, "")
            .trim();
        if (cleanLabel) {
            buttonEl.setAttribute("data-label", cleanLabel);
        }
    });

    preferredSourceOrder.forEach((source) => {
        const buttonEl = sourceButtons.find((btn) => (btn.getAttribute("data-source") || "") === source);
        if (buttonEl) {
            previewSourceTabsEl.appendChild(buttonEl);
        }
    });

    renderPreviewSourceTabs();

    previewSourceTabsEl.addEventListener("click", (event) => {
        const buttonEl = event.target.closest(".preview-source-btn");
        if (!buttonEl) {
            return;
        }

        const source = buttonEl.getAttribute("data-source") || "";
        if (!source || source === state.previewSource) {
            return;
        }

        state.previewSource = source;
        renderPreviewSourceTabs();

        const selectedItem = getSelectedItemFromCurrentFilter();
        if (selectedItem) {
            setPreview(selectedItem, { rerender: false });
        } else {
            clearPreview("Chon package de xem preview.");
        }
    });
}

searchInputEl.addEventListener("input", applyFilter);
reloadBtnEl.addEventListener("click", loadData);
setupPreviewSourceTabs();

loadData();
