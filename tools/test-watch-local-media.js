'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '../js/ui/watch-local-media.js'), 'utf8');
const sandbox = { window: {} };
vm.runInNewContext(source, sandbox);
const media = sandbox.window.WatchLocalMedia;
const video = { canPlayType(type) { return type === 'video/mp4' || type === 'video/webm' ? 'maybe' : ''; } };

assert.strictEqual(media.videoError({ name: 'film.mp4', type: 'video/mp4' }, video), '');
assert.strictEqual(media.videoError({ name: 'film.webm', type: 'video/webm' }, video), '');
assert.match(media.videoError({ name: 'film.mkv', type: '' }, video), /MKV/);
assert.match(media.videoError({ name: 'notes.txt', type: '' }, video), /请选择/);

const srt = '\uFEFF1\r\n00:00:01,200 --> 00:00:03,500\r\nこんにちは\r\n\r\n2\r\n00:00:04,000 --> 00:00:06,000\r\nまたね';
const vtt = media.toWebVtt(srt, 'ja.srt');
assert.match(vtt, /^WEBVTT\n\n00:00:01\.200 --> 00:00:03\.500\nこんにちは/);
assert.match(vtt, /00:00:04\.000 --> 00:00:06\.000\nまたね/);
assert.strictEqual(media.toWebVtt('WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n字幕', 'ja.vtt'), 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\n字幕\n');
assert.throws(() => media.toWebVtt('not subtitles', 'ja.srt'), /时间轴/);
assert.throws(() => media.toWebVtt('not subtitles', 'ja.vtt'), /WEBVTT/);
console.log('watch local media tests passed');
