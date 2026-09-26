(function (global) {
    'use strict';

    let context = null;
    let overlay = null;
    let dateIndex = null;
    let indexedMessages = null;
    let visibleYear = 0;
    let visibleMonth = 0;
    let initialized = false;
    let indexBuilds = 0;
    let minimumMonth = null;
    let maximumMonth = null;
    let monthRenderQueued = false;

    function normalizeMessageTimestamp(value) {
        if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : null;
        if (typeof value === 'number') {
            const milliseconds = value > 0 && value < 1e12 ? value * 1000 : value;
            const date = new Date(milliseconds);
            return Number.isFinite(date.getTime()) ? date : null;
        }
        if (typeof value === 'string' && value.trim()) {
            const numeric = Number(value);
            if (Number.isFinite(numeric) && /^\d+(?:\.\d+)?$/.test(value.trim())) {
                return normalizeMessageTimestamp(numeric);
            }
            const date = new Date(value);
            return Number.isFinite(date.getTime()) ? date : null;
        }
        return null;
    }

    function pad(value) { return String(value).padStart(2, '0'); }

    function getLocalDateKey(value) {
        const date = normalizeMessageTimestamp(value);
        if (!date) return null;
        return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    }

    function messageTimestamp(message) {
        if (!message || typeof message !== 'object') return null;
        const candidates = [message.timestamp, message.createdAt, message.time, message.date];
        for (let i = 0; i < candidates.length; i += 1) {
            const date = normalizeMessageTimestamp(candidates[i]);
            if (date) return date;
        }
        return null;
    }

    function buildDateIndex(messages) {
        const index = Object.create(null);
        let invalidCount = 0;
        (Array.isArray(messages) ? messages : []).forEach(function (message) {
            const date = messageTimestamp(message);
            const key = getLocalDateKey(date);
            if (!key) {
                invalidCount += 1;
                return;
            }
            if (!index[key]) {
                index[key] = { count: 0, firstMessageId: message.id, lastMessageId: message.id };
            }
            index[key].count += 1;
            index[key].lastMessageId = message.id;
        });
        Object.defineProperty(index, 'invalidCount', { value: invalidCount, enumerable: false });
        return index;
    }

    function buildCalendarMonth(year, month) {
        const firstWeekday = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const cells = [];
        for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
        for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
        while (cells.length % 7) cells.push(null);
        return { year: year, month: month, firstWeekday: firstWeekday, daysInMonth: daysInMonth, cells: cells };
    }

    function make(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function build() {
        overlay = make('section', 'shiki-record-page shiki-date-page');
        overlay.id = 'shiki-message-date-search';
        overlay.hidden = true;
        overlay.innerHTML = [
            '<header class="shiki-record-header">',
            '<button type="button" data-date-action="close" aria-label="返回"><i class="fas fa-chevron-left"></i></button>',
            '<h2>按日期查找</h2><button type="button" data-date-action="today">今天</button>',
            '</header>',
            '<div class="shiki-calendar-nav">',
            '<button type="button" data-date-action="previous" aria-label="上个月"><i class="fas fa-chevron-left"></i></button>',
            '<label class="shiki-calendar-month-picker"><strong id="shiki-calendar-title"></strong><input id="shiki-calendar-month" type="month" aria-label="选择年月"></label>',
            '<button type="button" data-date-action="next" aria-label="下个月"><i class="fas fa-chevron-right"></i></button>',
            '</div>',
            '<div class="shiki-calendar-week"><span>日</span><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span></div>',
            '<div class="shiki-calendar-grid" id="shiki-calendar-grid"></div>',
            '<p class="shiki-calendar-hint" id="shiki-calendar-hint"></p>'
        ].join('');
        document.body.appendChild(overlay);
        overlay.addEventListener('click', handleClick);
        overlay.addEventListener('change', handleChange);
    }

    function monthValue(year, month) { return year * 12 + month; }
    function monthFromValue(value) { return { year: Math.floor(value / 12), month: value % 12 }; }
    function setVisibleMonth(value) {
        if (minimumMonth !== null) value = Math.max(minimumMonth, value);
        if (maximumMonth !== null) value = Math.min(maximumMonth, value);
        const next = monthFromValue(value);
        visibleYear = next.year;
        visibleMonth = next.month;
    }

    function render() {
        if (!overlay || !dateIndex) return;
        overlay.querySelector('#shiki-calendar-title').textContent = visibleYear + '年' + (visibleMonth + 1) + '月';
        const picker = overlay.querySelector('#shiki-calendar-month');
        picker.value = visibleYear + '-' + pad(visibleMonth + 1);
        picker.min = minimumMonth === null ? '' : monthFromValue(minimumMonth).year + '-' + pad(monthFromValue(minimumMonth).month + 1);
        picker.max = maximumMonth === null ? '' : monthFromValue(maximumMonth).year + '-' + pad(monthFromValue(maximumMonth).month + 1);
        overlay.querySelector('[data-date-action="previous"]').disabled = minimumMonth !== null && monthValue(visibleYear, visibleMonth) <= minimumMonth;
        overlay.querySelector('[data-date-action="next"]').disabled = maximumMonth !== null && monthValue(visibleYear, visibleMonth) >= maximumMonth;
        const grid = overlay.querySelector('#shiki-calendar-grid');
        const calendar = buildCalendarMonth(visibleYear, visibleMonth);
        const todayKey = getLocalDateKey(new Date());
        const fragment = document.createDocumentFragment();
        calendar.cells.forEach(function (day) {
            if (!day) {
                fragment.appendChild(make('span', 'shiki-calendar-blank'));
                return;
            }
            const key = visibleYear + '-' + pad(visibleMonth + 1) + '-' + pad(day);
            const record = dateIndex[key];
            const button = make('button', 'shiki-calendar-day', String(day));
            button.type = 'button';
            button.dataset.dateKey = key;
            button.disabled = !record;
            if (key === todayKey) {
                button.classList.add('today');
                button.appendChild(make('small', '', '今天'));
            }
            if (record) {
                button.classList.add('has-messages');
                button.title = record.count + ' 条消息';
                button.appendChild(make('span', 'shiki-calendar-count', String(record.count)));
            }
            fragment.appendChild(button);
        });
        grid.replaceChildren(fragment);
        const invalid = dateIndex.invalidCount || 0;
        overlay.querySelector('#shiki-calendar-hint').textContent = invalid ? invalid + ' 条旧消息缺少有效时间，未列入日历' : '深色日期表示当天有聊天记录';
    }

    function latestDate(messages) {
        for (let i = messages.length - 1; i >= 0; i -= 1) {
            const date = messageTimestamp(messages[i]);
            if (date) return date;
        }
        return new Date();
    }

    function open() {
        indexedMessages = context && context.getMessages ? context.getMessages() : [];
        dateIndex = buildDateIndex(indexedMessages);
        indexBuilds += 1;
        const validKeys = Object.keys(dateIndex).sort();
        if (validKeys.length) {
            const first = validKeys[0].split('-').map(Number);
            const last = validKeys[validKeys.length - 1].split('-').map(Number);
            minimumMonth = monthValue(first[0], first[1] - 1);
            maximumMonth = monthValue(last[0], last[1] - 1);
        } else {
            minimumMonth = maximumMonth = monthValue(new Date().getFullYear(), new Date().getMonth());
        }
        const initial = latestDate(indexedMessages);
        setVisibleMonth(monthValue(initial.getFullYear(), initial.getMonth()));
        render();
        overlay.hidden = false;
        document.body.classList.add('shiki-record-page-active');
    }

    function close() {
        if (overlay) overlay.hidden = true;
        dateIndex = null;
        indexedMessages = null;
        minimumMonth = null;
        maximumMonth = null;
        document.body.classList.remove('shiki-record-page-active');
    }

    function shiftMonth(delta) {
        if (monthRenderQueued) return;
        monthRenderQueued = true;
        setVisibleMonth(monthValue(visibleYear, visibleMonth) + delta);
        (global.requestAnimationFrame || function (callback) { return setTimeout(callback, 0); })(function () {
            monthRenderQueued = false;
            render();
        });
    }

    function handleChange(event) {
        if (event.target.id !== 'shiki-calendar-month' || !/^\d{4}-\d{2}$/.test(event.target.value)) return;
        const parts = event.target.value.split('-').map(Number);
        setVisibleMonth(monthValue(parts[0], parts[1] - 1));
        render();
    }

    async function handleClick(event) {
        const action = event.target.closest('[data-date-action]');
        if (action) {
            if (action.dataset.dateAction === 'close') return close();
            if (action.dataset.dateAction === 'previous') return shiftMonth(-1);
            if (action.dataset.dateAction === 'next') return shiftMonth(1);
            if (action.dataset.dateAction === 'today') {
                const now = new Date();
                setVisibleMonth(monthValue(now.getFullYear(), now.getMonth()));
                return render();
            }
        }
        const day = event.target.closest('[data-date-key]');
        if (!day || day.disabled || !dateIndex) return;
        const record = dateIndex[day.dataset.dateKey];
        if (!record) return;
        close();
        if (context && context.locateMessageById) await context.locateMessageById(record.firstMessageId);
    }

    function initialize(nextContext) {
        if (initialized) return;
        context = nextContext || {};
        build();
        initialized = true;
    }

    global.MessageDateSearch = Object.freeze({
        initialize: initialize,
        open: open,
        close: close,
        normalizeMessageTimestamp: normalizeMessageTimestamp,
        getLocalDateKey: getLocalDateKey,
        buildDateIndex: buildDateIndex,
        buildCalendarMonth: buildCalendarMonth,
        getDebugSnapshot: function () {
            return { initialized: initialized, open: Boolean(overlay && !overlay.hidden), indexBuilds: indexBuilds, indexed: dateIndex ? Object.keys(dateIndex).length : 0, minimumMonth: minimumMonth, maximumMonth: maximumMonth };
        }
    });
})(window);
