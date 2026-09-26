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
    "translation-provider-router.js"
), "utf8");

function assert(value, message) {
    if (!value) throw new Error(message);
}

function fakeProvider(id, state, translated) {
    const subscribers = new Set();
    return {
        id,
        async status() {
            return {
                provider: id,
                state,
                supported: !["unavailable", "unconfigured"].includes(state)
            };
        },
        async translate(text) { return translated + ":" + text; },
        subscribe(listener) {
            subscribers.add(listener);
            return function () { subscribers.delete(listener); };
        },
        emit(snapshot) {
            subscribers.forEach(function (listener) { listener(snapshot); });
        }
    };
}

function load(local, remote) {
    const registered = { provider: null };
    const window = {
        ChromeTranslatorProvider: local,
        DeepLRemoteTranslationProvider: remote,
        TranslationProvider: {
            set(provider) { registered.provider = provider; }
        }
    };
    const context = { window, console, Set, Object, Error };
    vm.createContext(context);
    vm.runInContext(source, context);
    return registered.provider;
}

async function main() {
    for (const state of ["available", "downloadable", "downloading"] ) {
        const router = load(
            fakeProvider("chrome", state, "local"),
            fakeProvider("remote", "available", "remote")
        );
        let statusEvents = 0;
        router.subscribe(function () { statusEvents++; });
        const status = await router.status("ja", "zh");
        await router.status("ja", "zh");
        assert(statusEvents === 0,
            "router status queries must not emit events");
        assert(status.mode === "local" && status.activeProvider === "chrome",
            "Chrome " + state + " must select local provider");
        assert(await router.translate("猫", "ja", "zh") === "local:猫",
            "local translate route failed for " + state);
    }

    const unavailable = load(
        fakeProvider("chrome", "unavailable", "local"),
        fakeProvider("remote", "available", "remote")
    );
    assert((await unavailable.status("ja", "zh")).mode === "remote",
        "unavailable Chrome must select remote");
    assert(await unavailable.translate("猫", "ja", "zh") === "remote:猫",
        "remote fallback translate failed");

    const mobileLike = load(
        null,
        fakeProvider("remote", "available", "remote")
    );
    assert((await mobileLike.status("ja", "zh")).mode === "remote",
        "missing Translator API must select remote");

    const unconfigured = load(
        null,
        fakeProvider("remote", "unconfigured", "remote")
    );
    const missingStatus = await unconfigured.status("ja", "zh");
    assert(missingStatus.state === "unconfigured" && !missingStatus.supported,
        "unconfigured remote must be graceful");
    let error = null;
    try { await unconfigured.translate("猫", "ja", "zh"); }
    catch (caught) { error = caught; }
    assert(error && error.code === "TRANSLATION_PROXY_UNCONFIGURED",
        "unconfigured translate error code missing");

    const eventLocal = fakeProvider("chrome", "available", "local");
    const eventRouter = load(
        eventLocal,
        fakeProvider("remote", "available", "remote")
    );
    const routedEvents = [];
    eventRouter.subscribe(function (snapshot) {
        routedEvents.push(snapshot);
    });
    const availableEvent = {
        provider: "chrome",
        state: "available",
        supported: true,
        sourceLanguage: "ja",
        targetLanguage: "zh",
        progress: 1
    };
    eventLocal.emit(availableEvent);
    eventLocal.emit(availableEvent);
    assert(routedEvents.length === 1,
        "identical provider events must be deduplicated by the router");
    await eventRouter.status("ja", "zh");
    assert(routedEvents.length === 1,
        "router status query emitted after a provider event");

    console.log(JSON.stringify({
        passed: true,
        checks: {
            chromeAvailableLocal: true,
            chromeDownloadableLocal: true,
            chromeDownloadingLocal: true,
            chromeUnavailableRemote: true,
            mobileLikeRemote: true,
            unconfiguredGraceful: true,
            capabilityDetectionOnly: true,
            statusQueriesArePure: true,
            repeatedEventsDeduplicated: true
        }
    }, null, 2));
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
