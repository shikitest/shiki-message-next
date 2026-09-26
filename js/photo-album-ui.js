/*
 * ============================================================
 * Shiki Message - Photo Album UI
 * 照片集界面
 * ============================================================
 */

(function () {

    "use strict";

    let currentFilter = "all";


    // ============================================================
    // 工具
    // ============================================================

    function formatTime(timestamp) {

        if (!timestamp) {
            return "";
        }

        const date = new Date(timestamp);

        return date.toLocaleString(
            "zh-CN",
            {
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            }
        );
    }


    function getSourceLabel(source) {

        const map = {
            "daily-random": "每日随机",
            "daily-random-test": "每日随机",
            "reply-random": "聊天发送",
            "user-upload": "用户上传",
            "random": "随机生成"
        };

        return map[source] || "照片";
    }


    // ============================================================
    // 加载 CSS
    // ============================================================

    function loadCSS() {

        if (
            document.getElementById(
                "photo-album-css"
            )
        ) {
            return;
        }

        const link =
            document.createElement("link");

        link.id =
            "photo-album-css";

        link.rel =
            "stylesheet";

        link.href =
            "css/photo-album.css";

        document.head.appendChild(link);
    }


    // ============================================================
    // 创建 UI
    // ============================================================

    function createUI() {

        if (
            document.getElementById(
                "photo-album-overlay"
            )
        ) {
            return;
        }

        const overlay =
            document.createElement("div");

        overlay.id =
            "photo-album-overlay";

        overlay.className =
            "photo-album-overlay";

        overlay.innerHTML = `
            <div class="photo-album-panel">
                <div class="photo-album-header">
                    <h2 class="photo-album-title">
                        照片集
                    </h2>

                    <div class="photo-album-header-actions">
                        <button
                            type="button"
                            class="photo-album-btn"
                            id="photo-album-upload-btn"
                        >
                            ＋ 添加照片
                        </button>

                        <button
                            type="button"
                            class="photo-album-btn photo-album-close"
                            id="photo-album-close-btn"
                            aria-label="关闭"
                        >
                            ×
                        </button>
                    </div>
                </div>

                <div
                    class="photo-album-toolbar"
                    id="photo-album-toolbar"
                >
                </div>

                <div class="photo-album-body">

                    <div
                        class="photo-album-grid"
                        id="photo-album-grid"
                    >
                    </div>

                    <div
                        class="photo-album-empty"
                        id="photo-album-empty"
                        style="display:none;"
                    >
                        暂时还没有照片
                    </div>

                </div>
            </div>

            <input
                id="photo-album-file-input"
                class="photo-album-hidden-input"
                type="file"
                accept="image/*"
            >
        `;

        document.body.appendChild(
            overlay
        );


        const viewer =
            document.createElement("div");

        viewer.id =
            "photo-album-viewer";

        viewer.className =
            "photo-album-viewer";

        viewer.innerHTML = `
            <button
                type="button"
                class="photo-album-viewer-close"
                id="photo-album-viewer-close"
            >
                ×
            </button>

            <img
                id="photo-album-viewer-image"
                alt="照片"
            >
        `;

        document.body.appendChild(
            viewer
        );


        bindUIEvents();
    }


    // ============================================================
    // 绑定事件
    // ============================================================

    function bindUIEvents() {

        const overlay =
            document.getElementById(
                "photo-album-overlay"
            );

        const closeBtn =
            document.getElementById(
                "photo-album-close-btn"
            );

        const uploadBtn =
            document.getElementById(
                "photo-album-upload-btn"
            );

        const fileInput =
            document.getElementById(
                "photo-album-file-input"
            );

        const viewer =
            document.getElementById(
                "photo-album-viewer"
            );

        const viewerClose =
            document.getElementById(
                "photo-album-viewer-close"
            );


        closeBtn.addEventListener(
            "click",
            closeAlbum
        );


        overlay.addEventListener(
            "click",
            function (event) {

                if (
                    event.target === overlay
                ) {
                    closeAlbum();
                }
            }
        );


        uploadBtn.addEventListener(
            "click",
            function () {

                fileInput.click();

            }
        );


        fileInput.addEventListener(
            "change",
            async function () {

                const file =
                    fileInput.files &&
                    fileInput.files[0];

                if (!file) {
                    return;
                }

                try {

                    uploadBtn.disabled =
                        true;

                    uploadBtn.textContent =
                        "处理中…";


                    await window.PhotoAlbum.addUserPhoto(
                        file,
                        {
                            ownerId: "user",
                            ownerName: "我"
                        }
                    );


                    await renderAlbum();


                } catch (error) {

                    console.error(
                        "[PhotoAlbumUI] 上传失败：",
                        error
                    );

                    alert(
                        "添加照片失败"
                    );

                } finally {

                    uploadBtn.disabled =
                        false;

                    uploadBtn.textContent =
                        "＋ 添加照片";

                    fileInput.value =
                        "";

                }
            }
        );


        viewer.addEventListener(
            "click",
            function (event) {

                if (
                    event.target === viewer
                ) {
                    closeViewer();
                }

            }
        );


        viewerClose.addEventListener(
            "click",
            closeViewer
        );


        document.addEventListener(
            "keydown",
            function (event) {

                if (
                    event.key === "Escape"
                ) {

                    closeViewer();
                    closeAlbum();

                }
            }
        );


        window.addEventListener(
            "photo-album-updated",
            function () {

                if (
                    overlay.classList.contains(
                        "active"
                    )
                ) {

                    renderAlbum();

                }
            }
        );
    }


    // ============================================================
    // 打开 / 关闭
    // ============================================================

    async function openAlbum() {

        const overlay =
            document.getElementById(
                "photo-album-overlay"
            );

        if (!overlay) {
            return;
        }

        overlay.classList.add(
            "active"
        );

        await renderAlbum();
    }


    function closeAlbum() {

        const overlay =
            document.getElementById(
                "photo-album-overlay"
            );

        if (!overlay) {
            return;
        }

        overlay.classList.remove(
            "active"
        );
    }


    // ============================================================
    // 查看大图
    // ============================================================

    function openViewer(image) {

        const viewer =
            document.getElementById(
                "photo-album-viewer"
            );

        const viewerImage =
            document.getElementById(
                "photo-album-viewer-image"
            );

        viewerImage.src =
            image;

        viewer.classList.add(
            "active"
        );
    }


    function closeViewer() {

        const viewer =
            document.getElementById(
                "photo-album-viewer"
            );

        const viewerImage =
            document.getElementById(
                "photo-album-viewer-image"
            );

        if (!viewer) {
            return;
        }

        viewer.classList.remove(
            "active"
        );

        if (viewerImage) {
            viewerImage.src = "";
        }
    }


    // ============================================================
    // 筛选栏
    // ============================================================

    function buildFilters(photos) {

        const toolbar =
            document.getElementById(
                "photo-album-toolbar"
            );

        toolbar.innerHTML = "";


        const ownersMap =
            new Map();


        photos.forEach(
            function (photo) {

                if (
                    photo.ownerId &&
                    photo.ownerName
                ) {

                    ownersMap.set(
                        photo.ownerId,
                        photo.ownerName
                    );

                }
            }
        );


        addFilterButton(
            toolbar,
            "all",
            "全部"
        );


        ownersMap.forEach(
            function (
                ownerName,
                ownerId
            ) {

                addFilterButton(
                    toolbar,
                    ownerId,
                    ownerName
                );

            }
        );
    }


    function addFilterButton(
        toolbar,
        value,
        label
    ) {

        const button =
            document.createElement(
                "button"
            );

        button.type =
            "button";

        button.className =
            "photo-album-filter";

        if (
            currentFilter === value
        ) {

            button.classList.add(
                "active"
            );
        }

        button.textContent =
            label;

        button.addEventListener(
            "click",
            async function () {

                currentFilter =
                    value;

                await renderAlbum();

            }
        );

        toolbar.appendChild(
            button
        );
    }


    // ============================================================
    // 渲染照片
    // ============================================================

    async function renderAlbum() {

        if (
            !window.PhotoAlbum
        ) {

            console.error(
                "[PhotoAlbumUI] PhotoAlbum 未加载"
            );

            return;
        }


        const photos =
            await window.PhotoAlbum.getAll();


        buildFilters(
            photos
        );


        let visiblePhotos =
            photos;


        if (
            currentFilter !== "all"
        ) {

            visiblePhotos =
                photos.filter(
                    function (photo) {

                        return (
                            photo.ownerId ===
                            currentFilter
                        );

                    }
                );
        }


        const grid =
            document.getElementById(
                "photo-album-grid"
            );

        const empty =
            document.getElementById(
                "photo-album-empty"
            );


        grid.innerHTML = "";


        if (
            visiblePhotos.length === 0
        ) {

            empty.style.display =
                "block";

            return;
        }


        empty.style.display =
            "none";


        visiblePhotos.forEach(
            function (photo) {

                const card =
                    createPhotoCard(
                        photo
                    );

                grid.appendChild(
                    card
                );
            }
        );
    }


    // ============================================================
    // 创建照片卡
    // ============================================================

    function createPhotoCard(
        photo
    ) {

        const card =
            document.createElement(
                "div"
            );

        card.className =
            "photo-album-card";


        const thumbWrap =
            document.createElement(
                "div"
            );

        thumbWrap.className =
            "photo-album-thumb-wrap";


        const image =
            document.createElement(
                "img"
            );

        image.className =
            "photo-album-thumb";

        image.src =
            photo.image;

        image.alt =
            photo.ownerName ||
            "照片";


        image.addEventListener(
            "click",
            function () {

                openViewer(
                    photo.image
                );

            }
        );


        thumbWrap.appendChild(
            image
        );


        const meta =
            document.createElement(
                "div"
            );

        meta.className =
            "photo-album-meta";


        const owner =
            document.createElement(
                "div"
            );

        owner.className =
            "photo-album-owner";

        owner.textContent =
            photo.ownerName ||
            "未知人物";


        const sub =
            document.createElement(
                "div"
            );

        sub.className =
            "photo-album-sub";

        sub.textContent =
            getSourceLabel(
                photo.source
            ) +
            " · " +
            formatTime(
                photo.createdAt
            );


        meta.appendChild(
            owner
        );

        meta.appendChild(
            sub
        );


        const deleteBtn =
            document.createElement(
                "button"
            );

        deleteBtn.className =
            "photo-album-delete";

        deleteBtn.type =
            "button";

        deleteBtn.title =
            "删除照片";

        deleteBtn.textContent =
            "×";


        deleteBtn.addEventListener(
            "click",
            async function (
                event
            ) {

                event.stopPropagation();


                const confirmed =
                    confirm(
                        "确定删除这张照片吗？"
                    );


                if (!confirmed) {
                    return;
                }


                await window.PhotoAlbum.delete(
                    photo.id
                );


                await renderAlbum();

            }
        );


        card.appendChild(
            thumbWrap
        );

        card.appendChild(
            meta
        );

        card.appendChild(
            deleteBtn
        );


        return card;
    }

// ============================================================
// 加入高级功能 → 实用工具
// ============================================================

function createAdvancedEntry() {

    // 防止重复创建
    if (
        document.getElementById(
            "photo-album-advanced-entry"
        )
    ) {
        return;
    }


    // 精确寻找“高级功能 → 实用工具”的网格
    const container =
        document.querySelector(
            "#advanced-modal .settings-item-list"
        );


    if (!container) {

        console.warn(
            "[PhotoAlbumUI] 未找到高级功能实用工具区域"
        );

        return;
    }


    // 创建照片集入口
    const entry =
        document.createElement("div");


    entry.id =
        "photo-album-advanced-entry";


    // 使用网站现有功能卡片的 class
    entry.className =
        "settings-item";


    entry.innerHTML = `
        <i class="fas fa-images"></i>
        <span>照片集</span>
    `;


    // 点击照片集
    entry.addEventListener(
        "click",
        function () {

            const advancedModal =
                document.getElementById(
                    "advanced-modal"
                );


            // 关闭高级功能
            if (
                advancedModal &&
                typeof window.hideModal === "function"
            ) {

                window.hideModal(
                    advancedModal
                );

            } else if (
                advancedModal
            ) {

                advancedModal.style.display =
                    "none";

            }


            // 打开照片集
            openAlbum();

        }
    );


    // 找到“信封投递”
    const envelope =
        document.getElementById(
            "envelope-function"
        );


    // 优先插到信封投递后面
    if (
        envelope &&
        envelope.parentElement === container
    ) {

        envelope.insertAdjacentElement(
            "afterend",
            entry
        );

    } else {

        // 找不到信封时直接放在最后
        container.appendChild(
            entry
        );

    }


    console.log(
        "[PhotoAlbumUI] 照片集入口已加入高级功能"
    );

}


    // ============================================================
    // 初始化
    // ============================================================

    function initialize() {

        loadCSS();

        createUI();

        createAdvancedEntry();


        console.log(
            "[PhotoAlbumUI] 照片集界面已加载"
        );
    }


    if (
        document.readyState ===
        "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            initialize
        );

    } else {

        initialize();

    }


    // ============================================================
    // 对外接口
    // ============================================================

    window.PhotoAlbumUI = {

        open:
            openAlbum,

        close:
            closeAlbum,

        render:
            renderAlbum

    };

})();
