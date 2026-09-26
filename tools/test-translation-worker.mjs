#!/usr/bin/env node
import {
    handleRequest,
    resetMemoryRateLimitsForTest
} from "../worker/translation-proxy/src/index.mjs";

function assert(value, message) {
    if (!value) throw new Error(message);
}

const origin = "https://shikikii.github.io";
const env = {
    DEEPL_API_KEY: "test-secret-never-return",
    ALLOWED_ORIGINS: origin + ",http://localhost:8000",
    RATE_LIMIT_MAX: "1000",
    DEEPL_API_PLAN: "free"
};

function request(method, body, requestOrigin = origin) {
    return new Request("https://worker.example/translate", {
        method,
        headers: {
            "Origin": requestOrigin,
            "Content-Type": "application/json",
            "CF-Connecting-IP": "192.0.2.1"
        },
        body: ["POST", "PUT"].includes(method) ? JSON.stringify(body) : undefined
    });
}

function deepL(status, body, capture) {
    return async function (url, options) {
        if (capture) capture.push({ url, options });
        return new Response(JSON.stringify(body), {
            status,
            headers: { "Content-Type": "application/json" }
        });
    };
}

async function bodyOf(response) {
    return JSON.parse(await response.text());
}

resetMemoryRateLimitsForTest();
const calls = [];
let response = await handleRequest(
    request("POST", {
        text: "眠い",
        sourceLanguage: "ja",
        targetLanguage: "zh"
    }),
    env,
    deepL(200, { translations: [{ text: "我困了" }] }, calls)
);
assert(response.status === 200 && (await bodyOf(response)).text === "我困了",
    "DeepL success failed");
assert(response.headers.get("Access-Control-Allow-Origin") === origin,
    "allowed CORS origin missing");
assert(calls[0].url.startsWith("https://api-free.deepl.com/"),
    "DeepL Free endpoint not used");

response = await handleRequest(
    request("POST", {
        text: "我困了",
        sourceLanguage: "zh",
        targetLanguage: "ja"
    }),
    env,
    deepL(200, { translations: [{ text: "眠い" }] })
);
assert(response.status === 200 && (await bodyOf(response)).text === "眠い",
    "zh to ja failed");

response = await handleRequest(request("GET"), env, deepL(200, {}));
assert(response.status === 405, "POST-only check failed");
response = await handleRequest(request("OPTIONS"), env, deepL(200, {}));
assert(response.status === 204, "CORS preflight failed");
response = await handleRequest(
    request("POST", { text: "猫", sourceLanguage: "ja", targetLanguage: "zh" },
        "https://evil.example"),
    env,
    deepL(200, {})
);
assert(response.status === 403 &&
    !response.headers.get("Access-Control-Allow-Origin"),
    "denied origin received CORS permission");

for (const [payload, status] of [
    [{ text: "", sourceLanguage: "ja", targetLanguage: "zh" }, 400],
    [{ text: "a".repeat(1501), sourceLanguage: "ja", targetLanguage: "zh" }, 413],
    [{ text: "hello", sourceLanguage: "en", targetLanguage: "ja" }, 400]
]) {
    response = await handleRequest(request("POST", payload), env, deepL(200, {}));
    assert(response.status === status, "request validation failed: " + status);
}

for (const [status, expected] of [[429, 429], [456, 503], [500, 502]]) {
    response = await handleRequest(
        request("POST", { text: "猫", sourceLanguage: "ja", targetLanguage: "zh" }),
        env,
        deepL(status, { message: "upstream detail" })
    );
    assert(response.status === expected, "DeepL error mapping failed: " + status);
    assert(!(await response.text()).includes(env.DEEPL_API_KEY),
        "API key appeared in response");
}

const strictEnv = { ...env, RATE_LIMIT_MAX: "1" };
resetMemoryRateLimitsForTest();
await handleRequest(
    request("POST", { text: "猫", sourceLanguage: "ja", targetLanguage: "zh" }),
    strictEnv,
    deepL(200, { translations: [{ text: "猫" }] })
);
response = await handleRequest(
    request("POST", { text: "犬", sourceLanguage: "ja", targetLanguage: "zh" }),
    strictEnv,
    deepL(200, { translations: [{ text: "狗" }] })
);
assert(response.status === 429, "code-level rate limit failed");

console.log(JSON.stringify({
    passed: true,
    checks: {
        postOnly: true,
        corsPreflight: true,
        allowedOrigin: true,
        deniedOrigin: true,
        lengthLimit: true,
        languagePairLimit: true,
        deepLSuccess: true,
        deepLFailureMapping: true,
        apiKeyNotInResponse: true,
        codeRateLimit: true,
        apiFreeEndpoint: true
    }
}, null, 2));
