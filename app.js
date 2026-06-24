const DATA_URL = "./data/packages.json";

const metaInfoEl = document.getElementById("metaInfo");
const searchInputEl = document.getElementById("searchInput");
const reloadBtnEl = document.getElementById("reloadBtn");
const packageListEl = document.getElementById("packageList");
const previewFrameEl = document.getElementById("previewFrame");
const previewHintEl = document.getElementById("previewHint");
const openExternalLinkEl = document.getElementById("openExternalLink");
const openFileLocationEl = document.getElementById("openFileLocation");
const folderTreeEl = document.getElementById("folderTree");
const listTitleEl = document.getElementById("listTitle");
const previewSourceTabsEl = document.getElementById("previewSourceTabs");
const browserUrlTextEl = document.getElementById("browserUrlText");

const state = {
    generatedAt: "",
    libraries: [],
    activeLibraryId: "",
    filtered: [],
    selectedByLibrary: {},
    previewSource: "unitycollection",
    collapsedFolders: {}
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
            return "Chính xác cao";
        case "medium":
            return "Khá khớp";
        case "low":
            return "Cần kiểm tra";
        default:
            return "Chưa có link";
    }
}

function sourceLabel(sourceType) {
    switch (sourceType) {
        case "mixed":
            return "folder + file nén";
        case "folder":
            return "folder";
        case "archive":
            return "file nén";
        default:
            return "không rõ";
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
    if (Array.isArray(item.topUnityCandidates)) {
        for (const candidate of item.topUnityCandidates) {
            if (candidate.thumbnail) {
                return candidate.thumbnail;
            }
        }
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

function updateFileLocationButton(item) {
    if (!openFileLocationEl) {
        return;
    }
    const path = item ? (item.primaryPath || item.folderPath || (Array.isArray(item.sourcePaths) && item.sourcePaths[0]) || "") : "";
    if (!path) {
        openFileLocationEl.classList.add("disabled-link");
        return;
    }
    openFileLocationEl.classList.remove("disabled-link");
}

function showToast(message) {
    let toast = document.getElementById("toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast";
        toast.className = "toast";
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => {
        toast.classList.remove("show");
    }, 2500);
}

async function handleOpenFileLocation() {
    const item = getSelectedItemFromCurrentFilter();
    if (!item) {
        return;
    }

    const path = item.primaryPath || item.folderPath || (Array.isArray(item.sourcePaths) && item.sourcePaths[0]) || "";
    if (!path) {
        showToast("Không tìm thấy đường dẫn cho mục này.");
        return;
    }

    try {
        await navigator.clipboard.writeText(path);
        showToast("✓ Đã copy đường dẫn");
    } catch (e) {
        // Fallback for browsers that block clipboard API
        window.prompt("Copy đường dẫn:", path);
    }
}

function setFrameUrl(url) {
    previewFrameEl.removeAttribute("srcdoc");
    previewFrameEl.src = url;
    if (browserUrlTextEl) {
        browserUrlTextEl.textContent = url;
    }
}

function setFrameDoc(doc) {
    previewFrameEl.srcdoc = doc;
    if (browserUrlTextEl) {
        browserUrlTextEl.textContent = "data:text/html;custom-preview-summary";
    }
}

function formatAssetStorePrice(item) {
    const promo = String(item?.assetStorePromoPrice ?? "").trim();
    const normal = String(item?.assetStorePrice ?? "").trim();
    if (promo) {
        return normal ? `$${promo} (giảm giá, gốc $${normal})` : `$${promo}`;
    }
    if (normal) {
        return `$${normal}`;
    }
    return "Không rõ";
}

function buildAssetStorePreviewDoc(item, assetStoreUrl, unityPreviewUrl) {
    const title = escapeHtml(item.assetStoreBestTitle || item.displayName || item.name || "Unity Asset Store");
    const publisher = escapeHtml(item.assetStorePublisher || "Không rõ");
    const category = escapeHtml(item.assetStoreCategory || "Không rõ");
    const rating = escapeHtml(String(item.assetStoreRating || "Không rõ"));
    const ratingCount = escapeHtml(String(item.assetStoreRatingCount || "0"));
    const minUnityVersion = escapeHtml(String(item.assetStoreMinUnityVersion || "Không rõ"));
    const description = escapeHtml(item.assetStoreShortDescription || item.assetStoreDescription || "Không lấy được mô tả từ Asset Store.");
    const thumbnail = String(item.assetStoreThumbnail || "").trim();
    const safeAssetStoreUrl = escapeHtml(assetStoreUrl);
    const safeUnityPreviewUrl = unityPreviewUrl ? escapeHtml(unityPreviewUrl) : "";
    const fallbackLink = unityPreviewUrl
        ? `<a class="ghost" href="${safeUnityPreviewUrl}" target="_blank" rel="noopener noreferrer">Mở preview unityassetcollection</a>`
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
                <p class="meta">Giá: ${escapeHtml(formatAssetStorePrice(item))} | Đánh giá: ${rating} (${ratingCount})</p>
                <p class="meta">Min Unity: ${minUnityVersion}</p>
                <p class="description">${description}</p>
                <div class="actions">
                    <a class="primary" href="${safeAssetStoreUrl}" target="_blank" rel="noopener noreferrer">Mở trang Unity Asset Store</a>
                    ${fallbackLink}
                </div>
            </div>
        </div>
        <div class="notice">Asset Store không cho nhúng iframe từ domain ngoài (CSP frame-ancestors), nên preview ở đây là dữ liệu chính chủ đã tóm tắt.</div>
    </section>
</body>
</html>`;
}

function buildSourceNoticePreviewDoc(options = {}) {
    const title = escapeHtml(options.title || "Không có preview");
    const message = escapeHtml(options.message || "Không có dữ liệu preview cho lựa chọn này.");
    const primaryUrl = String(options.primaryUrl || "").trim();
    const primaryLabel = escapeHtml(options.primaryLabel || "Mở link");
    const secondaryUrl = String(options.secondaryUrl || "").trim();
    const secondaryLabel = escapeHtml(options.secondaryLabel || "Mở link phụ");
    const primaryAction = primaryUrl ? `<a class="primary" href="${escapeHtml(primaryUrl)}" target="_blank" rel="noopener noreferrer">${primaryLabel}</a>` : "";
    const secondaryAction = secondaryUrl ? `<a class="ghost" href="${escapeHtml(secondaryUrl)}" target="_blank" rel="noopener noreferrer">${secondaryLabel}</a>` : "";

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
        return "không rõ";
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
            parentFolder: library.parentFolder ? String(library.parentFolder) : null,
            packages: Array.isArray(library.packages) ? library.packages : [],
            totalPackages: Number.isFinite(library.totalPackages) ? library.totalPackages : (Array.isArray(library.packages) ? library.packages.length : 0)
        }));
    }

    const fallbackPackages = Array.isArray(data?.packages) ? data.packages : [];
    return [{
        id: "package",
        label: "Unity Package",
        root: String(data?.assetsRoot || ""),
        parentFolder: "Asset_Unity_3D",
        packages: fallbackPackages,
        totalPackages: fallbackPackages.length
    }];
}

function getActiveLibrary() {
    if (!state.libraries.length) {
        return null;
    }
    const exactMatch = state.libraries.find((lib) => lib.id === state.activeLibraryId);
    if (exactMatch) {
        return exactMatch;
    }
    const isParent = state.libraries.some((lib) => lib.parentFolder === state.activeLibraryId);
    if (isParent) {
        const childLibs = state.libraries.filter((lib) => lib.parentFolder === state.activeLibraryId);
        const combinedPackages = [];
        childLibs.forEach((lib) => {
            combinedPackages.push(...(lib.packages || []));
        });
        return {
            id: state.activeLibraryId,
            label: state.activeLibraryId,
            root: "",
            parentFolder: null,
            packages: combinedPackages,
            totalPackages: combinedPackages.length,
            isVirtual: true
        };
    }
    return state.libraries[0];
}

function renderTree() {
    if (!folderTreeEl) {
        return;
    }

    if (!state.libraries.length) {
        folderTreeEl.innerHTML = "";
        return;
    }

    const parents = new Set();
    const childLibraries = [];
    const standaloneLibraries = [];

    state.libraries.forEach((lib) => {
        if (lib.parentFolder) {
            parents.add(lib.parentFolder);
            childLibraries.push(lib);
        } else {
            standaloneLibraries.push(lib);
        }
    });

    let treeHtml = "";

    parents.forEach((parentName) => {
        const children = childLibraries.filter((lib) => lib.parentFolder === parentName);
        const totalCount = children.reduce((sum, lib) => sum + lib.totalPackages, 0);
        const isCollapsed = state.collapsedFolders[parentName] === true;
        const isActive = state.activeLibraryId === parentName;

        const caretIcon = `
            <svg class="tree-caret" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"></polyline>
            </svg>`;

        const folderIcon = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
            </svg>`;

        let childrenHtml = "";
        children.forEach((lib) => {
            const isChildActive = state.activeLibraryId === lib.id;
            childrenHtml += `
                <div class="tree-node" data-id="${escapeHtml(lib.id)}">
                    <div class="tree-row ${isChildActive ? "active" : ""}" data-id="${escapeHtml(lib.id)}">
                        <span class="tree-icon">${folderIcon}</span>
                        <span class="tree-label">${escapeHtml(lib.label)}</span>
                        <span class="tree-count">${lib.totalPackages}</span>
                    </div>
                </div>
            `;
        });

        treeHtml += `
            <div class="tree-node ${isCollapsed ? "collapsed" : ""}" data-parent-id="${escapeHtml(parentName)}">
                <div class="tree-row ${isActive ? "active" : ""}" data-id="${escapeHtml(parentName)}">
                    <span class="tree-caret-container" data-toggle="${escapeHtml(parentName)}">
                        ${caretIcon}
                    </span>
                    <span class="tree-icon">${folderIcon}</span>
                    <span class="tree-label">${escapeHtml(parentName)}</span>
                    <span class="tree-count">${totalCount}</span>
                </div>
                <div class="tree-children">
                    ${childrenHtml}
                </div>
            </div>
        `;
    });

    standaloneLibraries.forEach((lib) => {
        const isActive = state.activeLibraryId === lib.id;
        const folderIcon = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
            </svg>`;

        treeHtml += `
            <div class="tree-node" data-id="${escapeHtml(lib.id)}">
                <div class="tree-row ${isActive ? "active" : ""}" data-id="${escapeHtml(lib.id)}">
                    <span class="tree-caret" style="visibility: hidden;"></span>
                    <span class="tree-icon">${folderIcon}</span>
                    <span class="tree-label">${escapeHtml(lib.label)}</span>
                    <span class="tree-count">${lib.totalPackages}</span>
                </div>
            </div>
        `;
    });

    folderTreeEl.innerHTML = treeHtml;

    folderTreeEl.querySelectorAll(".tree-caret-container").forEach((el) => {
        el.addEventListener("click", (e) => {
            e.stopPropagation();
            const toggleId = el.getAttribute("data-toggle");
            state.collapsedFolders[toggleId] = !state.collapsedFolders[toggleId];
            renderTree();
        });
    });

    folderTreeEl.querySelectorAll(".tree-row").forEach((rowEl) => {
        rowEl.addEventListener("click", (e) => {
            const targetId = rowEl.getAttribute("data-id");
            if (targetId && targetId !== state.activeLibraryId) {
                state.activeLibraryId = targetId;
                applyFilter();
            }
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
            .replace(/\s*\[(?:dang|đang) xem\]\s*$/i, "")
            .trim();
        buttonEl.setAttribute("data-label", label);
        buttonEl.classList.toggle("active", isActive);
        buttonEl.setAttribute("aria-pressed", isActive ? "true" : "false");

        const eyeIcon = isActive 
            ? `<svg class="icon-eye" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>` 
            : "";
        buttonEl.innerHTML = `${eyeIcon}${escapeHtml(label)}`;
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
    const rootInfo = active.root ? `<div class="meta-line"><strong>Thư mục gốc:</strong> ${escapeHtml(active.root)}</div>` : "";

    metaInfoEl.innerHTML = `
        ${rootInfo}
        <div class="meta-line"><strong>Cập nhật lúc:</strong> ${formatDate(state.generatedAt)} (ICT)</div>
    `;
}

function clearPreview(message) {
    previewFrameEl.removeAttribute("srcdoc");
    previewFrameEl.src = "about:blank";
    previewHintEl.textContent = message;
    setOpenExternalLink("");
    updateFileLocationButton(null);
    if (browserUrlTextEl) {
        browserUrlTextEl.textContent = "about:blank";
    }
}

async function loadData() {
    metaInfoEl.innerHTML = "<div>Đang tải dữ liệu...</div>";
    try {
        let data = null;
        
        // Try to fetch packages.json first (bypasses browser caching when served over HTTP)
        try {
            const response = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: "no-store" });
            if (response.ok) {
                data = await response.json();
            }
        } catch (fetchError) {
            console.warn("Could not fetch packages.json dynamically (normal if using file:///):", fetchError);
        }

        // Fallback to static script data if fetch failed
        if (!data) {
            data = window.PACKAGE_DATA;
        }

        if (!data || (!Array.isArray(data.packages) && !Array.isArray(data.libraries))) {
            throw new Error("No package data available.");
        }

        state.generatedAt = data.generatedAt ?? "";
        state.libraries = normalizeLibraries(data);

        const defaultLibraryId = String(data.defaultLibraryId || "Asset_Unity_3D");
        const isValidParent = state.libraries.some((library) => library.parentFolder === defaultLibraryId);
        const isValidLib = state.libraries.some((library) => library.id === defaultLibraryId);
        state.activeLibraryId = (isValidParent || isValidLib) ? defaultLibraryId : (state.libraries[0]?.id || "");

        renderTree();
        renderPreviewSourceTabs();
        applyFilter();
        updateMetaInfo();
    } catch (error) {
        metaInfoEl.innerHTML = `<div>Không đọc được ${DATA_URL}. Chạy generate-links.ps1 rồi tải lại.</div>`;
        packageListEl.innerHTML = `<div class="empty">${escapeHtml(String(error.message || error))}</div>`;
        clearPreview("Không tải được dữ liệu preview.");
        if (folderTreeEl) {
            folderTreeEl.innerHTML = "";
        }
    }
}

function applyFilter() {
    const activeLibrary = getActiveLibrary();
    if (!activeLibrary) {
        state.filtered = [];
        renderTree();
        renderPreviewSourceTabs();
        renderList();
        clearPreview("Không có dữ liệu để hiển thị.");
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
        renderTree();
        renderPreviewSourceTabs();
        renderList();
        clearPreview("Không có pack khớp bộ lọc trong thư mục này.");
        return;
    }

    const selectedItem = state.filtered.find((item) => getItemKey(item) === selectedKey);
    if (!selectedItem) {
        setPreview(state.filtered[0], { rerender: false });
    }

    renderTree();
    renderPreviewSourceTabs();
    renderList();
    updateMetaInfo();
}

function setPreview(item, options = {}) {
    const { rerender = true } = options;
    if (!item || typeof item !== "object") {
        clearPreview("Không có package để preview.");
        return;
    }

    const activeLibrary = getActiveLibrary();
    const assetStorePreviewUrl = getAssetStorePreviewUrl(item);
    const assetStoreSearchUrl = getAssetStoreSearchUrl(item);
    const unityPreviewUrl = getUnityPreviewUrl(item);

    if (activeLibrary) {
        state.selectedByLibrary[activeLibrary.id] = getItemKey(item);
    }

    updateFileLocationButton(item);

    if (state.previewSource === "assetstore") {
        if (assetStorePreviewUrl) {
            setFrameDoc(buildAssetStorePreviewDoc(item, assetStorePreviewUrl, unityPreviewUrl));
            previewHintEl.textContent = "Nguồn preview: Unity Asset Store (gốc).";
            setOpenExternalLink(assetStorePreviewUrl);
        } else if (assetStoreSearchUrl) {
            setFrameDoc(buildSourceNoticePreviewDoc({
                title: item.displayName || item.name || "Unity Asset Store",
                message: "Không tìm thấy link package trực tiếp trên Asset Store cho item này. Bạn có thể mở trang tìm kiếm để xác nhận nhanh.",
                primaryLabel: "Mở Unity Asset Store Search",
                primaryUrl: assetStoreSearchUrl,
                secondaryLabel: unityPreviewUrl ? "Mở preview unityassetcollection" : "",
                secondaryUrl: unityPreviewUrl || ""
            }));
            previewHintEl.textContent = "Nguồn preview: Unity Asset Store (tìm kiếm thay thế).";
            setOpenExternalLink(assetStoreSearchUrl);
        } else {
            setFrameDoc(buildSourceNoticePreviewDoc({
                title: item.displayName || item.name || "Unity Asset Store",
                message: "Item này chưa có dữ liệu từ Unity Asset Store.",
                primaryLabel: unityPreviewUrl ? "Mở unityassetcollection" : "",
                primaryUrl: unityPreviewUrl || ""
            }));
            previewHintEl.textContent = "Không có dữ liệu Asset Store cho item này.";
            setOpenExternalLink(unityPreviewUrl || "");
        }
    } else if (unityPreviewUrl) {
        setFrameUrl(unityPreviewUrl);
        previewHintEl.textContent = `Nguồn preview: unityassetcollection (${item.bestArticleTitle || item.name}).`;
        setOpenExternalLink(unityPreviewUrl);
    } else {
        const fallbackUrl = assetStorePreviewUrl || assetStoreSearchUrl;
        setFrameDoc(buildSourceNoticePreviewDoc({
            title: item.displayName || item.name || "unityassetcollection",
            message: "Item này không có link preview unityassetcollection.",
            primaryLabel: fallbackUrl ? "Mở Unity Asset Store" : "",
            primaryUrl: fallbackUrl || ""
        }));
        previewHintEl.textContent = "Không có link unityassetcollection cho item này.";
        setOpenExternalLink(fallbackUrl || "");
    }

    if (rerender) {
        renderList();
        renderTree();
        renderPreviewSourceTabs();
    } else {
        if (packageListEl) {
            const cards = packageListEl.querySelectorAll(".package-card");
            const activeKey = getItemKey(item);
            cards.forEach((card) => {
                const cardIdx = Number(card.getAttribute("data-idx"));
                const cardItem = state.filtered[cardIdx];
                if (cardItem) {
                    const isCardActive = getItemKey(cardItem) === activeKey;
                    card.classList.toggle("active", isCardActive);
                }
            });
        }
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
        packageListEl.innerHTML = `<div class="empty">Không có pack khớp bộ lọc.</div>`;
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

            const sourceTypeBadge = item.sourceType 
                ? `<span class="badge badge-${item.sourceType}">${sourceLabel(item.sourceType)}</span>` 
                : "";
            const sourceCountBadge = item.sourceCount > 1 
                ? `<span class="badge badge-count">${item.sourceCount} items</span>` 
                : "";

            return `
                <article class="package-card ${isActive}" data-idx="${index}">
                    <div class="thumbnail-container">
                        ${imageHtml}
                        <div class="card-badges">
                            ${sourceTypeBadge}
                        </div>
                    </div>
                    <div class="card-info">
                        <h3 class="package-title" title="${escapeHtml(item.name || "(no name)")}">${escapeHtml(item.name || "(no name)")}</h3>
                        ${sourceCountBadge}
                    </div>
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
            setPreview(item, { rerender: false });
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
            clearPreview("Chọn package để xem preview.");
        }
    });
}

searchInputEl.addEventListener("input", applyFilter);
reloadBtnEl.addEventListener("click", loadData);
if (openFileLocationEl) {
    openFileLocationEl.addEventListener("click", handleOpenFileLocation);
}
setupPreviewSourceTabs();

loadData();
