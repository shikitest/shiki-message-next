#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function assert(value, message) {
    if (!value) throw new Error(message);
}

function makeStorage(sharedMap, failWrites) {
    return {
        async setItem(key, value) {
            if (failWrites) throw new Error("quota");
            sharedMap.set(key, value);
            return value;
        },
        async getItem(key) {
            return sharedMap.has(key) ? sharedMap.get(key) : null;
        },
        async removeItem(key) {
            sharedMap.delete(key);
        }
    };
}

function loadStore(sharedMap, options) {
    options = options || {};
    const window = {
        localforage: makeStorage(sharedMap, options.failWrites),
        APP_PREFIX: "TEST_",
        crypto: { randomUUID: () => "test-id" },
        URL: options.URL || URL
    };
    const context = {
        window,
        APP_PREFIX: "TEST_",
        console,
        Blob,
        Date,
        Math,
        Set,
        Object,
        String,
        Number,
        Error
    };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(
        __dirname,
        "..",
        "js",
        "local-music-store.js"
    ), "utf8"), context);
    return window.LocalMusicStore;
}

function fakeFile(name, type, bytes) {
    const blob = new Blob([bytes], { type: type || "" });
    return {
        name,
        type: type || "",
        size: blob.size,
        slice(start, end, mimeType) {
            return blob.slice(start, end, mimeType);
        }
    };
}

async function expectCode(action, code) {
    let error = null;
    try { await action(); } catch (caught) { error = caught; }
    assert(error && error.code === code, "expected " + code);
}

async function main() {
    const sharedMap = new Map();
    const store = loadStore(sharedMap);
    const entry = await store.importFile(
        fakeFile("mobile-song.m4a", "", new Uint8Array([1, 2, 3, 4]))
    );

    assert(entry.sourceType === "local", "local source type missing");
    assert(entry.name === "mobile-song", "file extension was not removed");
    assert(entry.mimeType === "audio/mp4", "blank iOS MIME fallback failed");
    assert(!Object.prototype.hasOwnProperty.call(entry, "audioBlob"),
        "playlist metadata must not contain the audio blob");

    const record = await store.get(entry.id);
    assert(record && record.audioBlob instanceof Blob,
        "audio blob was not persisted separately");
    assert(record.id === entry.id && record.name === entry.name &&
        record.artist === "" && record.sourceType === "local" &&
        record.mimeType === "audio/mp4" && record.size === 4 &&
        record.createdAt,
    "local music record schema is incomplete");

    const reloadedStore = loadStore(sharedMap);
    const afterRefresh = await reloadedStore.get(entry.id);
    assert(afterRefresh && afterRefresh.audioBlob.size === 4,
        "audio blob did not survive simulated refresh");

    const updated = await reloadedStore.updateMetadata(entry.id, {
        name: "Renamed",
        artist: "Artist"
    });
    assert(updated.name === "Renamed" && updated.artist === "Artist",
        "local metadata update failed");
    assert((await reloadedStore.get(entry.id)).audioBlob.size === 4,
        "metadata update changed the blob");

    const legacyRemote = store.normalizeSong({
        title: "Legacy",
        sub: "Singer",
        url: "https://example.test/song.mp3"
    });
    assert(legacyRemote.sourceType === "remote" &&
        legacyRemote.url.includes("song.mp3") &&
        legacyRemote.name === "Legacy" &&
        legacyRemote.artist === "Singer",
    "legacy remote playlist compatibility failed");

    let createCount = 0;
    let revokeCount = 0;
    const liveUrls = new Set();
    const lease = store.createObjectUrlLease({
        createObjectURL() {
            const url = "blob:test-" + (++createCount);
            liveUrls.add(url);
            return url;
        },
        revokeObjectURL(url) {
            revokeCount++;
            liveUrls.delete(url);
        }
    });
    for (let i = 0; i < 100; i++) lease.replace(new Blob([String(i)]));
    lease.clear();
    assert(createCount === 100 && revokeCount === 100 && liveUrls.size === 0,
        "object URL lease leaked during repeated track changes");

    await reloadedStore.remove(entry.id);
    assert(await reloadedStore.get(entry.id) === null,
        "deleting a local song left its blob in storage");

    const tooLarge = fakeFile("huge.mp3", "audio/mpeg", new Uint8Array([1]));
    tooLarge.size = store.maxFileSize + 1;
    await expectCode(() => store.importFile(tooLarge),
        "LOCAL_MUSIC_TOO_LARGE");
    await expectCode(() => store.importFile(
        fakeFile("not-audio.txt", "text/plain", new Uint8Array([1]))
    ), "LOCAL_MUSIC_INVALID_TYPE");
    const failingStore = loadStore(new Map(), { failWrites: true });
    await expectCode(() => failingStore.importFile(
        fakeFile("song.mp3", "audio/mpeg", new Uint8Array([1]))
    ), "LOCAL_MUSIC_STORAGE_FAILED");

    const root = path.join(__dirname, "..");
    const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
    const backup = fs.readFileSync(path.join(
        root, "js", "backup-engine.js"
    ), "utf8");
    const listeners = fs.readFileSync(path.join(root, "js", "listeners.js"),
        "utf8");
    const localMusicInput = html.match(
        /<input[^>]*id="local-music-input"[^>]*>/
    );
    assert(localMusicInput, "mobile audio file input is missing");
    assert(!/\saccept=/.test(localMusicInput[0]),
        "mobile audio input must let JavaScript validate files on iOS");
    assert(/\bmultiple\b/.test(localMusicInput[0]),
        "mobile audio file input must allow multiple files");
    assert(backup.includes("localMusicMedia:"),
        "local music blobs are not excluded from ordinary backups");
    const backupWindow = {};
    const backupContext = {
        window: backupWindow,
        console,
        Map,
        Date,
        JSON,
        Object,
        Array,
        String,
        RegExp,
        Uint8Array,
        TextEncoder,
        TextDecoder,
        Blob,
        URL
    };
    vm.createContext(backupContext);
    vm.runInContext(backup, backupContext);
    assert(backupWindow.ChatBackup.shouldSkipKeyGroupChat(
        "TEST_localMusicMedia:local_test-id",
        {}
    ) === true, "backup engine did not skip the local music media key");
    assert(listeners.includes("localMusicStore.get(song.id)"),
        "local playback does not read the blob from IndexedDB");
    assert(listeners.includes("localMusicStore.remove(song.id)"),
        "local delete does not remove the blob");
    assert(/const latestSystemSongs = \[\];/.test(listeners),
        "built-in music playlist is not empty");
    assert(!listeners.includes("files.catbox.moe/hzpr94.mp3"),
        "built-in music data is still bundled");
    assert(listeners.includes("songsBeforeBuiltInCleanup"),
        "saved playlists do not remove legacy built-in songs");

    console.log(JSON.stringify({
        passed: true,
        checks: {
            desktopMp3Compatible: true,
            mobileM4aBlankMimeCompatible: true,
            refreshPersistence: true,
            localMetadataUpdate: true,
            deleteRemovesBlob: true,
            remoteLegacyCompatible: true,
            builtInSongsRemoved: true,
            objectUrlCreates: createCount,
            objectUrlRevokes: revokeCount,
            objectUrlLeaks: liveUrls.size,
            backupIsolation: true,
            storageFailureReported: true,
            oversizedFileRejectedAtMb: store.maxFileSize / 1024 / 1024
        }
    }, null, 2));
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
