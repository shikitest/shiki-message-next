#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.join(
    __dirname,
    "..",
    "js",
    "translation",
    "deepl-remote-provider.js"
), "utf8");

function assert(value, message) {
    if (!value) throw new Error(message);
}

function response(status, body, invalidJson) {
    return {
        status,
        ok: status >= 200 && status < 300,
        async json() {
            if (invalidJson) throw new Error("bad json");
            return body;
        }
    };
}

function load(options = {}) {
    const calls = [];
    const window = {
        TranslationConfig: {
            translationProxyUrl: options.url === undefined ?
                "https://translation.example/translate" : options.url
        },
        location: { href: "http://localhost:8000/" }
    };
    const fetch = options.fetch || (async function (url, request) {
        calls.push({ url, request, body: JSON.parse(request.body) });
        return response(200, { text: "translated" });
    });
    const context = {
        window,
        console,
        fetch,
        URL,
        AbortController: Object.prototype.hasOwnProperty.call(
            options,
            "AbortController"
        ) ? options.AbortController : AbortController,
        Map,
        Set,
        Date,
        JSON,
        Array,
        setTimeout: options.setTimeout || setTimeout,
        clearTimeout: options.clearTimeout || clearTimeout
    };
    vm.createContext(context);
    vm.runInContext(source, context);
    return { provider: window.DeepLRemoteTranslationProvider, calls };
}

async function expectCode(provider, call, code) {
    let caught = null;
    try { await call(); } catch (error) { caught = error; }
    assert(caught && caught.code === code, "expected " + code);
}

async function main() {
    const ok = load();
    let statusEvents = 0;
    ok.provider.subscribe(function () { statusEvents++; });
    await ok.provider.status("ja", "zh");
    await ok.provider.status("ja", "zh");
    assert(statusEvents === 0,
        "status queries must not emit provider events");
    assert(await ok.provider.translate("眠い", "ja", "zh") === "translated",
        "ja to zh failed");
    assert(ok.calls[0].body.sourceLanguage === "ja" &&
        ok.calls[0].body.targetLanguage === "zh",
        "ja to zh payload failed");
    ok.provider.clearCache();
    await ok.provider.translate("我好困", "zh", "ja");
    assert(ok.calls[1].body.sourceLanguage === "zh" &&
        ok.calls[1].body.targetLanguage === "ja",
        "zh to ja payload failed");
    assert(Object.keys(ok.calls[1].body).sort().join(",") ===
        "sourceLanguage,targetLanguage,text",
        "remote payload leaked extra fields");

    const withoutAbortController = load({ AbortController: undefined });
    assert(await withoutAbortController.provider.translate(
        "mobile-ja", "ja", "zh"
    ) === "translated", "missing AbortController blocked translation");
    assert(withoutAbortController.calls.length === 1,
        "missing AbortController must still call fetch once");
    assert(!Object.prototype.hasOwnProperty.call(
        withoutAbortController.calls[0].request,
        "signal"
    ), "missing AbortController must omit the fetch signal");

    const cacheCalls = ok.calls.length;
    await ok.provider.translate("我好困", "zh", "ja");
    assert(ok.calls.length === cacheCalls, "short-term cache was not reused");

    await expectCode(ok.provider,
        () => ok.provider.translate("", "ja", "zh"),
        "TRANSLATION_EMPTY_TEXT");
    await expectCode(ok.provider,
        () => ok.provider.translate("a".repeat(1501), "ja", "zh"),
        "TRANSLATION_TEXT_TOO_LONG");
    await expectCode(ok.provider,
        () => ok.provider.translate("hello", "en", "ja"),
        "TRANSLATION_LANGUAGE_PAIR_NOT_ALLOWED");

    const unconfigured = load({ url: "" }).provider;
    assert((await unconfigured.status("ja", "zh")).state === "unconfigured",
        "unconfigured status failed");
    await expectCode(unconfigured,
        () => unconfigured.translate("猫", "ja", "zh"),
        "TRANSLATION_PROXY_UNCONFIGURED");

    for (const test of [
        [429, { error: { code: "PROXY_RATE_LIMITED", message: "limit" } },
            "PROXY_RATE_LIMITED"],
        [503, { error: { code: "DEEPL_QUOTA_EXCEEDED", message: "quota" } },
            "DEEPL_QUOTA_EXCEEDED"],
        [500, { error: { code: "DEEPL_UNAVAILABLE", message: "down" } },
            "DEEPL_UNAVAILABLE"]
    ]) {
        const runtime = load({
            fetch: async () => response(test[0], test[1])
        });
        await expectCode(runtime.provider,
            () => runtime.provider.translate("猫", "ja", "zh"), test[2]);
    }

    const invalid = load({
        fetch: async () => response(200, null, true)
    }).provider;
    await expectCode(invalid,
        () => invalid.translate("猫", "ja", "zh"),
        "TRANSLATION_INVALID_RESPONSE");

    const timeout = load({
        setTimeout(callback) { callback(); return 1; },
        clearTimeout() {},
        fetch: async function (url, request) {
            if (request.signal.aborted) {
                const error = new Error("aborted");
                error.name = "AbortError";
                throw error;
            }
            return response(200, { text: "unexpected" });
        }
    }).provider;
    await expectCode(timeout,
        () => timeout.translate("猫", "ja", "zh"),
        "TRANSLATION_TIMEOUT");

    console.log(JSON.stringify({
        passed: true,
        checks: {
            japaneseToChinese: true,
            chineseToJapanese: true,
            timeout: true,
            rateLimited429: true,
            quotaExceeded: true,
            server500: true,
            invalidJson: true,
            emptyText: true,
            tooLong: true,
            illegalPair: true,
            unconfigured: true,
            cache: true,
            privacyPayload: true,
            abortControllerFallback: true,
            statusQueryEvents: statusEvents
        }
    }, null, 2));
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
