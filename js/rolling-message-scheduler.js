(function () {
    "use strict";

    const VERSION = "1.0.0";
    const FREQUENCIES = Object.freeze({
        low: Object.freeze({
            medianMinutes: 300,
            sigma: 1.05,
            minimumMinutes: 10,
            maximumMinutes: 2160,
            burstChance: 0.08
        }),
        normal: Object.freeze({
            medianMinutes: 120,
            sigma: 1,
            minimumMinutes: 5,
            maximumMinutes: 1080,
            burstChance: 0.14
        }),
        high: Object.freeze({
            medianMinutes: 45,
            sigma: 0.92,
            minimumMinutes: 2,
            maximumMinutes: 480,
            burstChance: 0.22
        })
    });
    const MINIMUM_BURST_DELAY_MS = 15000;
    const MAXIMUM_BURST_DELAY_MS = 8 * 60 * 1000;
    const MAX_BURST_MESSAGES = 4;
    const MAX_TIMER_DELAY_MS = 60 * 1000;

    function normalizeFrequency(value) {
        return Object.prototype.hasOwnProperty.call(FREQUENCIES, value) ?
            value : "normal";
    }

    function normalRandom(random) {
        const a = Math.max(Number.EPSILON, random());
        const b = Math.max(Number.EPSILON, random());
        return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
    }

    function sampleRegularDelay(frequency, random) {
        const profile = FREQUENCIES[normalizeFrequency(frequency)];
        const minutes = profile.medianMinutes * Math.exp(
            profile.sigma * normalRandom(random)
        );
        return Math.round(
            Math.min(
                profile.maximumMinutes,
                Math.max(profile.minimumMinutes, minutes)
            ) * 60 * 1000
        );
    }

    function sampleBurstDelay(random) {
        const ratio = Math.pow(random(), 1.65);
        return Math.round(
            MINIMUM_BURST_DELAY_MS +
            ratio * (MAXIMUM_BURST_DELAY_MS - MINIMUM_BURST_DELAY_MS)
        );
    }

    function sampleBurstLength(random) {
        let count = 1;
        while (count < MAX_BURST_MESSAGES && random() < 0.48) count++;
        return count;
    }

    function safeIdentity(item) {
        if (typeof item === "string") return { id: item };
        if (!item || !item.id) return null;
        return {
            id: String(item.id),
            groupMemberId: item.groupMemberId ?
                String(item.groupMemberId) : null
        };
    }

    function createEngine(dependencies) {
        const deps = dependencies || {};
        const random = typeof deps.random === "function" ?
            deps.random : Math.random;
        const now = typeof deps.now === "function" ?
            deps.now : Date.now;
        const setTimer = deps.setTimeout || setTimeout;
        const clearTimer = deps.clearTimeout || clearTimeout;
        let states = Object.create(null);
        let timer = null;
        let running = false;
        let config = null;
        let wakePromise = null;

        function serialize() {
            return {
                version: VERSION,
                savedAt: now(),
                states: Object.values(states).map(function (state) {
                    return Object.assign({}, state);
                })
            };
        }

        async function persist() {
            if (!config || !config.storage || !config.storageKey) return;
            await config.storage.setItem(config.storageKey, serialize());
        }

        function getIdentities() {
            const raw = config && typeof config.getIdentities === "function" ?
                config.getIdentities() : [];
            return (Array.isArray(raw) ? raw : [])
                .map(safeIdentity)
                .filter(Boolean);
        }

        function freshState(identity, currentTime) {
            return {
                id: identity.id,
                groupMemberId: identity.groupMemberId || null,
                nextSendAt: currentTime + sampleRegularDelay(
                    config.frequency,
                    random
                ),
                lastTriggeredAt: null,
                burstRemaining: 0,
                triggerCount: 0
            };
        }

        function reconcile(currentTime) {
            const identities = getIdentities();
            const wanted = new Set(identities.map(function (item) {
                return item.id;
            }));
            Object.keys(states).forEach(function (id) {
                if (!wanted.has(id)) delete states[id];
            });
            identities.forEach(function (identity) {
                if (!states[identity.id]) {
                    states[identity.id] = freshState(identity, currentTime);
                } else {
                    states[identity.id].groupMemberId =
                        identity.groupMemberId || null;
                }
            });
        }

        function planNext(state, currentTime) {
            if (state.burstRemaining > 0) {
                state.burstRemaining--;
                state.nextSendAt = currentTime + sampleBurstDelay(random);
                return "burst";
            }
            const profile = FREQUENCIES[config.frequency];
            if (random() < profile.burstChance) {
                state.burstRemaining = sampleBurstLength(random) - 1;
                state.nextSendAt = currentTime + sampleBurstDelay(random);
                return "burst-start";
            }
            state.nextSendAt = currentTime + sampleRegularDelay(
                config.frequency,
                random
            );
            return "regular";
        }

        async function triggerState(state, overdue) {
            const triggeredAt = now();
            state.lastTriggeredAt = triggeredAt;
            state.triggerCount++;
            const nextKind = planNext(state, triggeredAt);
            await persist();
            if (typeof config.onTrigger === "function") {
                try {
                    await config.onTrigger({
                        identityId: state.id,
                        groupMemberId: state.groupMemberId,
                        overdue: Boolean(overdue),
                        nextSendAt: state.nextSendAt,
                        nextKind
                    });
                } catch (error) {
                    if (typeof config.onError === "function") {
                        config.onError(error);
                    } else if (typeof console !== "undefined") {
                        console.error("[RollingScheduler] trigger failed", error);
                    }
                }
            }
        }

        async function wake() {
            if (!running || wakePromise) return wakePromise;
            wakePromise = (async function () {
                const currentTime = now();
                reconcile(currentTime);
                const due = Object.values(states)
                    .filter(function (state) {
                        return state.nextSendAt <= currentTime;
                    })
                    .sort(function (a, b) {
                        return a.nextSendAt - b.nextSendAt;
                    });

                // At most one overdue opportunity per identity and wake.
                // Old timers are never replayed as a backlog.
                for (const [index, state] of due.entries()) {
                    const overdueAge = currentTime - state.nextSendAt;
                    if (index > 0) {
                        state.burstRemaining = 0;
                        state.nextSendAt = currentTime + sampleRegularDelay(
                            config.frequency,
                            random
                        );
                        continue;
                    }
                    const overdueChance = overdueAge < 6 * 60 * 60 * 1000 ?
                        0.65 : 0.35;
                    if (random() < overdueChance) {
                        await triggerState(state, overdueAge > 1000);
                    } else {
                        state.burstRemaining = 0;
                        state.nextSendAt = currentTime + sampleRegularDelay(
                            config.frequency,
                            random
                        );
                    }
                }
                await persist();
                scheduleWake();
            })().finally(function () {
                wakePromise = null;
            });
            return wakePromise;
        }

        function scheduleWake() {
            if (timer) clearTimer(timer);
            timer = null;
            if (!running) return;
            const currentTime = now();
            reconcile(currentTime);
            const nextAt = Object.values(states).reduce(function (best, state) {
                return Math.min(best, state.nextSendAt);
            }, Infinity);
            const delay = Number.isFinite(nextAt) ?
                Math.max(0, Math.min(MAX_TIMER_DELAY_MS, nextAt - currentTime)) :
                MAX_TIMER_DELAY_MS;
            timer = setTimer(wake, delay);
        }

        async function restore() {
            if (!config.storage || !config.storageKey) return;
            const saved = await config.storage.getItem(config.storageKey);
            if (!saved || !Array.isArray(saved.states)) return;
            saved.states.forEach(function (item) {
                if (
                    !item || !item.id ||
                    !Number.isFinite(Number(item.nextSendAt))
                ) return;
                states[String(item.id)] = {
                    id: String(item.id),
                    groupMemberId: item.groupMemberId || null,
                    nextSendAt: Number(item.nextSendAt),
                    lastTriggeredAt: Number(item.lastTriggeredAt) || null,
                    burstRemaining: Math.max(
                        0,
                        Math.min(MAX_BURST_MESSAGES - 1,
                            Number(item.burstRemaining) || 0)
                    ),
                    triggerCount: Math.max(0, Number(item.triggerCount) || 0)
                };
            });
        }

        async function start(options) {
            await stop({ clear: false });
            config = Object.assign({}, options || {}, {
                frequency: normalizeFrequency(options && options.frequency)
            });
            states = Object.create(null);
            await restore();
            reconcile(now());
            running = true;
            await persist();
            await wake();
            return serialize();
        }

        async function stop(options) {
            running = false;
            if (timer) clearTimer(timer);
            timer = null;
            if (options && options.clear) {
                states = Object.create(null);
                if (config && config.storage && config.storageKey) {
                    await config.storage.removeItem(config.storageKey);
                }
            }
        }

        function snapshot() {
            return Object.assign({ running }, serialize());
        }

        return Object.freeze({ start, stop, wake, snapshot });
    }

    const browserEngine = createEngine();
    window.RollingMessageScheduler = Object.freeze({
        version: VERSION,
        frequencies: FREQUENCIES,
        normalizeFrequency,
        sampleRegularDelay,
        sampleBurstDelay,
        sampleBurstLength,
        createEngine,
        start: browserEngine.start,
        stop: browserEngine.stop,
        wake: browserEngine.wake,
        snapshot: browserEngine.snapshot,
        limits: Object.freeze({
            minimumBurstDelayMs: MINIMUM_BURST_DELAY_MS,
            maximumBurstDelayMs: MAXIMUM_BURST_DELAY_MS,
            maximumBurstMessages: MAX_BURST_MESSAGES
        })
    });
})();
