(function () {
    "use strict";

    const VERSION = "1.0.0";
    const PROVIDER_ID = "translation-provider-router";
    const local = window.ChromeTranslatorProvider || null;
    const remote = window.DeepLRemoteTranslationProvider || null;
    const listeners = new Set();
    const unsubscribers = [];
    const emittedStates = new Map();
    const LOCAL_STATES = new Set([
        "available",
        "downloadable",
        "downloading",
        "activation-required"
    ]);

    function debugEnabled() {
        try {
            return Boolean(
                window.TranslationConfig &&
                window.TranslationConfig.debug === true
            ) || NextStorage.local.getItem("translationDebug") === "true";
        } catch (error) {
            return false;
        }
    }

    function debugLog(message) {
        if (
            debugEnabled() &&
            window.console &&
            typeof console.debug === "function"
        ) {
            console.debug("[Translation] " + message);
        }
    }

    function statusKey(status) {
        return String(status && status.sourceLanguage || "ja") + "\u0000" +
            String(status && status.targetLanguage || "zh");
    }

    function sameStatus(previous, next) {
        if (!previous || !next) return false;
        const keys = [
            "provider", "activeProvider", "mode", "state", "supported",
            "configured", "progress", "availability", "reason",
            "sourceLanguage", "targetLanguage", "error"
        ];
        return keys.every(function (key) {
            return previous[key] === next[key];
        });
    }

    function emit(status) {
        const key = statusKey(status);
        const previous = emittedStates.get(key);
        if (sameStatus(previous, status)) return previous;
        emittedStates.set(key, status);
        listeners.forEach(function (listener) {
            try { listener(status); } catch (error) {}
        });
        return status;
    }

    async function resolve(sourceLanguage, targetLanguage) {
        const source = sourceLanguage || "ja";
        const target = targetLanguage || "zh";
        if (local && typeof local.status === "function") {
            const localStatus = await local.status(source, target);
            if (LOCAL_STATES.has(localStatus.state)) {
                return {
                    provider: local,
                    status: Object.assign({}, localStatus, {
                        provider: PROVIDER_ID,
                        activeProvider: local.id,
                        mode: "local"
                    })
                };
            }
        }
        if (remote && typeof remote.status === "function") {
            const remoteStatus = await remote.status(source, target);
            return {
                provider: remoteStatus.supported ? remote : null,
                status: Object.assign({}, remoteStatus, {
                    provider: PROVIDER_ID,
                    activeProvider: remote.id,
                    mode: "remote"
                })
            };
        }
        return {
            provider: null,
            status: {
                provider: PROVIDER_ID,
                activeProvider: null,
                mode: "remote",
                state: "unconfigured",
                supported: false,
                reason: "remote-provider-missing"
            }
        };
    }

    async function status(sourceLanguage, targetLanguage) {
        return (await resolve(sourceLanguage, targetLanguage)).status;
    }

    async function translate(text, sourceLanguage, targetLanguage) {
        const route = await resolve(sourceLanguage, targetLanguage);
        if (!route.provider) {
            const error = new Error(
                route.status.state === "unconfigured" ?
                    "在线翻译尚未配置" : "Translation is unavailable"
            );
            error.code = route.status.state === "unconfigured" ?
                "TRANSLATION_PROXY_UNCONFIGURED" :
                "TRANSLATION_UNAVAILABLE";
            throw error;
        }
        debugLog(
            "translation route: " +
            (route.status && route.status.mode || "unknown")
        );
        return route.provider.translate(
            text,
            sourceLanguage,
            targetLanguage
        );
    }

    function subscribe(listener) {
        if (typeof listener !== "function") return function () {};
        listeners.add(listener);
        return function () { listeners.delete(listener); };
    }

    [local, remote].forEach(function (provider) {
        if (provider && typeof provider.subscribe === "function") {
            unsubscribers.push(provider.subscribe(function (event) {
                if (
                    provider === local &&
                    event &&
                    LOCAL_STATES.has(event.state)
                ) {
                    emit(Object.assign({}, event, {
                        provider: PROVIDER_ID,
                        activeProvider: local.id,
                        mode: "local"
                    }));
                    return;
                }
                resolve(
                    event && event.sourceLanguage,
                    event && event.targetLanguage
                ).then(function (route) {
                    emit(route.status);
                }).catch(function () {});
            }));
        }
    });

    const router = Object.freeze({
        id: PROVIDER_ID,
        version: VERSION,
        translate,
        status,
        subscribe,
        resolve,
        get localProvider() { return local; },
        get remoteProvider() { return remote; }
    });

    window.TranslationProviderRouter = router;
    if (
        window.TranslationProvider &&
        typeof window.TranslationProvider.set === "function"
    ) {
        window.TranslationProvider.set(router);
    }
})();
