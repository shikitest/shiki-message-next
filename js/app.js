document.addEventListener('DOMContentLoaded', async () => {
    const loaderBar = document.getElementById('loader-tech-bar');
    const welcomeSubtitle = document.querySelector('.welcome-subtitle-scramble');
    const welcomeScreen = document.getElementById('welcome-animation');
    const disclaimerModal = document.getElementById('disclaimer-modal');
    const acceptDisclaimerBtn = document.getElementById('accept-disclaimer');

    const updateLoader = (text, width) => {
        if (welcomeSubtitle) welcomeSubtitle.textContent = text;
        if (loaderBar) loaderBar.style.width = width;
    };

    const hideWelcomeScreen = () => {
        if (!welcomeScreen) return;
        welcomeScreen.style.display = 'none';
    };

    const wakeRollingScheduler = () => {
        if (
            !window.RollingMessageScheduler ||
            typeof window.RollingMessageScheduler.wake !== 'function'
        ) return;
        try {
            const wakeResult = window.RollingMessageScheduler.wake();
            if (wakeResult && typeof wakeResult.catch === 'function') {
                wakeResult.catch(error => console.warn('[resume] 主动消息检查失败:', error));
            }
        } catch (error) {
            console.warn('[resume] 主动消息检查失败:', error);
        }
    };

    hideWelcomeScreen();

    const safeAwait = async (promise, fallback = null) => {
        try {
            return await promise;
        } catch (error) {
            console.error('操作失败:', error);
            return fallback;
        }
    };

    try {
        try { setupEventListeners?.(); } catch(e) { console.error('setupEventListeners:', e); }

        if (typeof localforage === 'undefined') {
            console.warn('LocalForage 未加载，将使用 NextStorage.local 降级方案');
        }

        try {
            const emergencyBackupRaw = NextStorage.local.getItem('BACKUP_V1_critical');
            if (emergencyBackupRaw) {
                const emergencyBackup = JSON.parse(emergencyBackupRaw);
                if (emergencyBackup && Array.isArray(emergencyBackup.messages) && emergencyBackup.messages.length > 0) {
                    console.warn('[boot] 检测到紧急备份，可用于异常恢复');
                }
            }
        } catch (e) {
            console.warn('[boot] 紧急备份检查失败:', e);
        }

        updateLoader('正在建立安全连接...', '10%');
        await NextBackup.recover();
        await NextModel.load();
        sessionList = NextRuntime.sessions();
        await localforage.setItem(APP_PREFIX + 'sessionList', sessionList);
        await initializeSession();

        if (window.SessionGroupStore && window.ConversationMetaStore && typeof window.activateGroupChatSession === 'function') {
            await safeAwait(window.ConversationMetaStore.load());
            const legacyGroupEnabled = Boolean(
                typeof groupChatSettings !== 'undefined' && groupChatSettings && groupChatSettings.enabled
            );
            const currentConversationMeta = window.ConversationMetaStore.get(SESSION_ID, {
                isCurrent: true,
                legacyGroupEnabled: legacyGroupEnabled
            });
            await safeAwait(window.activateGroupChatSession(SESSION_ID, {
                isGroup: currentConversationMeta.type === 'group' || currentConversationMeta.legacyGroup,
                migrateLegacy: currentConversationMeta.legacyGroup === true
            }));
        }

        updateLoader('正在读取记忆存档...', '40%');
await safeAwait(loadData());
        await NextRuntime.boot();
        if (
            window.TranslationHelper &&
            typeof window.TranslationHelper.syncUI === 'function'
        ) {
            window.TranslationHelper.syncUI();
        }

        let appShellReady = false;
        if (
            window.ShikiAppShell &&
            typeof window.ShikiAppShell.initialize === 'function'
        ) {
            try {
                await window.ShikiAppShell.initialize({
                getSessions: () => NextRuntime.sessions(),
                getCurrentSessionId: () => SESSION_ID,
                getMessages: () => Array.isArray(messages) ? messages.slice() : [],
                getMyName: () => settings.myName || '我',
                getPartnerName: () => settings.partnerName || '对方',
                getPartnerStatus: () => settings.partnerStatus || '在线',
                getGroupMembers: () => typeof window.getGroupChatMembers === 'function' ? window.getGroupChatMembers() : [],
                getGroupMemberById: memberId => typeof window.getGroupMemberById === 'function' ? window.getGroupMemberById(memberId) : null,
                getLegacyGroupEnabled: () => Boolean(
                    typeof groupChatSettings !== 'undefined' &&
                    groupChatSettings &&
                    groupChatSettings.enabled
                ),
                createSession: () => createNewSession(false),
                renameSession: async (sessionId, name) => {
                    const group = NextModel.conversation(sessionId);
                    if (group && group.type === 'group') {
                        await NextModel.updateGroup(sessionId, name, group.friendIds);
                        await NextRuntime.sync();
                        NextRuntime.applyCurrent();
                        return;
                    }
                    const target = sessionList.find(item => String(item.id) === String(sessionId));
                    if (!target) throw new Error('New session was not found');
                    const previousName = target.name;
                    target.name = name;
                    try {
                        await localforage.setItem(`${APP_PREFIX}sessionList`, sessionList);
                    } catch (error) {
                        target.name = previousName;
                        throw error;
                    }
                },
                rollbackNewSession: async (sessionId) => {
                    const previousList = Array.isArray(sessionList) ? sessionList.slice() : [];
                    const nextList = previousList.filter(item => String(item.id) !== String(sessionId));
                    try {
                        await localforage.setItem(`${APP_PREFIX}sessionList`, nextList);
                        sessionList = nextList;
                    } catch (error) {
                        sessionList = previousList;
                        throw error;
                    }
                    const cleanupTasks = [];
                    if (window.ConversationMetaStore) cleanupTasks.push(window.ConversationMetaStore.remove(sessionId));
                    if (window.SessionGroupStore) cleanupTasks.push(window.SessionGroupStore.remove(sessionId));
                    if (window.ConversationAvatarStore) cleanupTasks.push(window.ConversationAvatarStore.remove(sessionId));
                    if (window.WatchTogetherStore) cleanupTasks.push(window.WatchTogetherStore.remove(sessionId));
                    if (window.MemberReplyStore) cleanupTasks.push(window.MemberReplyStore.removeSession(sessionId));
                    if (window.SessionRuntimeStore) window.SessionRuntimeStore.remove(sessionId);
                    try {
                        NextStorage.local.removeItem('BACKUP_V1_critical:' + sessionId);
                        NextStorage.local.removeItem('BACKUP_V1_timestamp:' + sessionId);
                    } catch (error) {
                        console.warn('[AppShell] 新会话紧急日志清理失败:', error);
                    }
                    await Promise.all(cleanupTasks.map(task => Promise.resolve(task).catch(error => {
                        console.warn('[AppShell] 新会话附属数据清理失败:', error);
                    })));
                },
                createGroupSession: sessionId => window.SessionGroupStore
                    ? window.SessionGroupStore.create(sessionId)
                    : Promise.resolve(null),
                locateMessageById: messageId => new Promise(resolve => {
                    const targetExists = messages.some(message => String(message.id) === String(messageId));
                    if (!targetExists) {
                        if (typeof showNotification === 'function') showNotification('没有找到这条消息', 'warning');
                        resolve(false);
                        return;
                    }
                    if (typeof renderMessagesAround !== 'function' || !renderMessagesAround(messageId, 60)) {
                        if (typeof showNotification === 'function') showNotification('消息暂时无法定位', 'warning');
                        resolve(false);
                        return;
                    }
                    requestAnimationFrame(() => {
                        const target = Array.from(DOMElements.chatContainer.querySelectorAll('.message-wrapper,[data-id]')).find(node => String(node.dataset.id || node.dataset.msgId) === String(messageId));
                        if (!target) {
                            if (typeof showNotification === 'function') showNotification('消息暂时无法定位', 'warning');
                            resolve(false);
                            return;
                        }
                        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        target.classList.add('shiki-message-located');
                        if (window._shikiLocateHighlightTimer) clearTimeout(window._shikiLocateHighlightTimer);
                        window._shikiLocateHighlightTimer = setTimeout(() => {
                            target.classList.remove('shiki-message-located');
                            window._shikiLocateHighlightTimer = null;
                        }, 1800);
                        resolve(true);
                    });
                }),
                openClearMessages: () => {
                    if (typeof clearAllAppData === 'function') clearAllAppData();
                },
                notify: (message, type) => {
                    if (typeof showNotification === 'function') {
                        showNotification(message, type || 'info');
                    }
                }
                });
                appShellReady = true;
                NextUI.initialize();
            } catch (error) {
                console.error('[AppShell] 初始化失败，恢复原聊天界面:', error);
                const shell = document.getElementById('shiki-app-shell');
                if (shell) shell.hidden = true;
                document.body.classList.remove('shiki-primary-view-active');
                document.body.classList.add('shiki-chat-view-active');
            } finally {
                document.documentElement.removeAttribute('data-shell-booting');
            }
        }
        if (!appShellReady && !window.ShikiAppShell) {
            document.documentElement.removeAttribute('data-shell-booting');
            document.body.classList.add('shiki-chat-view-active');
        }


// ============================================================
// 照片集：单聊对象每日 10% 随机照片
// ============================================================

try {

    /*
     * 这一阶段先只处理普通单聊。
     *
     * 群聊的“每个成员每天独立 10%”
     * 下一阶段单独接入。
     */

    const isGroupChat =
        (
            typeof groupChatSettings !==
            "undefined"
        ) &&
        groupChatSettings &&
        groupChatSettings.enabled;


    if (
        !isGroupChat &&
        window.PhotoAlbum &&
        typeof window.PhotoAlbum.runDailyPhotoCheck ===
        "function"
    ) {

        const dailyPartnerOwner = {

            ownerType:
                "partner",

            ownerId:
                "partner_" +
                (SESSION_ID || "default"),

            ownerName:
                settings.partnerName ||
                "对方",

            conversationId:
                SESSION_ID || null

        };


        const dailyPhotoResult =
            await window.PhotoAlbum
                .runDailyPhotoCheck(
                    dailyPartnerOwner
                );


        /*
         * 不弹通知。
         *
         * 用户只有自己打开照片集时，
         * 才会发现对方今天新增了一张照片。
         *
         * 这样更像“对方自己的相册生活”。
         */

        if (
            dailyPhotoResult &&
            dailyPhotoResult.triggered &&
            !dailyPhotoResult.alreadyChecked
        ) {

            console.log(
                "[PhotoAlbum] 今日随机照片已生成：",
                dailyPartnerOwner.ownerName
            );

        }

    }
// ============================================================
// 照片集：群聊成员每日 10% 随机照片
// ============================================================

if (
    isGroupChat &&
    window.PhotoAlbum &&
    typeof window.PhotoAlbum.runDailyPhotoCheck === "function" &&
    typeof window.getGroupChatMembers === "function"
) {

    const groupMembers =
        window.getGroupChatMembers();


    if (
        Array.isArray(groupMembers) &&
        groupMembers.length > 0
    ) {

        /*
         * 每个成员独立进行一次每日判定。
         *
         * 例如 3 个成员：
         *
         * A：10%
         * B：10%
         * C：10%
         *
         * 互相完全独立。
         */

        for (
            const member
            of groupMembers
        ) {

            if (
                !member ||
                !member.id
            ) {
                continue;
            }


            try {

                const dailyMemberOwner = {

                    ownerType:
                        "group-member",

                    ownerId:
                        member.id,

                    ownerName:
                        member.name ||
                        "群成员",

                    conversationId:
                        SESSION_ID ||
                        null,

                    groupId:
                        SESSION_ID ||
                        null

                };


                const result =
                    await window.PhotoAlbum
                        .runDailyPhotoCheck(
                            dailyMemberOwner
                        );


                if (
                    result &&
                    result.triggered &&
                    !result.alreadyChecked
                ) {

                    console.log(
                        "[PhotoAlbum] 群成员今日生成随机照片：",
                        dailyMemberOwner.ownerName
                    );

                }

            } catch (
                memberPhotoError
            ) {

                /*
                 * 某一个成员出错，
                 * 不能影响其他成员。
                 */

                console.warn(
                    "[PhotoAlbum] 群成员每日照片检查失败：",
                    member &&
                    member.name,
                    memberPhotoError
                );

            }

        }

    }

}


} catch (error) {

    /*
     * 照片系统出错也绝不能阻止主网站启动。
     */

    console.warn(
        "[PhotoAlbum] 每日照片检查失败：",
        error
    );

}


updateLoader('正在渲染我们的世界...', '70%');
        await Promise.allSettled([
            safeAwait(initializeRandomUI?.()),
            safeAwait(initMusicPlayer?.())
        ]);
        wakeRollingScheduler();

        setInterval(checkStatusChange, 60000);

        if (
            disclaimerModal &&
            document.documentElement.getAttribute('data-skip-opening') !== 'true'
        ) {
            const tourSeen = await safeAwait(localforage?.getItem(APP_PREFIX + 'tour_seen'), false);

            if (!tourSeen) {
                showModal(disclaimerModal);

                if (acceptDisclaimerBtn && !acceptDisclaimerBtn._bound) {
                    acceptDisclaimerBtn._bound = true;
                    acceptDisclaimerBtn.addEventListener('click', () => {
                        hideModal(disclaimerModal);
                        localforage?.setItem(APP_PREFIX + 'tour_seen', true).catch(() => {});
                        startTour?.();
                    }, { once: true });
                }
            }
        }

        updateLoader('连接成功，欢迎回来。', '100%');
        hideWelcomeScreen();

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                try { _backupCriticalData(); } catch (e) { console.warn('[visibilitychange] 紧急备份失败:', e); }
                try {
                    const p = typeof window.flushThrottledSaveData === 'function'
                        ? window.flushThrottledSaveData(SESSION_ID).then(function () { return saveData(SESSION_ID); })
                        : saveData(SESSION_ID);
                    if (p && typeof p.catch === 'function') {
                        p.catch(e => console.error('[visibilitychange] 保存失败:', e));
                    }
                } catch (e) {
                    console.error('[visibilitychange] 保存失败:', e);
                }
            } else if (document.visibilityState === 'visible') {
                wakeRollingScheduler();
                try {
                    const backup = typeof _tryRecoverFromBackup === 'function' ? _tryRecoverFromBackup() : null;
                    if (backup && Array.isArray(backup.messages) && backup.messages.length > 0 && Array.isArray(messages) && backup.messages.length > messages.length) {
                        console.warn('[visibilitychange] 检测到备份消息比当前更多，自动尝试恢复');
                        try {
                            messages = backup.messages.map(m => ({
                                ...m,
                                timestamp: new Date(m.timestamp)
                            }));
                            if (backup.settings) Object.assign(settings, backup.settings);
                            if (typeof updateUI === 'function') updateUI();
                            if (typeof throttledSaveData === 'function') throttledSaveData();
                            showNotification('已自动恢复本地临时备份内容', 'warning', 3500);
                        } catch (restoreErr) {
                            console.warn('[visibilitychange] 自动恢复失败，保留当前页面内容:', restoreErr);
                        }
                    }
                } catch (e) {
                    console.warn('[visibilitychange] 恢复备份失败:', e);
                }
                if (
                    window.TranslationHelper &&
                    typeof window.TranslationHelper.syncUI === 'function'
                ) {
                    window.TranslationHelper.syncUI();
                }
            }
        });

        window.addEventListener('pageshow', () => {
            wakeRollingScheduler();
            if (
                window.TranslationHelper &&
                typeof window.TranslationHelper.syncUI === 'function'
            ) {
                window.TranslationHelper.syncUI();
            }
        });

        window.addEventListener('pagehide', () => {
            try { _backupCriticalData(); } catch (e) {}
        });

        window.addEventListener('beforeunload', () => {
            try { _backupCriticalData(); } catch (e) {}
        });

        setInterval(() => {
            saveData().catch(e => console.warn('[autoBackup] 定时保存失败:', e));
        }, 3 * 60 * 1000);

        (() => {
            const REMIND_KEY = 'exportReminderLastShown';
            const last = parseInt(NextStorage.local.getItem(REMIND_KEY) || '0', 10);
            const daysSince = (Date.now() - last) / (1000 * 60 * 60 * 24);
            if (daysSince >= 7) {
                setTimeout(() => {
                    showNotification('建议定期导出备份，防止数据意外丢失', 'info', 7000);
                    NextStorage.local.setItem(REMIND_KEY, String(Date.now()));
                }, 8000);
            }
        })();

    } catch (err) {
        console.error('严重初始化错误:', err);
        document.documentElement.removeAttribute('data-shell-booting');
        document.body.classList.remove('shiki-primary-view-active');
        document.body.classList.add('shiki-chat-view-active');
        try {
            const backup = typeof _tryRecoverFromBackup === 'function' ? _tryRecoverFromBackup() : null;
            if (backup && Array.isArray(backup.messages) && backup.messages.length > 0) {
                messages = backup.messages.map(m => ({
                    ...m,
                    timestamp: new Date(m.timestamp)
                }));
                if (backup.settings) Object.assign(settings, backup.settings);
                if (typeof updateUI === 'function') updateUI();
                showNotification('初始化异常，已使用本地紧急备份恢复', 'warning', 5000);
            }
        } catch (recoverErr) {
            console.warn('[boot] 初始化失败后的恢复也失败:', recoverErr);
        }
        updateLoader('加载遇到问题，已强制进入...', '100%');
        hideWelcomeScreen();
    }
});
const stickerInput = document.getElementById('sticker-file-input');
            if (stickerInput) {
                stickerInput.addEventListener('change', async (e) => {
                    const files = Array.from(e.target.files);
                    if (!files.length) return;

                    const oversized = files.filter(f => f.size > 2 * 1024 * 1024);
                    if (oversized.length > 0) {
                        showNotification(oversized.length + ' 张图片超过 2MB 限制，已跳过', 'warning');
                    }

                    const validFiles = files.filter(f => f.size <= 2 * 1024 * 1024);
                    if (!validFiles.length) return;

                    showNotification('正在批量处理 ' + validFiles.length + ' 张图片...', 'info');

                    let successCount = 0;
                    let failCount = 0;

                    for (const file of validFiles) {
                        try {
                            const base64 = await optimizeImage(file, 300, 0.8);
                            stickerLibrary.push(base64);
                            successCount++;
                        } catch (err) {
                            console.error(err);
                            failCount++;
                        }
                    }

                    throttledSaveData();
                    renderReplyLibrary();

                    if (failCount > 0) {
                        showNotification('上传完成：' + successCount + ' 张成功，' + failCount + ' 张失败', 'warning');
                    } else {
                        showNotification('上传成功，共 ' + successCount + ' 张', 'success');
                    }

                    e.target.value = '';
                });
            }
