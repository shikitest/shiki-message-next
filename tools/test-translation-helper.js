#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function assert(value, message) {
    if (!value) throw new Error(message);
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
        listeners: {},
        addEventListener(type, listener) { this.listeners[type] = listener; }
    };
}

async function main() {
    const root = path.join(__dirname, "..");
    const source = fs.readFileSync(path.join(
        root,
        "js",
        "translation-helper.js"
    ), "utf8");
    const coreSource = fs.readFileSync(path.join(root, "js", "core.js"), "utf8");
    const groupSource = fs.readFileSync(path.join(
        root,
        "js",
        "features",
        "group-chat.js"
    ), "utf8");
    const partnerToggle = toggleElement();
    const userToggle = toggleElement();
    const providerStatusElement = {
        textContent: "",
        dataset: {}
    };
    const settings = {
        showPartnerMessageTranslation: false,
        showUserMessageTranslation: false
    };
    const messages = [
        { id: 1, sender: "partner", type: "normal", text: "ねむい" },
        { id: 2, sender: "user", type: "normal", text: "我好困" },
        { id: 3, sender: "partner", type: "normal", text: "旧消息" }
    ];
    let saves = 0;
    let renders = 0;
    let providerCalls = 0;
    const context = {
        window: {},
        console,
        settings,
        messages,
        throttledSaveData() { saves++; },
        renderMessages() { renders++; },
        document: {
            readyState: "complete",
            getElementById(id) {
                if (id === "partner-translation-toggle") return partnerToggle;
                if (id === "user-translation-toggle") return userToggle;
                if (id === "translation-provider-status") {
                    return providerStatusElement;
                }
                return null;
            }
        }
    };
    vm.createContext(context);
    vm.runInContext("Promise.prototype.finally = undefined;", context);
    assert(vm.runInContext(
        "typeof Promise.prototype.finally",
        context
    ) === "undefined", "legacy Safari Promise.finally simulation failed");
    vm.runInContext(source, context);
    const helper = context.window.TranslationHelper;
    const provider = context.window.TranslationProvider;

    assert(!settings.showPartnerMessageTranslation &&
        !settings.showUserMessageTranslation,
        "old settings must default to both translation switches off");
    await helper.refreshProviderStatusUI();
    assert(providerStatusElement.dataset.translationProviderState ===
        "unconfigured", "unconfigured provider status hint failed");
    helper.setEnabled("partner", true);
    assert(settings.showPartnerMessageTranslation === true &&
        settings.showUserMessageTranslation === false,
        "partner on / user off must be independent");

    provider.set({
        id: "test-provider",
        async translate(text, sourceLanguage, targetLanguage) {
            providerCalls++;
            return `${targetLanguage}:${text}`;
        }
    });
    await helper.requestVisibleMessages();
    assert(messages[0].translationText === "zh:ねむい",
        "partner translation must be ja to zh");
    assert(messages[0].text === "ねむい", "partner original text changed");

    await helper.setEnabled("user", true);
    assert(settings.showPartnerMessageTranslation === true &&
        settings.showUserMessageTranslation === true,
        "both switches must be independently enabled");
    assert(messages[1].translationText === "ja:我好困",
        "user translation must be zh to ja");
    assert(messages[1].text === "我好困", "user original text changed");

    const callsBeforeCache = providerCalls;
    await helper.requestForMessage(messages[1]);
    assert(providerCalls === callsBeforeCache,
        "cached translation must not call provider again");

    helper.setEnabled("partner", false);
    assert(!settings.showPartnerMessageTranslation &&
        settings.showUserMessageTranslation,
        "partner off / user on must be independent");
    helper.setEnabled("user", false);
    assert(!settings.showPartnerMessageTranslation &&
        !settings.showUserMessageTranslation,
        "both switches must turn off without deleting cached text");
    assert(messages[0].translationText && messages[1].translationText,
        "switch off must preserve cached translations");
    assert(messages[2].text === "旧消息",
        "old messages without translation fields must load without changing original text");

    let statusCalls = 0;
    let statusListener = null;
    provider.set({
        id: "unsupported-provider",
        async status() {
            statusCalls++;
            return { state: "unavailable", supported: false };
        },
        subscribe(listener) {
            statusListener = listener;
            return function () { statusListener = null; };
        },
        async translate() { return ""; }
    });
    await Promise.all([
        helper.refreshProviderStatusUI(),
        helper.refreshProviderStatusUI(),
        helper.refreshProviderStatusUI()
    ]);
    assert(statusCalls === 1,
        "concurrent status refreshes must share one in-flight query");
    assert(providerStatusElement.dataset.translationProviderState ===
        "unavailable", "unsupported browser hint failed");
    statusListener({
        state: "available",
        supported: true,
        mode: "local"
    });
    assert(statusCalls === 1,
        "provider subscriber must consume its snapshot without querying status");
    assert(providerStatusElement.dataset.translationProviderState ===
        "available", "provider event snapshot did not update the UI");

    let failureCalls = 0;
    const lazyMessages = Array.from({ length: 20 }, function (_, index) {
        return {
            id: 100 + index,
            sender: "partner",
            type: "normal",
            text: "lazy-" + index
        };
    });
    messages.push(...lazyMessages);
    provider.set({
        id: "failing-provider",
        async translate() {
            failureCalls++;
            throw new Error("translation failed");
        }
    });
    await helper.setEnabled("partner", true);
    assert(failureCalls === helper.maxLazyHistory,
        "lazy translation must cap reopened history requests");
    assert(lazyMessages.slice(0, 8).every(message =>
        message.translationStatus === undefined),
        "lazy translation touched messages outside the recent window");
    assert(lazyMessages.slice(-12).every(message =>
        message.translationStatus === "error" &&
        message.text.startsWith("lazy-")),
        "translation failure must preserve recent original messages");
    helper.setEnabled("partner", false);

    const helperAppend = coreSource.indexOf(
        "if (translationDiv) contentWrapper.appendChild(translationDiv)"
    );
    const bubbleAppend = coreSource.indexOf(
        "contentWrapper.append(actionsDiv, messageDiv)"
    );
    assert(bubbleAppend >= 0 && helperAppend > bubbleAppend,
        "translation helper must be a sibling after the message bubble");
    assert(!/message\.text\s*=\s*[^;]*translation/.test(coreSource),
        "message.text must never be replaced with translation");
    assert(!groupSource.includes("translationText"),
        "search and word cloud paths must not consume translationText");
    assert(coreSource.includes("window.TranslationHelper.syncUI();"),
        "global UI refresh must synchronize translation toggles");

    console.log(JSON.stringify({
        switches: {
            partnerOnUserOff: true,
            partnerOffUserOn: true,
            bothOn: true,
            bothOff: true
        },
        schema: {
            originalTextPreserved: true,
            cachedTranslationReused: true,
            oldMessageCompatible: true,
            failurePreservesOriginal: true,
            lazyHistoryLimit: helper.maxLazyHistory,
            unavailableStatusHint: true,
            inFlightStatusCalls: statusCalls,
            status: messages.slice(0, 2).map(message => ({
                id: message.id,
                translationStatus: message.translationStatus,
                translationLanguage: message.translationLanguage,
                translationSourceLanguage: message.translationSourceLanguage
            }))
        },
        dom: {
            bubbleAndHelperAreSiblings: true,
            helperAfterBubble: true
        },
        isolation: {
            originalMessageFieldUnchanged: true,
            searchAndWordCloudIgnoreTranslation: true,
            providerConfiguredOnlyByExplicitRegistration: true
        },
        compatibility: {
            promiseFinallyUnavailable: true,
            translationFlowCompleted: true
        },
        saves,
        renders
    }, null, 2));
}

main().catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
