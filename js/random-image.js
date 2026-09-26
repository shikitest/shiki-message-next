/*
 * ============================================================
 * Shiki Message - Random Image Engine
 * 随机图片生成底层
 * ============================================================
 *
 * 这个文件只负责：
 *
 * 1. 生成随机 RGB 图片
 * 2. 输出 Canvas
 * 3. 输出 JPEG Data URL
 * 4. 压缩用户上传的照片
 *
 * 它不负责：
 *
 * - 聊天回复概率
 * - 照片集
 * - 每日事件
 * - 群聊
 * - UI
 *
 * 这些功能由 photo-album.js 统一管理。
 * ============================================================
 */

(function () {

    "use strict";


    // ============================================================
    // 随机图片默认尺寸
    // ============================================================

    const DEFAULT_WIDTH = 854;
    const DEFAULT_HEIGHT = 480;

    /*
     * JPEG 质量
     *
     * 完全随机噪点对 PNG 极其不友好，
     * PNG 文件会非常大。
     *
     * JPEG 可以显著减少 IndexedDB / localforage 的压力。
     */
    const DEFAULT_JPEG_QUALITY = 0.62;


    // ============================================================
    // 安全限制
    // ============================================================

    const MAX_WIDTH = 1920;
    const MAX_HEIGHT = 1080;


    // ============================================================
    // 工具：限制数值
    // ============================================================

    function clampNumber(value, min, max, fallback) {

        const number = Number(value);

        if (!Number.isFinite(number)) {
            return fallback;
        }

        return Math.max(
            min,
            Math.min(max, Math.round(number))
        );

    }


    // ============================================================
    // 生成随机字节
    // ============================================================

    function fillRandomBytes(array) {

        /*
         * 优先使用 crypto.getRandomValues。
         *
         * 每次最多处理 65536 bytes，
         * 因此分块填充。
         */

        if (
            window.crypto &&
            typeof window.crypto.getRandomValues === "function"
        ) {

            const MAX_CHUNK = 65536;

            for (
                let start = 0;
                start < array.length;
                start += MAX_CHUNK
            ) {

                const end = Math.min(
                    start + MAX_CHUNK,
                    array.length
                );

                window.crypto.getRandomValues(
                    array.subarray(start, end)
                );

            }

            return;
        }


        /*
         * 极老浏览器兼容方案。
         */
        for (let i = 0; i < array.length; i++) {

            array[i] =
                Math.floor(Math.random() * 256);

        }

    }


    // ============================================================
    // 生成随机 Canvas
    // ============================================================

    function generateCanvas(options) {

        options = options || {};


        const width = clampNumber(
            options.width,
            1,
            MAX_WIDTH,
            DEFAULT_WIDTH
        );


        const height = clampNumber(
            options.height,
            1,
            MAX_HEIGHT,
            DEFAULT_HEIGHT
        );


        const canvas =
            document.createElement("canvas");


        canvas.width = width;
        canvas.height = height;


        const context =
            canvas.getContext(
                "2d",
                {
                    alpha: false
                }
            );


        if (!context) {

            console.error(
                "[RandomImage] Canvas 创建失败"
            );

            return null;

        }


        const imageData =
            context.createImageData(
                width,
                height
            );


        const data =
            imageData.data;


        /*
         * 先把所有字节随机化。
         */
        fillRandomBytes(data);


        /*
         * Canvas 每个像素：
         *
         * R G B A
         *
         * 随机化后 A 也会随机，
         * 所以重新将所有 Alpha 设为 255。
         */

        for (
            let i = 3;
            i < data.length;
            i += 4
        ) {

            data[i] = 255;

        }


        context.putImageData(
            imageData,
            0,
            0
        );


        return canvas;

    }


    // ============================================================
    // Canvas → JPEG
    // ============================================================

    function canvasToDataURL(
        canvas,
        quality
    ) {

        if (!canvas) {
            return null;
        }


        let jpegQuality =
            Number(quality);


        if (!Number.isFinite(jpegQuality)) {

            jpegQuality =
                DEFAULT_JPEG_QUALITY;

        }


        jpegQuality =
            Math.max(
                0.1,
                Math.min(1, jpegQuality)
            );


        try {

            return canvas.toDataURL(
                "image/jpeg",
                jpegQuality
            );

        } catch (error) {

            console.error(
                "[RandomImage] JPEG 转换失败：",
                error
            );

            return null;

        }

    }


    // ============================================================
    // 直接生成随机图片 Data URL
    // ============================================================

    function generateDataURL(options) {

        options = options || {};


        const canvas =
            generateCanvas(options);


        if (!canvas) {
            return null;
        }


        return canvasToDataURL(
            canvas,
            options.quality
        );

    }


    // ============================================================
    // File → Image
    // ============================================================

    function fileToImage(file) {

        return new Promise(
            function (resolve, reject) {

                if (!file) {

                    reject(
                        new Error(
                            "没有选择图片"
                        )
                    );

                    return;
                }


                if (
                    file.type &&
                    !file.type.startsWith("image/")
                ) {

                    reject(
                        new Error(
                            "请选择图片文件"
                        )
                    );

                    return;
                }


                const reader =
                    new FileReader();


                reader.onerror =
                    function () {

                        reject(
                            new Error(
                                "读取图片失败"
                            )
                        );

                    };


                reader.onload =
                    function () {

                        const image =
                            new Image();


                        image.onerror =
                            function () {

                                reject(
                                    new Error(
                                        "图片解析失败"
                                    )
                                );

                            };


                        image.onload =
                            function () {

                                resolve(image);

                            };


                        image.src =
                            reader.result;

                    };


                reader.readAsDataURL(
                    file
                );

            }
        );

    }


    // ============================================================
    // 压缩用户上传图片
    // ============================================================

    async function optimizeFile(
        file,
        options
    ) {

        options = options || {};


        const maxWidth =
            clampNumber(
                options.maxWidth,
                200,
                1920,
                1280
            );


        const maxHeight =
            clampNumber(
                options.maxHeight,
                200,
                1920,
                1280
            );


        let quality =
            Number(
                options.quality
            );


        if (
            !Number.isFinite(quality)
        ) {

            quality = 0.78;

        }


        quality =
            Math.max(
                0.2,
                Math.min(
                    0.95,
                    quality
                )
            );


        const image =
            await fileToImage(file);


        let width =
            image.naturalWidth ||
            image.width;


        let height =
            image.naturalHeight ||
            image.height;


        if (
            !width ||
            !height
        ) {

            throw new Error(
                "无法获取图片尺寸"
            );

        }


        /*
         * 等比例缩小。
         * 不会把小图片强制放大。
         */

        const scale =
            Math.min(
                1,
                maxWidth / width,
                maxHeight / height
            );


        width =
            Math.max(
                1,
                Math.round(
                    width * scale
                )
            );


        height =
            Math.max(
                1,
                Math.round(
                    height * scale
                )
            );


        const canvas =
            document.createElement(
                "canvas"
            );


        canvas.width =
            width;

        canvas.height =
            height;


        const context =
            canvas.getContext(
                "2d",
                {
                    alpha: false
                }
            );


        if (!context) {

            throw new Error(
                "Canvas 创建失败"
            );

        }


        /*
         * JPEG 不支持透明背景。
         * 先铺白色，避免透明 PNG 转 JPEG 后变黑。
         */

        context.fillStyle =
            "#ffffff";


        context.fillRect(
            0,
            0,
            width,
            height
        );


        context.drawImage(
            image,
            0,
            0,
            width,
            height
        );


        return {
            dataURL:
                canvas.toDataURL(
                    "image/jpeg",
                    quality
                ),

            width:
                width,

            height:
                height,

            originalName:
                file.name || "",

            originalType:
                file.type || "",

            originalSize:
                file.size || 0
        };

    }


    // ============================================================
    // 简单生成唯一 ID
    // ============================================================

    function createId(prefix) {

        prefix =
            prefix ||
            "img";


        let randomPart = "";


        if (
            window.crypto &&
            typeof window.crypto.randomUUID ===
            "function"
        ) {

            randomPart =
                window.crypto
                    .randomUUID()
                    .replace(/-/g, "");

        } else {

            randomPart =
                Math.random()
                    .toString(36)
                    .slice(2) +
                Math.random()
                    .toString(36)
                    .slice(2);

        }


        return (
            prefix +
            "_" +
            Date.now() +
            "_" +
            randomPart.slice(0, 12)
        );

    }


    // ============================================================
    // 对外接口
    // ============================================================

    window.RandomImageEngine = {

        width:
            DEFAULT_WIDTH,

        height:
            DEFAULT_HEIGHT,

        jpegQuality:
            DEFAULT_JPEG_QUALITY,


        generateCanvas:
            generateCanvas,


        generateDataURL:
            generateDataURL,


        canvasToDataURL:
            canvasToDataURL,


        optimizeFile:
            optimizeFile,


        createId:
            createId

    };


    /*
     * 临时兼容我们之前测试过的名字。
     *
     * 以后主系统统一使用 RandomImageEngine，
     * 但保留 RandomPixelImage，
     * 避免浏览器缓存旧代码时出现问题。
     */

    window.RandomPixelImage =
        window.RandomImageEngine;


    console.log(
        "[RandomImage] 随机图片底层已加载：" +
        DEFAULT_WIDTH +
        " × " +
        DEFAULT_HEIGHT
    );


})();
