(function () {
    "use strict";

    const SCHEMA_VERSION = 1;
    const STORAGE_SUFFIX = "imeCustomLexicon";
    const VALID_POS = new Set([
        "noun", "verb", "adjective", "adverb", "particle",
        "conjunction", "fragment", "other"
    ]);
    const WEIGHTS = Object.freeze({ low: 0.58, normal: 0.82, high: 0.98 });
    const listeners = new Set();
    let entries = [];
    let exactIndex = new Map();
    let prefixIndex = new Map();
    let readyResolve;

    const ready = new Promise(function (resolve) {
        readyResolve = resolve;
    });

    function storageKey() {
        return String(window.APP_PREFIX || "SHIKI_NEXT_") + STORAGE_SUFFIX;
    }

    function katakanaToHiragana(value) {
        return String(value || "").replace(/[ァ-ヶ]/g, function (character) {
            return String.fromCharCode(character.charCodeAt(0) - 0x60);
        });
    }

    function normalizeReading(value) {
        return katakanaToHiragana(value).trim().replace(/\s+/g, "");
    }

    function normalizePos(value) {
        const pos = String(value || "other").trim();
        return VALID_POS.has(pos) ? pos : "other";
    }

    function normalizeWeight(value) {
        if (typeof value === "number") {
            if (value >= 0.92) return "high";
            if (value < 0.7) return "low";
            return "normal";
        }
        const weight = String(value || "normal").toLowerCase();
        return Object.prototype.hasOwnProperty.call(WEIGHTS, weight) ?
            weight : "normal";
    }

    function validateEntry(input, options) {
        const config = options || {};
        if (!input || typeof input !== "object" || Array.isArray(input)) {
            return { valid: false, error: "词条必须是对象" };
        }
        const reading = normalizeReading(input.reading);
        const text = String(input.text || "").trim();
        if (!text) return { valid: false, error: "词语不能为空" };
        if (!reading) return { valid: false, error: "读音不能为空" };
        if (!/^[ぁ-ゖゝゞー]+$/.test(reading)) {
            return { valid: false, error: "读音只能使用平假名或片假名" };
        }
        const now = new Date().toISOString();
        const createdAt = typeof input.createdAt === "string" ? input.createdAt : now;
        const updatedAt = typeof input.updatedAt === "string" ? input.updatedAt : now;
        const normalized = {
            id: String(input.id || config.id || createId()),
            reading,
            text,
            pos: normalizePos(input.pos),
            weight: normalizeWeight(input.weight),
            enabled: input.enabled !== false,
            createdAt,
            updatedAt
        };
        return { valid: true, entry: normalized };
    }

    function createId() {
        return "ime-" + Date.now().toString(36) + "-" +
            Math.random().toString(36).slice(2, 9);
    }

    function duplicateIndex(entry, excludedId, list) {
        return (list || entries).findIndex(function (existing) {
            return existing.id !== excludedId &&
                existing.reading === entry.reading &&
                existing.text === entry.text &&
                existing.pos === entry.pos;
        });
    }

    function runtimeEntry(entry, derived) {
        const source = derived || entry;
        return Object.freeze(Object.assign({}, source, {
            id: entry.id,
            userEntryId: entry.id,
            reading: source.reading,
            text: source.text,
            pos: source.pos || entry.pos,
            weight: WEIGHTS[entry.weight] || WEIGHTS.normal,
            custom: true,
            customWeight: entry.weight
        }));
    }

    function rebuildIndex() {
        exactIndex = new Map();
        prefixIndex = new Map();
        const inflections = window.RandomIMEInflections || null;
        entries.filter(function (entry) { return entry.enabled; }).forEach(function (entry) {
            const base = runtimeEntry(entry);
            const runtimeEntries = [base];
            if (inflections && ["verb", "adjective"].includes(entry.pos)) {
                inflections.expandEntry(base).forEach(function (derived) {
                    runtimeEntries.push(runtimeEntry(entry, derived));
                });
            }
            runtimeEntries.forEach(function (item) {
                if (!exactIndex.has(item.reading)) exactIndex.set(item.reading, []);
                exactIndex.get(item.reading).push(item);
                for (let length = 0; length <= item.reading.length; length++) {
                    const prefix = item.reading.slice(0, length);
                    if (!prefixIndex.has(prefix)) prefixIndex.set(prefix, []);
                    prefixIndex.get(prefix).push(item);
                }
            });
        });
    }

    function snapshot() {
        return entries.map(function (entry) { return Object.assign({}, entry); });
    }

    function emit(type, detail) {
        const event = Object.assign({ type, entries: snapshot() }, detail || {});
        listeners.forEach(function (listener) {
            try { listener(event); } catch (error) { console.error(error); }
        });
        if (typeof window.CustomEvent === "function" && window.dispatchEvent) {
            window.dispatchEvent(new CustomEvent("random-ime-custom-lexicon-change", { detail: event }));
        }
    }

    async function persist() {
        if (!window.localforage || typeof window.localforage.setItem !== "function") {
            throw new Error("localForage 不可用");
        }
        await window.localforage.setItem(storageKey(), {
            version: SCHEMA_VERSION,
            entries: snapshot(),
            updatedAt: new Date().toISOString()
        });
    }

    async function load() {
        let stored = null;
        try {
            if (window.localforage && typeof window.localforage.getItem === "function") {
                stored = await window.localforage.getItem(storageKey());
            }
        } catch (error) {
            console.warn("[RandomIME] custom lexicon load failed:", error);
        }
        const rawEntries = Array.isArray(stored) ? stored :
            (stored && Array.isArray(stored.entries) ? stored.entries : []);
        const loaded = [];
        rawEntries.forEach(function (raw) {
            const result = validateEntry(raw);
            if (result.valid && duplicateIndex(result.entry, null, loaded) < 0) {
                loaded.push(result.entry);
            }
        });
        entries = loaded;
        rebuildIndex();
        emit("load", { count: entries.length });
        return snapshot();
    }

    async function add(input) {
        const result = validateEntry(input);
        if (!result.valid) return result;
        if (duplicateIndex(result.entry) >= 0) {
            return { valid: false, duplicate: true, error: "词条已存在" };
        }
        entries.push(result.entry);
        rebuildIndex();
        await persist();
        emit("add", { entry: Object.assign({}, result.entry) });
        return { valid: true, entry: Object.assign({}, result.entry) };
    }

    async function update(id, changes) {
        const index = entries.findIndex(function (entry) { return entry.id === id; });
        if (index < 0) return { valid: false, error: "词条不存在" };
        const result = validateEntry(Object.assign({}, entries[index], changes, {
            id,
            createdAt: entries[index].createdAt,
            updatedAt: new Date().toISOString()
        }));
        if (!result.valid) return result;
        if (duplicateIndex(result.entry, id) >= 0) {
            return { valid: false, duplicate: true, error: "词条已存在" };
        }
        entries[index] = result.entry;
        rebuildIndex();
        await persist();
        emit("update", { entry: Object.assign({}, result.entry) });
        return { valid: true, entry: Object.assign({}, result.entry) };
    }

    async function remove(id) {
        const index = entries.findIndex(function (entry) { return entry.id === id; });
        if (index < 0) return { valid: false, error: "词条不存在" };
        const removed = entries.splice(index, 1)[0];
        rebuildIndex();
        await persist();
        emit("remove", { entry: Object.assign({}, removed) });
        return { valid: true, entry: Object.assign({}, removed) };
    }

    async function setEnabled(id, enabled) {
        return update(id, { enabled: Boolean(enabled) });
    }

    function search(query) {
        const needle = String(query || "").trim().toLowerCase();
        return snapshot().filter(function (entry) {
            return !needle || entry.text.toLowerCase().includes(needle) ||
                entry.reading.includes(normalizeReading(needle));
        });
    }

    function getExact(reading) {
        return (exactIndex.get(normalizeReading(reading)) || []).slice();
    }

    function getPrefixMatches(prefix, options) {
        const limit = Math.max(1, Math.floor(Number(options && options.limit) || 50));
        return (prefixIndex.get(normalizeReading(prefix)) || []).slice()
            .sort(function (left, right) { return right.weight - left.weight; })
            .slice(0, limit);
    }

    function getNextKanaWeights(prefix) {
        const reading = normalizeReading(prefix);
        const weights = new Map();
        (prefixIndex.get(reading) || []).forEach(function (entry) {
            if (entry.reading.length <= reading.length) return;
            const kana = entry.reading.charAt(reading.length);
            weights.set(kana, (weights.get(kana) || 0) + entry.weight);
        });
        return Array.from(weights.entries()).map(function (item) {
            return { kana: item[0], weight: item[1] };
        }).sort(function (left, right) { return right.weight - left.weight; });
    }

    function exportJSON() {
        return JSON.stringify({
            type: "random-ime-custom-lexicon",
            version: SCHEMA_VERSION,
            exportedAt: new Date().toISOString(),
            entries: snapshot()
        }, null, 2);
    }

    async function importJSON(json, options) {
        const config = Object.assign({ mode: "merge" }, options || {});
        let parsed;
        try {
            parsed = typeof json === "string" ? JSON.parse(json) : json;
        } catch (error) {
            return { valid: false, error: "JSON 格式错误", imported: 0, skipped: 0, duplicates: 0 };
        }
        if (!parsed || !Array.isArray(parsed.entries)) {
            return { valid: false, error: "缺少 entries 数组", imported: 0, skipped: 0, duplicates: 0 };
        }
        const target = config.mode === "replace" ? [] : snapshot();
        let imported = 0;
        let skipped = 0;
        let duplicates = 0;
        parsed.entries.forEach(function (raw) {
            const result = validateEntry(raw);
            if (!result.valid) {
                skipped++;
                return;
            }
            if (duplicateIndex(result.entry, null, target) >= 0) {
                duplicates++;
                return;
            }
            if (target.some(function (entry) { return entry.id === result.entry.id; })) {
                result.entry.id = createId();
            }
            target.push(result.entry);
            imported++;
        });
        entries = target;
        rebuildIndex();
        await persist();
        emit("import", { imported, skipped, duplicates, mode: config.mode });
        return { valid: true, imported, skipped, duplicates, total: entries.length };
    }

    async function clear() {
        entries = [];
        rebuildIndex();
        await persist();
        emit("clear");
        return { valid: true };
    }

    function subscribe(listener) {
        if (typeof listener !== "function") return function () {};
        listeners.add(listener);
        return function () { listeners.delete(listener); };
    }

    window.RandomIMECustomLexicon = Object.freeze({
        version: "1.0.0",
        schemaVersion: SCHEMA_VERSION,
        ready,
        storageKey,
        normalizeReading,
        validateEntry,
        list: snapshot,
        search,
        getExact,
        getPrefixMatches,
        getNextKanaWeights,
        add,
        update,
        remove,
        setEnabled,
        clear,
        load,
        exportJSON,
        importJSON,
        subscribe
    });

    load().finally(function () { readyResolve(snapshot()); });
})();
