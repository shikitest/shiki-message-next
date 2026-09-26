(function () {
    "use strict";

    const VERSION = "1.2.0";
    const MAX_LAZY_HISTORY = 12;
    let provider = null;
    let providerUnsubscribe = null;
    let lazyQueue = Promise.resolve();
    let statusRefreshPromise = null;
    let statusRefreshProvider = null;
    let refreshTimer = null;
    const lazyPending = new WeakSet();

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

    function enabledFor(message) {
        if (!message || !message.text || message.type === "system") return false;
        return message.sender === "user" ?
            settings.showUserMessageTranslation === true :
            settings.showPartnerMessageTranslation === true;
    }

    function languagesFor(message) {
        return message.sender === "user" ? {
            sourceLanguage: "zh",
            targetLanguage: "ja"
        } : {
            sourceLanguage: "ja",
            targetLanguage: "zh"
        };
    }

    function saveAndRefresh() {
        if (typeof throttledSaveData === "function") throttledSaveData();
        if (typeof setTimeout !== "function") {
            if (typeof renderMessages === "function") renderMessages(true);
            return;
        }
        if (refreshTimer !== null) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(function () {
            refreshTimer = null;
            if (typeof renderMessages === "function") renderMessages(true);
        }, 80);
    }

    async function translate(text, sourceLanguage, targetLanguage) {
        if (!provider) {
            const error = new Error("Translation provider is not configured");
            error.code = "TRANSLATION_PROVIDER_MISSING";
            throw error;
        }
        return provider.translate(
            String(text || ""),
            sourceLanguage,
            targetLanguage
        );
    }

    async function requestForMessage(message, fromLazyQueue) {
        if (!enabledFor(message)) {
            debugLog("translation skipped: disabled");
            return null;
        }
        if (
            message.translationStatus === "done" &&
            message.translationText
        ) return message.translationText;
        if (message.translationStatus === "loading") return null;
        if (
            message.translationStatus === "queued" &&
            !fromLazyQueue
        ) return null;
        if (!provider) {
            message.translationStatus = message.translationStatus || "idle";
            return null;
        }

        const languages = languagesFor(message);
        message.translationStatus = "loading";
        message.translationSourceLanguage = languages.sourceLanguage;
        message.translationLanguage = languages.targetLanguage;
        message.translationProvider = provider.id || "custom";
        if (typeof throttledSaveData === "function") throttledSaveData();

        try {
            const translated = await translate(
                message.text,
                languages.sourceLanguage,
                languages.targetLanguage
            );
            const text = typeof translated === "string" ?
                translated : translated && translated.text;
            if (!text || !String(text).trim()) {
                throw new Error("Translation provider returned empty text");
            }
            message.translationText = String(text).trim();
            message.translationStatus = "done";
            message.translationError = null;
            if (fromLazyQueue) {
                if (typeof throttledSaveData === "function") throttledSaveData();
            } else {
                saveAndRefresh();
            }
            return message.translationText;
        } catch (error) {
            message.translationStatus = "error";
            message.translationError = error && error.message ?
                error.message : "Translation failed";
            if (typeof throttledSaveData === "function") throttledSaveData();
            console.warn("[TranslationHelper] 翻译失败，原消息不受影响:", error);
            return null;
        }
    }

    function requestVisibleMessages() {
        if (!provider || typeof messages === "undefined") return lazyQueue;
        const pending = messages.filter(function (message) {
            return enabledFor(message) &&
                !(message.translationStatus === "done" &&
                    message.translationText) &&
                message.translationStatus !== "loading" &&
                !lazyPending.has(message);
        }).slice(-MAX_LAZY_HISTORY);
        pending.forEach(function (message) {
            lazyPending.add(message);
            message.translationStatus = "queued";
        });

        lazyQueue = lazyQueue.then(async function () {
            for (const message of pending) {
                try {
                    await requestForMessage(message, true);
                } finally {
                    lazyPending.delete(message);
                    if (message.translationStatus === "queued") {
                        message.translationStatus = "idle";
                    }
                }
            }
            if (pending.length > 0) saveAndRefresh();
        });
        return lazyQueue;
    }

    async function providerStatus(sourceLanguage, targetLanguage) {
        if (!provider) {
            return {
                provider: null,
                state: "unconfigured",
                supported: false
            };
        }
        if (typeof provider.status === "function") {
            return provider.status(
                sourceLanguage || "ja",
                targetLanguage || "zh"
            );
        }
        return {
            provider: provider.id || "custom",
            state: "available",
            supported: true
        };
    }

    function updateProviderStatusUI(status) {
        const element = document.getElementById(
            "translation-provider-status"
        );
        if (!element) return null;
        status = status || {
            state: "unconfigured",
            supported: false
        };
        const localLabels = {
            available: "当前使用本地翻译",
            downloadable: "首次使用需下载本地翻译模型",
            downloading: "正在下载本地翻译模型…",
            "activation-required": "点击翻译开关后可下载本地翻译模型",
            unavailable: "当前浏览器暂不支持本地翻译",
            unconfigured: "本地翻译 provider 尚未配置"
        };
        const remoteLabels = {
            available: "当前使用在线翻译",
            unconfigured: "在线翻译尚未配置",
            unavailable: "在线翻译当前不可用"
        };
        const labels = status.mode === "remote" ?
            remoteLabels : localLabels;
        element.textContent = labels[status.state] ||
            (status.mode === "remote" ?
                "在线翻译当前不可用" :
                "当前浏览器暂不支持本地翻译");
        element.dataset.translationProviderState = status.state || "unknown";
        element.dataset.translationProviderMode = status.mode || "local";
        return status;
    }

    function refreshProviderStatusUI() {
        const currentProvider = provider;
        if (
            statusRefreshPromise &&
            statusRefreshProvider === currentProvider
        ) return statusRefreshPromise;
        const refreshPromise = (async function () {
            try {
                let status;
                try {
                    status = await providerStatus("ja", "zh");
                } catch (error) {
                    status = {
                        state: "unavailable",
                        supported: false,
                        error: error && error.message
                    };
                }
                return updateProviderStatusUI(status);
            } finally {
                if (statusRefreshPromise === refreshPromise) {
                    statusRefreshPromise = null;
                    statusRefreshProvider = null;
                }
            }
        })();
        statusRefreshProvider = currentProvider;
        statusRefreshPromise = refreshPromise;
        return refreshPromise;
    }

    function setProvider(nextProvider) {
        if (
            nextProvider !== null &&
            (!nextProvider || typeof nextProvider.translate !== "function")
        ) {
            throw new TypeError("Translation provider must expose translate()");
        }
        if (providerUnsubscribe) {
            providerUnsubscribe();
            providerUnsubscribe = null;
        }
        provider = nextProvider;
        if (provider && typeof provider.subscribe === "function") {
            providerUnsubscribe = provider.subscribe(function (snapshot) {
                updateProviderStatusUI(snapshot);
            });
        }
        refreshProviderStatusUI();
        if (provider) requestVisibleMessages();
        return provider;
    }

    function syncUI() {
        const partnerToggle = document.getElementById(
            "partner-translation-toggle"
        );
        const userToggle = document.getElementById(
            "user-translation-toggle"
        );
        if (partnerToggle) partnerToggle.classList.toggle(
            "active",
            settings.showPartnerMessageTranslation === true
        );
        if (userToggle) userToggle.classList.toggle(
            "active",
            settings.showUserMessageTranslation === true
        );
    }

    function setEnabled(kind, enabled) {
        if (kind === "partner") {
            settings.showPartnerMessageTranslation = enabled === true;
        } else if (kind === "user") {
            settings.showUserMessageTranslation = enabled === true;
        }
        syncUI();
        if (typeof throttledSaveData === "function") throttledSaveData();
        if (typeof renderMessages === "function") renderMessages(true);
        const lazyRequest = enabled ? requestVisibleMessages() : null;
        refreshProviderStatusUI();
        return lazyRequest;
    }

    function bindUI() {
        const partnerToggle = document.getElementById(
            "partner-translation-toggle"
        );
        const userToggle = document.getElementById(
            "user-translation-toggle"
        );
        if (partnerToggle && !partnerToggle.dataset.translationBound) {
            partnerToggle.dataset.translationBound = "true";
            partnerToggle.addEventListener("click", function () {
                setEnabled(
                    "partner",
                    settings.showPartnerMessageTranslation !== true
                );
            });
        }
        if (userToggle && !userToggle.dataset.translationBound) {
            userToggle.dataset.translationBound = "true";
            userToggle.addEventListener("click", function () {
                setEnabled(
                    "user",
                    settings.showUserMessageTranslation !== true
                );
            });
        }
        syncUI();
        refreshProviderStatusUI();
    }

    window.TranslationProvider = Object.freeze({
        set: setProvider,
        clear: function () {
            if (provider && typeof provider.destroy === "function") {
                provider.destroy();
            }
            return setProvider(null);
        },
        translate,
        status: providerStatus,
        test: async function (text, sourceLanguage, targetLanguage) {
            return translate(
                text,
                sourceLanguage || "ja",
                targetLanguage || "zh"
            );
        },
        get current() { return provider; }
    });
    window.TranslationHelper = Object.freeze({
        version: VERSION,
        requestForMessage,
        requestVisibleMessages,
        enabledFor,
        setEnabled,
        syncUI,
        bindUI,
        refreshProviderStatusUI,
        maxLazyHistory: MAX_LAZY_HISTORY,
        get providerConfigured() { return Boolean(provider); }
    });

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bindUI);
    } else {
        bindUI();
    }
})();
