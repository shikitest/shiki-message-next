/*
 * ============================================================
 * Shiki Message - Photo Album Core
 * 照片集核心系统
 * ============================================================
 *
 * 负责：
 *
 * 1. 保存照片
 * 2. 删除照片
 * 3. 读取照片
 * 4. 按人物筛选
 * 5. 保存照片来源
 * 6. 每日 10% 自动生成照片
 * 7. 单聊 / 群聊人物归属
 * 8. 用户上传照片
 *
 * 暂时不负责：
 *
 * - 高级功能 UI
 * - 聊天中的 1% 图片回复
 *
 * ============================================================
 */

(function () {

    "use strict";


    // ============================================================
    // 配置
    // ============================================================

    const STORAGE_KEY = "shiki_photo_album_v1";

    const DAILY_CHECK_KEY =
        "shiki_photo_album_daily_checks_v1";

    const DAILY_RANDOM_CHANCE = 0.10;

    const MAX_PHOTOS = 500;


    // ============================================================
    // 工具：安全获取 localforage
    // ============================================================

    function getStorage() {

        if (
            typeof window.localforage !== "undefined"
        ) {

            return window.localforage;

        }

        console.error(
            "[PhotoAlbum] localforage 不存在"
        );

        return null;

    }


    // ============================================================
    // 工具：获取今天日期 YYYY-MM-DD
    // ============================================================

    function getTodayKey() {

        const now = new Date();

        const year =
            now.getFullYear();

        const month =
            String(
                now.getMonth() + 1
            ).padStart(2, "0");

        const day =
            String(
                now.getDate()
            ).padStart(2, "0");

        return (
            year +
            "-" +
            month +
            "-" +
            day
        );

    }


    // ============================================================
    // 工具：生成 ID
    // ============================================================

    function createId(prefix) {

        if (
            window.RandomImageEngine &&
            typeof window.RandomImageEngine.createId ===
            "function"
        ) {

            return window.RandomImageEngine.createId(
                prefix
            );

        }


        return (
            (prefix || "photo") +
            "_" +
            Date.now() +
            "_" +
            Math.random()
                .toString(36)
                .slice(2, 10)
        );

    }


    // ============================================================
    // 读取全部照片
    // ============================================================

    async function getAllPhotos() {

        const storage =
            getStorage();

        if (!storage) {
            return [];
        }


        try {

            const photos =
                await storage.getItem(
                    STORAGE_KEY
                );

            if (
                Array.isArray(photos)
            ) {

                return photos;

            }

            return [];

        } catch (error) {

            console.error(
                "[PhotoAlbum] 读取照片失败：",
                error
            );

            return [];

        }

    }


    // ============================================================
    // 保存全部照片
    // ============================================================

    async function saveAllPhotos(
        photos
    ) {

        const storage =
            getStorage();

        if (!storage) {
            return false;
        }


        try {

            await storage.setItem(
                STORAGE_KEY,
                photos
            );

            return true;

        } catch (error) {

            console.error(
                "[PhotoAlbum] 保存照片失败：",
                error
            );

            return false;

        }

    }


    // ============================================================
    // 添加照片
    // ============================================================

    async function addPhoto(
        photoData
    ) {

        if (!photoData) {
            return null;
        }


        if (
            !photoData.image ||
            typeof photoData.image !== "string"
        ) {

            console.warn(
                "[PhotoAlbum] 缺少图片数据"
            );

            return null;

        }


        const photos =
            await getAllPhotos();


        const photo = {

            id:
                photoData.id ||
                createId("photo"),

            image:
                photoData.image,

            ownerType:
                photoData.ownerType ||
                "unknown",

            ownerId:
                photoData.ownerId ||
                "unknown",

            ownerName:
                photoData.ownerName ||
                "未知人物",

            source:
                photoData.source ||
                "unknown",

            createdAt:
                photoData.createdAt ||
                Date.now(),

            conversationId:
                photoData.conversationId ||
                null,

            groupId:
                photoData.groupId ||
                null,

            width:
                photoData.width ||
                null,

            height:
                photoData.height ||
                null,

            note:
                photoData.note ||
                ""

        };


        /*
         * 最新照片放最前面
         */
        photos.unshift(
            photo
        );

// ============================================================
// 照片容量保护
// ============================================================
// 最多保留 MAX_PHOTOS 张照片。
// 超出数量时，优先删除最旧的随机生成照片，
// 尽量保留用户自己上传的照片。
// ============================================================

if (
    photos.length >
    MAX_PHOTOS
) {

    while (
        photos.length >
        MAX_PHOTOS
    ) {

        let removableIndex = -1;


        // 从最后开始寻找最旧的“非用户上传”照片
        for (
            let i = photos.length - 1;
            i >= 0;
            i--
        ) {

            if (
                photos[i] &&
                photos[i].source !==
                "user-upload"
            ) {

                removableIndex = i;

                break;

            }

        }


        // 如果 500 多张全部都是用户上传，
        // 才删除最旧的一张
        if (
            removableIndex === -1
        ) {

            removableIndex =
                photos.length - 1;

        }


        photos.splice(
            removableIndex,
            1
        );

    }

}

        const success =
            await saveAllPhotos(
                photos
            );


        if (!success) {

            return null;

        }


        window.dispatchEvent(
            new CustomEvent(
                "photo-album-updated",
                {
                    detail: {
                        type: "add",
                        photo: photo
                    }
                }
            )
        );


        return photo;

    }


    // ============================================================
    // 删除照片
    // ============================================================

    async function deletePhoto(
        photoId
    ) {

        if (!photoId) {
            return false;
        }


        const photos =
            await getAllPhotos();


        const newPhotos =
            photos.filter(
                function (photo) {

                    return (
                        photo.id !==
                        photoId
                    );

                }
            );


        if (
            newPhotos.length ===
            photos.length
        ) {

            return false;

        }


        const success =
            await saveAllPhotos(
                newPhotos
            );


        if (success) {

            window.dispatchEvent(
                new CustomEvent(
                    "photo-album-updated",
                    {
                        detail: {
                            type: "delete",
                            photoId: photoId
                        }
                    }
                )
            );

        }


        return success;

    }


    // ============================================================
    // 清空照片集
    // ============================================================

    async function clearAllPhotos() {

        const success =
            await saveAllPhotos(
                []
            );


        if (success) {

            window.dispatchEvent(
                new CustomEvent(
                    "photo-album-updated",
                    {
                        detail: {
                            type: "clear"
                        }
                    }
                )
            );

        }


        return success;

    }


    // ============================================================
    // 按人物查找照片
    // ============================================================

    async function getPhotosByOwner(
        ownerId
    ) {

        const photos =
            await getAllPhotos();


        return photos.filter(
            function (photo) {

                return (
                    photo.ownerId ===
                    ownerId
                );

            }
        );

    }


    // ============================================================
    // 按来源查找
    // ============================================================

    async function getPhotosBySource(
        source
    ) {

        const photos =
            await getAllPhotos();


        return photos.filter(
            function (photo) {

                return (
                    photo.source ===
                    source
                );

            }
        );

    }


    // ============================================================
    // 用户上传图片
    // ============================================================

    async function addUserPhoto(
        file,
        options
    ) {

        options =
            options ||
            {};


        if (
            !window.RandomImageEngine ||
            typeof window.RandomImageEngine.optimizeFile !==
            "function"
        ) {

            throw new Error(
                "RandomImageEngine 未加载"
            );

        }


        const optimized =
            await window.RandomImageEngine.optimizeFile(
                file,
                {
                    maxWidth:
                        options.maxWidth ||
                        1280,

                    maxHeight:
                        options.maxHeight ||
                        1280,

                    quality:
                        options.quality ||
                        0.78
                }
            );


        return addPhoto(
            {

                image:
                    optimized.dataURL,

                ownerType:
                    "user",

                ownerId:
                    options.ownerId ||
                    "user",

                ownerName:
                    options.ownerName ||
                    "我",

                source:
                    "user-upload",

                createdAt:
                    Date.now(),

                conversationId:
                    options.conversationId ||
                    null,

                width:
                    optimized.width,

                height:
                    optimized.height

            }
        );

    }


    // ============================================================
    // 生成某人物的随机照片
    // ============================================================

    async function generateRandomPhotoForOwner(
        owner
    ) {

        if (
            !window.RandomImageEngine ||
            typeof window.RandomImageEngine.generateDataURL !==
            "function"
        ) {

            console.error(
                "[PhotoAlbum] RandomImageEngine 未加载"
            );

            return null;

        }


        if (!owner) {

            console.warn(
                "[PhotoAlbum] 缺少人物信息"
            );

            return null;

        }


        const image =
            window.RandomImageEngine
                .generateDataURL(
                    {
                        width: 854,
                        height: 480,
                        quality: 0.62
                    }
                );


        if (!image) {

            return null;

        }


        return addPhoto(
            {

                image:
                    image,

                ownerType:
                    owner.ownerType ||
                    "partner",

                ownerId:
                    owner.ownerId ||
                    "partner",

                ownerName:
                    owner.ownerName ||
                    "对方",

                source:
                    owner.source ||
                    "random",

                createdAt:
                    Date.now(),

                conversationId:
                    owner.conversationId ||
                    null,

                groupId:
                    owner.groupId ||
                    null,

                width:
                    854,

                height:
                    480

            }
        );

    }


    // ============================================================
    // 每日检查记录
    // ============================================================

    async function getDailyChecks() {

        const storage =
            getStorage();

        if (!storage) {
            return {};
        }


        try {

            const data =
                await storage.getItem(
                    DAILY_CHECK_KEY
                );


            if (
                data &&
                typeof data === "object"
            ) {

                return data;

            }

            return {};

        } catch (error) {

            console.error(
                "[PhotoAlbum] 读取每日检查记录失败：",
                error
            );

            return {};

        }

    }


    // ============================================================
    // 保存每日检查记录
    // ============================================================

    async function saveDailyChecks(
        checks
    ) {

        const storage =
            getStorage();

        if (!storage) {
            return false;
        }


        try {

            await storage.setItem(
                DAILY_CHECK_KEY,
                checks
            );

            return true;

        } catch (error) {

            console.error(
                "[PhotoAlbum] 保存每日检查记录失败：",
                error
            );

            return false;

        }

    }


    // ============================================================
    // 获取某人物每日检查 Key
    // ============================================================

    function getDailyOwnerKey(
        owner
    ) {

        const today =
            getTodayKey();


        const ownerType =
            owner.ownerType ||
            "partner";


        const ownerId =
            owner.ownerId ||
            "partner";


        return (
            today +
            "::" +
            ownerType +
            "::" +
            ownerId
        );

    }


    // ============================================================
    // 每日 10% 判定
    // ============================================================

    async function runDailyPhotoCheck(
        owner,
        options
    ) {

        options =
            options ||
            {};


        if (!owner) {

            return {
                checked: false,
                triggered: false,
                reason: "missing-owner"
            };

        }


        const checks =
            await getDailyChecks();


        const key =
            getDailyOwnerKey(
                owner
            );


        /*
         * 今天已经检查过，
         * 不允许再次抽取。
         */
        if (
            checks[key]
        ) {

            return {
                checked: true,
                triggered:
                    !!checks[key].triggered,

                alreadyChecked:
                    true,

                photoId:
                    checks[key].photoId ||
                    null
            };

        }


        const chance =
            typeof options.chance ===
            "number"
                ?
                Math.max(
                    0,
                    Math.min(
                        1,
                        options.chance
                    )
                )
                :
                DAILY_RANDOM_CHANCE;


        const roll =
            Math.random();


        const triggered =
            roll < chance;


        let photo =
            null;


        if (triggered) {

            photo =
                await generateRandomPhotoForOwner(
                    {

                        ownerType:
                            owner.ownerType,

                        ownerId:
                            owner.ownerId,

                        ownerName:
                            owner.ownerName,

                        conversationId:
                            owner.conversationId,

                        groupId:
                            owner.groupId,

                        source:
                            "daily-random"

                    }
                );

        }


        /*
         * 无论有没有触发，
         * 今天都记录为“已经检查过”。
         */
        checks[key] = {

            checkedAt:
                Date.now(),

            triggered:
                triggered,

            roll:
                roll,

            chance:
                chance,

            photoId:
                photo
                    ?
                    photo.id
                    :
                    null

        };


        await saveDailyChecks(
            checks
        );


        return {

            checked: true,

            triggered:
                triggered,

            alreadyChecked:
                false,

            roll:
                roll,

            photo:
                photo

        };

    }


    // ============================================================
    // 强制生成每日照片
    // ============================================================
    // 仅测试时使用
    // 不走随机概率
    // ============================================================

    async function forceDailyPhoto(
        owner
    ) {

        return generateRandomPhotoForOwner(
            {

                ownerType:
                    owner.ownerType,

                ownerId:
                    owner.ownerId,

                ownerName:
                    owner.ownerName,

                conversationId:
                    owner.conversationId,

                groupId:
                    owner.groupId,

                source:
                    "daily-random-test"

            }
        );

    }


    // ============================================================
    // 删除某人物今天的每日检查记录
    // ============================================================
    // 调试用
    // ============================================================

    async function resetDailyCheck(
        owner
    ) {

        const checks =
            await getDailyChecks();


        const key =
            getDailyOwnerKey(
                owner
            );


        if (
            checks[key]
        ) {

            delete checks[key];

            await saveDailyChecks(
                checks
            );

        }


        return true;

    }


    // ============================================================
    // 获取照片统计
    // ============================================================

    async function getStats() {

        const photos =
            await getAllPhotos();


        const owners = {};

        const sources = {};


        photos.forEach(
            function (photo) {

                if (
                    !owners[
                        photo.ownerId
                    ]
                ) {

                    owners[
                        photo.ownerId
                    ] = {

                        ownerId:
                            photo.ownerId,

                        ownerName:
                            photo.ownerName,

                        count:
                            0
                    };

                }


                owners[
                    photo.ownerId
                ].count++;


                if (
                    !sources[
                        photo.source
                    ]
                ) {

                    sources[
                        photo.source
                    ] = 0;

                }


                sources[
                    photo.source
                ]++;

            }
        );


        return {

            total:
                photos.length,

            owners:
                Object.values(
                    owners
                ),

            sources:
                sources

        };

    }


    // ============================================================
    // 对外接口
    // ============================================================

    window.PhotoAlbum = {

        STORAGE_KEY:
            STORAGE_KEY,

        DAILY_CHECK_KEY:
            DAILY_CHECK_KEY,

        DAILY_RANDOM_CHANCE:
            DAILY_RANDOM_CHANCE,

        MAX_PHOTOS:
            MAX_PHOTOS,


        getAll:
            getAllPhotos,

        add:
            addPhoto,

        delete:
            deletePhoto,

        clear:
            clearAllPhotos,


        getByOwner:
            getPhotosByOwner,

        getBySource:
            getPhotosBySource,


        addUserPhoto:
            addUserPhoto,


        generateRandomPhotoForOwner:
            generateRandomPhotoForOwner,


        runDailyPhotoCheck:
            runDailyPhotoCheck,

        forceDailyPhoto:
            forceDailyPhoto,

        resetDailyCheck:
            resetDailyCheck,


        getStats:
            getStats,


        getTodayKey:
            getTodayKey

    };


    console.log(
        "[PhotoAlbum] 照片集核心系统已加载"
    );


})();
