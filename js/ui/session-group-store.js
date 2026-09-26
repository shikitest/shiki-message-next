(function (global) {
    'use strict';

    const CONFIG_PREFIX = 'sessionGroupSettingsV1:';
    const AVATAR_PREFIX = 'sessionGroupAvatarV1:';
    const MIGRATION_PREFIX = 'sessionGroupMigrationV1:';

    function storage() {
        if (!global.localforage) throw new Error('Session group storage is unavailable');
        return global.localforage;
    }

    function key(suffix) {
        return String(global.APP_PREFIX || 'SHIKI_NEXT_') + suffix;
    }

    function memberId(value) {
        return value || ('gcm_' + Date.now() + '_' + Math.random().toString(36).slice(2, 9));
    }

    function avatarKey(sessionId, id) {
        return key(AVATAR_PREFIX + String(sessionId) + ':' + String(id));
    }

    function sanitizeMember(member) {
        const input = member && typeof member === 'object' ? member : {};
        const id = memberId(input.id);
        return {
            id: id,
            name: String(input.name || '群成员').slice(0, 40),
            avatarRef: typeof input.avatarRef === 'string' && input.avatarRef
                ? input.avatarRef
                : null
        };
    }

    function sanitize(sessionId, input, enabledDefault) {
        const source = input && typeof input === 'object' ? input : {};
        const now = Date.now();
        return {
            version: 1,
            sessionId: String(sessionId),
            enabled: typeof source.enabled === 'boolean' ? source.enabled : enabledDefault === true,
            showAvatar: source.showAvatar !== false,
            showName: source.showName !== false,
            members: Array.isArray(source.members) ? source.members.map(sanitizeMember) : [],
            createdAt: Number.isFinite(Number(source.createdAt)) ? Number(source.createdAt) : now,
            updatedAt: Number.isFinite(Number(source.updatedAt)) ? Number(source.updatedAt) : now
        };
    }

    async function get(sessionId) {
        const id = String(sessionId || '');
        if (!id) return null;
        const saved = await storage().getItem(key(CONFIG_PREFIX + id));
        return saved ? sanitize(id, saved, false) : null;
    }

    async function save(sessionId, config) {
        const id = String(sessionId || '');
        if (!id) throw new Error('Session id is required');
        const clean = sanitize(id, config, true);
        clean.updatedAt = Date.now();
        await storage().setItem(key(CONFIG_PREFIX + id), clean);
        return clean;
    }

    async function create(sessionId) {
        const existing = await get(sessionId);
        if (existing) return existing;
        return save(sessionId, { enabled: true, showAvatar: true, showName: true, members: [] });
    }

    async function setMemberAvatar(sessionId, id, value) {
        const target = avatarKey(sessionId, id);
        if (value) await storage().setItem(target, value);
        else await storage().removeItem(target);
        return value ? target : null;
    }

    async function hydrate(sessionId, config) {
        const clean = sanitize(sessionId, config, false);
        await Promise.all(clean.members.map(async function (member) {
            const ref = member.avatarRef || avatarKey(sessionId, member.id);
            try { member.avatar = ref ? await storage().getItem(ref) : null; }
            catch (error) { member.avatar = null; }
        }));
        return clean;
    }

    async function migrateLegacy(sessionId, legacy) {
        const id = String(sessionId || '');
        if (!id) throw new Error('Session id is required');
        const existing = await get(id);
        if (existing) return hydrate(id, existing);
        const marker = key(MIGRATION_PREFIX + id);
        if (await storage().getItem(marker)) return null;
        const source = legacy && typeof legacy === 'object' ? legacy : {};
        const clean = sanitize(id, source, true);
        for (let i = 0; i < clean.members.length; i += 1) {
            const member = clean.members[i];
            const legacyMember = Array.isArray(source.members) ? source.members[i] || {} : {};
            let avatar = legacyMember.avatar || null;
            if (!avatar) {
                const legacyRef = legacyMember.avatarRef || ('gca_' + member.id);
                try { avatar = await storage().getItem(legacyRef); } catch (error) {}
            }
            member.avatarRef = await setMemberAvatar(id, member.id, avatar);
        }
        await save(id, clean);
        await storage().setItem(marker, { migratedAt: Date.now() });
        return hydrate(id, clean);
    }

    async function removeMemberAvatar(sessionId, id) {
        await storage().removeItem(avatarKey(sessionId, id));
    }

    async function remove(sessionId) {
        const id = String(sessionId || '');
        if (!id) return;
        const config = await get(id);
        if (config) {
            await Promise.all(config.members.map(function (member) {
                return removeMemberAvatar(id, member.id).catch(function () {});
            }));
        }
        await storage().removeItem(key(CONFIG_PREFIX + id));
        await storage().removeItem(key(MIGRATION_PREFIX + id));
    }

    global.SessionGroupStore = Object.freeze({
        version: '1.0.0',
        configKey: function (sessionId) { return key(CONFIG_PREFIX + String(sessionId)); },
        avatarKey: avatarKey,
        sanitize: sanitize,
        get: get,
        save: save,
        create: create,
        hydrate: hydrate,
        migrateLegacy: migrateLegacy,
        setMemberAvatar: setMemberAvatar,
        removeMemberAvatar: removeMemberAvatar,
        remove: remove
    });
})(window);
