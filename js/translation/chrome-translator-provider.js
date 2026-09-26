(function () {
    "use strict";

    const VERSION = "1.0.0";
    const PROVIDER_ID = "chrome-built-in-translator";
    const translators = new Map();
    const creationPromises = new Map();
    const pairStates = new Map();
    const listeners = new Set();

    function normalizeLanguage(language) {
        const value = String(language || "").trim();
        const lower = value.toLowerCase();
        if (["zh", "zh-cn", "zh-hans"].includes(lower)) return "zh";
        if (["ja", "ja-jp"].includes(lower)) return "ja";
        return value;
    }

    function pairOptions(sourceLanguage, targetLanguage) {
        return {
            sourceLanguage: normalizeLanguage(sourceLanguage),
            targetLanguage: normalizeLanguage(targetLanguage)
        };
    }

    function pairKey(options) {
        return options.sourceLanguage + "→" + options.targetLanguage;
    }

    function translatorAPI() {
        return window && window.Translator ? window.Translator : null;
    }

    function userActivationActive() {
        return Boolean(
            window.navigator &&
            window.navigator.userActivation &&
            window.navigator.userActivation.isActive
        );
    }

    function createSnapshot(options, state, extra) {
        return Object.assign({
            provider: PROVIDER_ID,
            pair: pairKey(options),
            sourceLanguage: options.sourceLanguage,
            targetLanguage: options.targetLanguage,
            state,
            supported: state !== "unavailable",
            progress: null,
            updatedAt: Date.now()
        }, extra || {});
    }

    function sameSnapshot(previous, next) {
        if (!previous || !next) return false;
        const keys = [
            "provider", "pair", "sourceLanguage", "targetLanguage",
            "state", "supported", "progress", "availability", "reason",
            "userActivation", "error"
        ];
        return keys.every(function (key) {
            return previous[key] === next[key];
        });
    }

    function emit(options, state, extra) {
        const key = pairKey(options);
        const snapshot = createSnapshot(options, state, extra);
        const previous = pairStates.get(key);
        if (sameSnapshot(previous, snapshot)) return previous;
        pairStates.set(key, snapshot);
        listeners.forEach(function (listener) {
            try { listener(snapshot); } catch (error) {}
        });
        return snapshot;
    }

    async function status(sourceLanguage, targetLanguage) {
        const options = pairOptions(
            sourceLanguage || "ja",
            targetLanguage || "zh"
        );
        const api = translatorAPI();
        if (window.isSecureContext === false) {
            return createSnapshot(options, "unavailable", {
                supported: false,
                reason: "insecure-context"
            });
        }
        if (
            !api ||
            typeof api.availability !== "function" ||
            typeof api.create !== "function"
        ) {
            return createSnapshot(options, "unavailable", {
                supported: false,
                reason: "translator-api-missing"
            });
        }

        try {
            const availability = await api.availability(options);
            const state = [
                "available",
                "downloadable",
                "downloading",
                "unavailable"
            ].includes(availability) ? availability : "unavailable";
            return createSnapshot(options, state, {
                supported: state !== "unavailable",
                availability: availability || null,
                reason: availability ? null : "availability-unknown",
                userActivation: userActivationActive()
            });
        } catch (error) {
            return createSnapshot(options, "unavailable", {
                supported: false,
                reason: "availability-failed",
                error: error && error.message ? error.message : String(error)
            });
        }
    }

    function activationError(options) {
        const error = new Error(
            "首次下载本地翻译模型需要一次用户点击或按键操作"
        );
        error.name = "NotAllowedError";
        error.code = "TRANSLATION_USER_ACTIVATION_REQUIRED";
        emit(options, "activation-required", {
            supported: true,
            reason: "user-activation-required"
        });
        return error;
    }

    async function createTranslator(options) {
        const key = pairKey(options);
        if (translators.has(key)) return translators.get(key);
        if (creationPromises.has(key)) return creationPromises.get(key);

        const promise = (async function () {
            const availability = await status(
                options.sourceLanguage,
                options.targetLanguage
            );
            if (!availability.supported || availability.state === "unavailable") {
                const error = new Error(
                    "当前浏览器不支持此本地翻译语言组合"
                );
                error.code = "TRANSLATION_UNAVAILABLE";
                throw error;
            }
            if (
                ["downloadable", "downloading"].includes(
                    availability.state
                ) &&
                !userActivationActive()
            ) {
                throw activationError(options);
            }

            const api = translatorAPI();
            if (availability.state !== "available") {
                emit(options, "downloading", {
                    supported: true,
                    progress: 0
                });
            }
            const translator = await api.create({
                sourceLanguage: options.sourceLanguage,
                targetLanguage: options.targetLanguage,
                monitor(monitor) {
                    monitor.addEventListener(
                        "downloadprogress",
                        function (event) {
                            emit(options, "downloading", {
                                supported: true,
                                progress: Math.max(
                                    0,
                                    Math.min(1, Number(event.loaded) || 0)
                                )
                            });
                        }
                    );
                }
            });
            translators.set(key, translator);
            emit(options, "available", {
                supported: true,
                progress: 1
            });
            return translator;
        })();

        creationPromises.set(key, promise);
        try {
            return await promise;
        } catch (error) {
            if (
                !error ||
                error.code !== "TRANSLATION_USER_ACTIVATION_REQUIRED"
            ) {
                emit(options, "unavailable", {
                    supported: false,
                    reason: error && error.code || "create-failed",
                    error: error && error.message ?
                        error.message : String(error)
                });
            }
            throw error;
        } finally {
            creationPromises.delete(key);
        }
    }

    async function translate(text, sourceLanguage, targetLanguage) {
        const input = String(text || "");
        if (!input.trim()) return "";
        const options = pairOptions(sourceLanguage, targetLanguage);
        if (!options.sourceLanguage || !options.targetLanguage) {
            const error = new TypeError(
                "sourceLanguage and targetLanguage are required"
            );
            error.code = "TRANSLATION_LANGUAGE_REQUIRED";
            throw error;
        }
        const translator = await createTranslator(options);
        return translator.translate(input);
    }

    function subscribe(listener) {
        if (typeof listener !== "function") return function () {};
        listeners.add(listener);
        return function () { listeners.delete(listener); };
    }

    function destroy() {
        translators.forEach(function (translator) {
            if (translator && typeof translator.destroy === "function") {
                try { translator.destroy(); } catch (error) {}
            }
        });
        translators.clear();
        creationPromises.clear();
        pairStates.clear();
    }

    const provider = Object.freeze({
        id: PROVIDER_ID,
        version: VERSION,
        translate,
        status,
        subscribe,
        destroy,
        normalizeLanguage,
        getPairState: function (sourceLanguage, targetLanguage) {
            return pairStates.get(pairKey(pairOptions(
                sourceLanguage,
                targetLanguage
            ))) || null;
        }
    });

    window.ChromeTranslatorProvider = provider;
})();
