'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const records = new Map();
const storeSandbox = {
    URL,
    window: {
        APP_PREFIX: 'CHAT_APP_V3_',
        localforage: {
            async getItem(key) { return records.has(key) ? records.get(key) : null; },
            async setItem(key, value) { records.set(key, value); },
            async removeItem(key) { records.delete(key); }
        }
    }
};
vm.runInNewContext(read('js/ui/watch-together-store.js'), storeSandbox, { filename: 'watch-together-store.js' });

(async function () {
    const store = storeSandbox.window.WatchTogetherStore;
    const playlistA = await store.savePlaylist('group-a', {
        currentItemId: 'local-1',
        items: [
            { id: 'local-1', name: 'local.mp4', sourceType: 'local', mimeType: 'video/mp4', size: 1234, file: { forbidden: true }, lastPosition: 8 },
            { id: 'remote-1', name: 'remote', sourceType: 'remote', remoteUrl: 'https://example.com/movie.mp4', lastPosition: 12 }
        ]
    });
    await store.savePlaylist('group-b', { items: [{ id: 'b-1', name: 'B', sourceType: 'remote', remoteUrl: 'https://example.org/b.mp4' }] });
    assert.strictEqual(playlistA.items.length, 2);
    assert.strictEqual(playlistA.items[0].needsFile, true);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(playlistA.items[0], 'file'), false);
    assert.strictEqual((await store.loadPlaylist('group-b')).items[0].id, 'b-1');
    assert.strictEqual((await store.loadPlaylist('group-a')).items[0].id, 'local-1');
    assert.strictEqual(store.safeRemoteUrl('javascript:alert(1)'), '');
    assert.strictEqual(store.safeRemoteUrl('data:text/html,x'), '');
    assert(store.safeRemoteUrl('https://example.com/a.mp4').startsWith('https://'));

    await store.saveMessages('group-a', [{ id: 'm1', text: '观影留言', senderType: 'user' }]);
    const exported = await store.exportPayload('group-a', '群聊A');
    const exportText = JSON.stringify(exported);
    assert(!exportText.includes('forbidden'));
    assert(!exportText.includes('audioBlob'));
    assert(!exportText.includes('videoBlob'));
    assert.strictEqual(exported.playlist.items[0].needsFile, true);
    assert.throws(() => store.validateImport({ format: 'wrong', version: 1 }, 'group-a'));
    assert.throws(() => store.validateImport({
        format: 'shiki-watch-together', version: 1,
        playlist: { items: [{ sourceType: 'remote', remoteUrl: 'javascript:alert(1)' }] }, messages: []
    }, 'group-a'));
    const cleanImport = store.validateImport(exported, 'group-c');
    assert.strictEqual(cleanImport.playlist.sessionId, 'group-c');
    assert.strictEqual(cleanImport.playlist.items[0].needsFile, true);

    const watchSource = read('js/ui/watch-together.js');
    const detailSource = read('js/ui/chat-detail.js');
    const searchSource = read('js/ui/message-search.js');
    const mediaSource = read('js/ui/media-preview.js');
    const appSource = read('js/app.js');
    const indexSource = read('index.html');
    assert(watchSource.includes("localInput.multiple = true"));
    assert(watchSource.includes("data-watch-action=\"previous\""));
    assert(watchSource.includes("data-watch-action=\"next\""));
    assert(watchSource.includes("data-watch-item-action"));
    assert(watchSource.includes('playlist.currentItemId'));
    assert(watchSource.includes('global.WatchTogetherStore.exportPayload'));
    assert(watchSource.includes('global.WatchTogetherStore.applyImport'));
    assert(!watchSource.includes('localFiles.setItem'));
    assert(detailSource.includes("row('rename-group'"));
    assert(detailSource.includes('renderGroupMembers'));
    assert(detailSource.includes("global.MessageSearch.open('image')"));
    assert(appSource.includes('target.name = previousName'));
    assert(searchSource.includes('global.MediaPreview.open'));
    assert(searchSource.includes('preview.dataset.previewMessageId'));
    assert(mediaSource.includes("global.open(opener.dataset.previewOpenUrl, '_blank', 'noopener,noreferrer')"));
    assert(mediaSource.includes("media.setAttribute('webkit-playsinline', '')"));
    assert(mediaSource.includes('releaseObjectUrl'));
    assert(indexSource.indexOf('js/ui/media-preview.js') < indexSource.indexOf('js/ui/message-search.js'));
    assert(!watchSource.includes('MutationObserver'));
    assert(!mediaSource.includes('MutationObserver'));
    assert(!watchSource.includes('fetch('));

    let previewCreates = 0;
    let previewRevokes = 0;
    const mediaSandbox = { Blob, URL, window: { URL: {
        createObjectURL() { previewCreates += 1; return 'blob:preview-' + previewCreates; },
        revokeObjectURL() { previewRevokes += 1; }
    } } };
    vm.runInNewContext(mediaSource, mediaSandbox, { filename: 'media-preview.js' });
    const previewLifecycle = mediaSandbox.window.MediaPreview.createObjectUrlLifecycle(mediaSandbox.window.URL);
    for (let i = 0; i < 100; i += 1) previewLifecycle.replace(new Blob(['preview-' + i]));
    previewLifecycle.clear();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(previewLifecycle.stats())), { creates: 100, revokes: 100, active: 0 });

    await store.remove('group-a');
    assert.strictEqual(records.has(store.playlistKey('group-a')), false);
    assert.strictEqual(records.has(store.playlistKey('group-b')), true);

    console.log(JSON.stringify({
        passed: true,
        groupIdentity: true,
        isolatedPlaylists: 2,
        exportedItems: exported.playlist.items.length,
        localVideoBlobPersisted: false,
        unsafeUrlsRejected: true,
        mediaPreview: true,
        previewObjectUrlCreates: previewCreates,
        previewObjectUrlRevokes: previewRevokes,
        previewObjectUrlLeaks: previewLifecycle.stats().active,
        semanticInputs: 0
    }, null, 2));
})().catch(function (error) {
    console.error(error);
    process.exitCode = 1;
});
