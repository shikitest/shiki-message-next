(function (global) {
    "use strict";

    const VERSION = "1.0.0";
    const MEDIA_KEY_PART = "localMusicMedia:";
    const MAX_FILE_SIZE = 200 * 1024 * 1024;
    const AUDIO_EXTENSIONS = new Set([
        "mp3", "m4a", "wav", "ogg", "oga", "aac", "flac", "webm"
    ]);
    const MIME_BY_EXTENSION = {
        mp3: "audio/mpeg",
        m4a: "audio/mp4",
        wav: "audio/wav",
        ogg: "audio/ogg",
        oga: "audio/ogg",
        aac: "audio/aac",
        flac: "audio/flac",
        webm: "audio/webm"
    };

    function storage() {
        if (
            !global.localforage ||
            typeof global.localforage.setItem !== "function"
        ) {
            throw new Error("IndexedDB 音乐存储不可用");
        }
        return global.localforage;
    }

    function appPrefix() {
        if (typeof APP_PREFIX !== "undefined") return APP_PREFIX;
        return global.APP_PREFIX || "SHIKI_NEXT_";
    }

    function storageKey(id) {
        return appPrefix() + MEDIA_KEY_PART + String(id || "");
    }

    function extensionOf(name) {
        const match = /\.([^.]+)$/.exec(String(name || ""));
        return match ? match[1].toLowerCase() : "";
    }

    function stripExtension(name) {
        return String(name || "")
            .replace(/\.(mp3|m4a|wav|ogg|oga|aac|flac|webm)$/i, "")
            .trim() || "本地音乐";
    }

    function mimeTypeFor(file) {
        const declared = String(file && file.type || "").trim();
        if (declared) return declared;
        return MIME_BY_EXTENSION[extensionOf(file && file.name)] ||
            "application/octet-stream";
    }

    function isAudioFile(file) {
        if (!file || typeof file.slice !== "function") return false;
        const declared = String(file.type || "").toLowerCase();
        return declared.startsWith("audio/") ||
            AUDIO_EXTENSIONS.has(extensionOf(file.name));
    }

    function createId() {
        if (
            global.crypto &&
            typeof global.crypto.randomUUID === "function"
        ) return "local_" + global.crypto.randomUUID();
        const random = Math.random().toString(36).slice(2);
        return "local_" + Date.now().toString(36) + "_" + random;
    }

    function playlistEntry(record) {
        return {
            id: record.id,
            name: record.name,
            artist: record.artist || "",
            title: record.name,
            sub: record.artist || "本地音乐",
            sourceType: "local",
            mimeType: record.mimeType,
            size: record.size,
            createdAt: record.createdAt,
            isCustom: true
        };
    }

    async function importFile(file, metadata) {
        if (!isAudioFile(file)) {
            const typeError = new Error("请选择 MP3、M4A、WAV、OGG 等音频文件");
            typeError.code = "LOCAL_MUSIC_INVALID_TYPE";
            throw typeError;
        }
        if (Number(file.size) > MAX_FILE_SIZE) {
            const sizeError = new Error("单个音频文件不能超过 200MB");
            sizeError.code = "LOCAL_MUSIC_TOO_LARGE";
            throw sizeError;
        }

        metadata = metadata || {};
        const mimeType = mimeTypeFor(file);
        const audioBlob = file.slice(0, file.size, mimeType);
        const record = {
            id: metadata.id || createId(),
            name: String(metadata.name || stripExtension(file.name)),
            artist: String(metadata.artist || ""),
            sourceType: "local",
            mimeType,
            size: Number(file.size) || audioBlob.size,
            audioBlob,
            createdAt: metadata.createdAt || new Date().toISOString()
        };

        const key = storageKey(record.id);
        try {
            await storage().setItem(key, record);
            const saved = await storage().getItem(key);
            if (
                !saved ||
                saved.id !== record.id ||
                !saved.audioBlob ||
                typeof saved.audioBlob.size !== "number"
            ) {
                throw new Error("浏览器没有完整保存音频数据");
            }
        } catch (error) {
            try { await storage().removeItem(key); } catch (cleanupError) {}
            const storageError = new Error(
                "本地音乐保存失败，可能是浏览器存储空间不足"
            );
            storageError.code = "LOCAL_MUSIC_STORAGE_FAILED";
            storageError.cause = error;
            throw storageError;
        }
        return playlistEntry(record);
    }

    async function get(id) {
        if (!id) return null;
        return storage().getItem(storageKey(id));
    }

    async function remove(id) {
        if (!id) return;
        await storage().removeItem(storageKey(id));
    }

    async function restore(record) {
        if (!record || !record.id || !record.audioBlob) {
            throw new Error("无法恢复本地音频数据");
        }
        await storage().setItem(storageKey(record.id), record);
    }

    async function updateMetadata(id, updates) {
        const record = await get(id);
        if (!record || !record.audioBlob) {
            throw new Error("本地音频数据不存在");
        }
        updates = updates || {};
        record.name = String(updates.name || record.name);
        record.artist = String(
            updates.artist === undefined ? record.artist || "" : updates.artist
        );
        await storage().setItem(storageKey(id), record);
        return playlistEntry(record);
    }

    function normalizeSong(song) {
        song = song && typeof song === "object" ? song : {};
        const sourceType = song.sourceType === "local" ? "local" : "remote";
        const name = String(song.name || song.title || "未命名歌曲");
        const artist = String(
            song.artist !== undefined ? song.artist : song.sub || ""
        );
        if (sourceType === "local") {
            return {
                id: song.id || "",
                name,
                artist,
                title: name,
                sub: artist || "本地音乐",
                sourceType: "local",
                mimeType: song.mimeType || "audio/*",
                size: Number(song.size) || 0,
                createdAt: song.createdAt || null,
                isCustom: true
            };
        }
        return Object.assign({}, song, {
            id: song.id || null,
            name,
            artist,
            title: name,
            sub: artist || song.sub || "未知艺术家",
            sourceType: "remote",
            url: String(song.url || "")
        });
    }

    function createObjectUrlLease(urlApi) {
        urlApi = urlApi || global.URL;
        let current = null;
        return Object.freeze({
            replace(blob) {
                if (current) urlApi.revokeObjectURL(current);
                current = urlApi.createObjectURL(blob);
                return current;
            },
            clear() {
                if (!current) return;
                urlApi.revokeObjectURL(current);
                current = null;
            },
            get current() { return current; }
        });
    }

    global.LocalMusicStore = Object.freeze({
        version: VERSION,
        mediaKeyPart: MEDIA_KEY_PART,
        maxFileSize: MAX_FILE_SIZE,
        storageKey,
        stripExtension,
        isAudioFile,
        importFile,
        get,
        remove,
        restore,
        updateMetadata,
        normalizeSong,
        createObjectUrlLease
    });
})(window);
