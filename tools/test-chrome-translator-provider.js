#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SOURCE = fs.readFileSync(path.join(
    __dirname,
    "..",
    "js",
    "translation",
    "chrome-translator-provider.js"
), "utf8");

function assert(value, message) {
    if (!value) throw new Error(message);
}

function loadProvider(options) {
    const registered = { provider: null };
    const window = {
        isSecureContext: options.secureContext !== false,
        navigator: {
            userActivation: {
                isActive: options.userActivation !== false
            }
        },
        Translator: options.Translator,
        TranslationProvider: {
            set(provider) { registered.provider = provider; }
        }
    };
    const context = { window, console, Date, Map, Set, Math };
    vm.createContext(context);
    vm.runInContext(SOURCE, context);
    return {
        provider: window.ChromeTranslatorProvider,
        registeredProvider: registered.provider,
        window
    };
}

async function main() {
    const calls = {
        availability: [],
        create: [],
        translate: []
    };
    const availableRuntime = loadProvider({
        Translator: {
            async availability(options) {
                calls.availability.push(options);
                return "available";
            },
            async create(options) {
                calls.create.push(options);
                return {
                    async translate(text) {
                        calls.translate.push(text);
                        return `${options.sourceLanguage}-${options.targetLanguage}:${text}`;
                    },
                    destroy() {}
                };
            }
        }
    });
    const available = availableRuntime.provider;
    assert(available, "child provider was not exported");
    assert(availableRuntime.registeredProvider === null,
        "Chrome child provider must not register as the public provider");
    const statusEvents = [];
    available.subscribe(event => statusEvents.push(event));
    await available.status("ja", "zh");
    await available.status("ja", "zh");
    assert(statusEvents.length === 0,
        "status queries must not emit provider events");
    const statusQueryEvents = statusEvents.length;
    assert(available.normalizeLanguage("zh-CN") === "zh",
        "zh-CN must normalize to Chrome's supported zh code");
    assert(available.normalizeLanguage("ja-JP") === "ja",
        "ja-JP must normalize to ja");

    const empty = await available.translate("", "ja", "zh");
    assert(empty === "" && calls.create.length === 0,
        "empty text must not create a Translator session");
    const jaZh = await available.translate("なんか今日眠い", "ja", "zh-CN");
    const zhJa = await available.translate("我今天不想出门", "zh", "ja");
    const short = await available.translate("え？", "ja", "zh");
    const longer = await available.translate(
        "今日は少し疲れたけど、まだ寝たくない。",
        "ja",
        "zh"
    );
    assert(jaZh === "ja-zh:なんか今日眠い", "ja to zh failed");
    assert(zhJa === "zh-ja:我今天不想出门", "zh to ja failed");
    assert(short && longer, "short or long translation failed");
    assert(calls.create.length === 2,
        "translator sessions must be cached once per language pair");

    const downloadEvents = [];
    let downloadableAvailability = "downloadable";
    let downloadCreates = 0;
    const downloadableRuntime = loadProvider({
        userActivation: false,
        Translator: {
            async availability() { return downloadableAvailability; },
            async create(options) {
                downloadCreates++;
                options.monitor({
                    addEventListener(type, listener) {
                        if (type === "downloadprogress") {
                            listener({ loaded: 0.4 });
                            listener({ loaded: 1 });
                        }
                    }
                });
                downloadableAvailability = "available";
                return {
                    async translate(text) { return "downloaded:" + text; }
                };
            }
        }
    });
    const downloadable = downloadableRuntime.provider;
    downloadable.subscribe(event => downloadEvents.push(event));
    let activationFailure = null;
    try {
        await downloadable.translate("テスト", "ja", "zh");
    } catch (error) {
        activationFailure = error;
    }
    assert(
        activationFailure &&
        activationFailure.code === "TRANSLATION_USER_ACTIVATION_REQUIRED",
        "downloadable model must require user activation"
    );
    assert(downloadCreates === 0, "download started without user activation");
    downloadableRuntime.window.navigator.userActivation.isActive = true;
    const downloaded = await downloadable.translate("テスト", "ja", "zh");
    assert(downloaded === "downloaded:テスト" && downloadCreates === 1,
        "model download/create path failed");
    assert(downloadEvents.some(event => event.state === "downloading" &&
        event.progress === 0.4), "download progress was not reported");
    assert(downloadEvents.some(event => event.state === "available"),
        "download completion was not reported");

    const downloadingRuntime = loadProvider({
        Translator: {
            async availability() { return "downloading"; },
            async create() {
                return { async translate(text) { return text; } };
            }
        }
    });
    const downloadingStatus = await downloadingRuntime.provider.status(
        "ja",
        "zh"
    );
    assert(downloadingStatus.state === "downloading",
        "downloading status not preserved");

    const unsupported = loadProvider({ Translator: undefined }).provider;
    const unsupportedStatus = await unsupported.status("ja", "zh");
    assert(
        unsupportedStatus.state === "unavailable" &&
        unsupportedStatus.reason === "translator-api-missing",
        "unsupported browser detection failed"
    );
    const insecure = loadProvider({
        secureContext: false,
        Translator: {
            async availability() { return "available"; },
            async create() { return {}; }
        }
    }).provider;
    const insecureStatus = await insecure.status("ja", "zh");
    assert(insecureStatus.reason === "insecure-context",
        "insecure context detection failed");

    const createFailure = loadProvider({
        Translator: {
            async availability() { return "available"; },
            async create() { throw new Error("model failed"); }
        }
    }).provider;
    let failed = false;
    try {
        await createFailure.translate("失敗", "ja", "zh");
    } catch (error) {
        failed = error.message === "model failed";
    }
    assert(failed, "create failure was swallowed");

    console.log(JSON.stringify({
        passed: true,
        checks: {
            japaneseToChinese: true,
            chineseToJapanese: true,
            emptyString: true,
            shortMessage: true,
            longerChatMessage: true,
            unsupportedBrowser: true,
            insecureContext: true,
            downloadableModel: true,
            downloadingModel: true,
            downloadProgress: true,
            userActivationRequired: true,
            modelDownloadComplete: true,
            createFailure: true,
            pairSessionCache: true,
            officialLanguageCodes: true
        },
        calls: {
            availability: calls.availability.length,
            create: calls.create.length,
            translate: calls.translate.length
        },
        downloadStates: downloadEvents.map(event => ({
            state: event.state,
            progress: event.progress,
            reason: event.reason || null
        })),
        statusQueryEvents
    }, null, 2));
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
