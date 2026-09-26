#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function assert(value, message) {
    if (!value) throw new Error(message);
}

function read(root, relativePath) {
    return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function toggleElement() {
    return {
        dataset: {},
        classList: {
            active: false,
            toggle(name, enabled) {
                if (name === "active") this.active = Boolean(enabled);
            }
        },
        addEventListener() {}
    };
}

async function main() {
    const root = path.join(__dirname, "..");
    const settings = {
        showPartnerMessageTranslation: false,
        showUserMessageTranslation: false
    };
    const messages = [];
    const fetchCalls = [];
    const partnerToggle = toggleElement();
    const userToggle = toggleElement();
    const statusElement = { dataset: {}, textContent: "" };
    let renders = 0;
    let saves = 0;

    const window = {
        Translator: undefined,
        isSecureContext: true,
        navigator: {},
        location: { href: "https://example.test/app/" },
        console,
        localStorage: { getItem() { return null; } }
    };
    const context = {
        window,
        console,
        settings,
        messages,
        URL,
        AbortController: undefined,
        fetch: async function (url, request) {
            const body = JSON.parse(request.body);
            fetchCalls.push({
                url,
                body,
                hasSignal: Object.prototype.hasOwnProperty.call(
                    request,
                    "signal"
                )
            });
            return {
                ok: true,
                status: 200,
                async json() {
                    return {
                        text: body.targetLanguage + "-translation"
                    };
                }
            };
        },
        document: {
            readyState: "complete",
            getElementById(id) {
                if (id === "partner-translation-toggle") {
                    return partnerToggle;
                }
                if (id === "user-translation-toggle") return userToggle;
                if (id === "translation-provider-status") {
                    return statusElement;
                }
                return null;
            }
        },
        renderMessages() { renders++; },
        throttledSaveData() { saves++; },
        setTimeout,
        clearTimeout,
        Map,
        Set,
        WeakSet,
        Date,
        JSON,
        Array,
        Object,
        Error,
        TypeError
    };

    vm.createContext(context);
    vm.runInContext("Promise.prototype.finally = undefined;", context);
    for (const file of [
        "js/translation/translation-config.js",
        "js/translation-helper.js",
        "js/translation/chrome-translator-provider.js",
        "js/translation/deepl-remote-provider.js"
    ]) {
        vm.runInContext(read(root, file), context, { filename: file });
    }

    const actualRemote = window.DeepLRemoteTranslationProvider;
    let remoteStatusCalls = 0;
    let remoteTranslateCalls = 0;
    window.DeepLRemoteTranslationProvider = {
        id: actualRemote.id,
        status() {
            remoteStatusCalls++;
            return actualRemote.status.apply(actualRemote, arguments);
        },
        translate() {
            remoteTranslateCalls++;
            return actualRemote.translate.apply(actualRemote, arguments);
        },
        subscribe: actualRemote.subscribe,
        destroy: actualRemote.destroy
    };
    vm.runInContext(
        read(root, "js/translation/translation-provider-router.js"),
        context,
        { filename: "js/translation/translation-provider-router.js" }
    );

    const helper = window.TranslationHelper;
    const router = window.TranslationProvider.current;
    let routerEvents = 0;
    router.subscribe(function () { routerEvents++; });

    const disabledMessage = {
        id: "disabled",
        sender: "partner",
        type: "normal",
        text: "disabled"
    };
    messages.push(disabledMessage);
    await helper.requestForMessage(disabledMessage);
    assert(fetchCalls.length === 0, "disabled translation called fetch");

    messages.length = 0;
    const partnerMessage = {
        id: "partner",
        sender: "partner",
        type: "normal",
        text: "partner-ja"
    };
    messages.push(partnerMessage);
    await helper.setEnabled("partner", true);
    assert(fetchCalls.length === 1, "partner translation did not fetch once");
    assert(partnerMessage.translationStatus === "done" &&
        partnerMessage.translationText === "zh-translation",
    "partner translation did not finish");
    assert(fetchCalls[0].body.sourceLanguage === "ja" &&
        fetchCalls[0].body.targetLanguage === "zh",
    "partner language direction is wrong");

    const userMessage = {
        id: "user",
        sender: "user",
        type: "normal",
        text: "user-zh"
    };
    messages.push(userMessage);
    await helper.setEnabled("user", true);
    assert(fetchCalls.length === 2, "user translation did not fetch once");
    assert(userMessage.translationStatus === "done" &&
        userMessage.translationText === "ja-translation",
    "user translation did not finish");
    assert(fetchCalls[1].body.sourceLanguage === "zh" &&
        fetchCalls[1].body.targetLanguage === "ja",
    "user language direction is wrong");

    assert(fetchCalls.every(call => call.hasSignal === false),
        "AbortController fallback unexpectedly passed a signal");
    assert(remoteTranslateCalls === 2,
        "router did not delegate both translations to remote provider");
    assert(typeof vm.runInContext(
        "Promise.prototype.finally",
        context
    ) === "undefined", "Promise.finally simulation was not preserved");

    await Promise.all(Array.from({ length: 100 }, function () {
        return helper.refreshProviderStatusUI();
    }));
    const beforeIdle = {
        fetchCalls: fetchCalls.length,
        remoteStatusCalls,
        routerEvents,
        heapUsed: process.memoryUsage().heapUsed
    };
    const stabilityMs = Math.max(0, Number(process.argv[2]) || 0);
    await new Promise(resolve => setTimeout(resolve, stabilityMs));
    const afterIdle = {
        fetchCalls: fetchCalls.length,
        remoteStatusCalls,
        routerEvents,
        heapUsed: process.memoryUsage().heapUsed
    };
    assert(afterIdle.fetchCalls === beforeIdle.fetchCalls,
        "idle period triggered translation fetches");
    assert(afterIdle.remoteStatusCalls === beforeIdle.remoteStatusCalls,
        "idle period triggered provider status calls");
    assert(afterIdle.routerEvents === beforeIdle.routerEvents,
        "idle period triggered router emissions");

    console.log(JSON.stringify({
        passed: true,
        compatibility: {
            translatorUndefined: true,
            abortControllerUndefined: true,
            promiseFinallyUndefined: true
        },
        translations: {
            disabledFetches: 0,
            japaneseToChinese: partnerMessage.translationText,
            chineseToJapanese: userMessage.translationText,
            fetchCalls: fetchCalls.length,
            remoteTranslateCalls
        },
        stability: {
            durationMs: stabilityMs,
            statusCallsBefore: beforeIdle.remoteStatusCalls,
            statusCallsAfter: afterIdle.remoteStatusCalls,
            emissionsBefore: beforeIdle.routerEvents,
            emissionsAfter: afterIdle.routerEvents,
            heapDeltaBytes: afterIdle.heapUsed - beforeIdle.heapUsed
        },
        ui: {
            partnerActive: partnerToggle.classList.active,
            userActive: userToggle.classList.active
        },
        renders,
        saves
    }, null, 2));
}

main().catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