const myStickerQuickUpload = document.getElementById('my-sticker-quick-upload');
if (myStickerQuickUpload) {
    myStickerQuickUpload.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        const oversized = files.filter(f => f.size > 2 * 1024 * 1024);
        if (oversized.length > 0) showNotification(oversized.length + ' 张图片超过 2MB，已跳过', 'warning');
        const validFiles = files.filter(f => f.size <= 2 * 1024 * 1024);
        if (!validFiles.length) return;
        showNotification('正在处理 ' + validFiles.length + ' 张...', 'info');
        let ok = 0, fail = 0;
        for (const file of validFiles) {
            try {
                const base64 = await optimizeImage(file, 300, 0.8);
                myStickerLibrary.push(base64);
                ok++;
            } catch(err) { fail++; }
        }
        throttledSaveData();
        if (typeof renderComboContent === 'function') renderComboContent('my-sticker');
        showNotification(fail > 0 ? `上传完成：${ok} 成功 ${fail} 失败` : `✓ 已添加 ${ok} 张到我的表情库`, fail > 0 ? 'warning' : 'success');
        e.target.value = '';
    });
}

window.addEventListener('load', function() {
    setTimeout(function() {
        try {
            if (NextStorage.local.getItem('dailyGreetingShown') === new Date().toDateString()) return;
            try { if (typeof checkPartnerDailyMood === 'function') checkPartnerDailyMood(); } catch(e2) { console.warn('checkPartnerDailyMood error:', e2); }
            if (typeof _buildDailyGreeting === 'function') _buildDailyGreeting();
            if (window.localforage && window.APP_PREFIX) {
                localforage.getItem(window.APP_PREFIX + 'tour_seen').then(function(seen) {
                    if (seen) {
                        var modal = document.getElementById('daily-greeting-modal');
                        if (modal) modal.classList.remove('hidden');
                        NextStorage.local.setItem('dailyGreetingShown', new Date().toDateString());
                    }
                }).catch(function() {
                    var modal = document.getElementById('daily-greeting-modal');
                    if (modal) modal.classList.remove('hidden');
                    NextStorage.local.setItem('dailyGreetingShown', new Date().toDateString());
                });
            } else {
                var modal = document.getElementById('daily-greeting-modal');
                if (modal) modal.classList.remove('hidden');
                NextStorage.local.setItem('dailyGreetingShown', new Date().toDateString());
            }
        } catch(e) { console.warn('Daily greeting timing error:', e); }
    }, 4500);
}, { once: true });
