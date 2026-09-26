(function () {
    "use strict";

    const api = window.RandomIMECustomLexicon;
    if (!api || !document.body) return;

    const POS_LABELS = Object.freeze({
        noun: "名词",
        verb: "动词",
        adjective: "形容词",
        adverb: "副词",
        particle: "助词",
        conjunction: "接续词",
        fragment: "感叹/碎片",
        other: "其他"
    });
    const WEIGHT_LABELS = Object.freeze({ low: "低", normal: "普通", high: "高" });
    let editingId = null;
    let query = "";

    function notify(message, type) {
        if (typeof window.showNotification === "function") {
            window.showNotification(message, type || "success");
        } else {
            console.log("[IME Custom Lexicon]", message);
        }
    }

    function buildModal() {
        if (document.getElementById("ime-custom-lexicon-modal")) return;
        const modal = document.createElement("div");
        modal.className = "modal";
        modal.id = "ime-custom-lexicon-modal";
        modal.innerHTML = `
            <div class="modal-content ime-custom-lexicon-content">
                <div class="modal-title">
                    <i class="fas fa-language"></i><span>IME 自定义词库</span>
                </div>
                <div class="ime-lexicon-toolbar">
                    <div class="ime-lexicon-search-wrap">
                        <i class="fas fa-search"></i>
                        <input id="ime-lexicon-search" type="search" placeholder="搜索词语或读音">
                    </div>
                    <button class="modal-btn modal-btn-primary" id="ime-lexicon-add"><i class="fas fa-plus"></i> 添加词语</button>
                </div>
                <div id="ime-lexicon-editor" class="ime-lexicon-editor" hidden>
                    <div class="ime-lexicon-editor-title" id="ime-lexicon-editor-title">添加词语</div>
                    <div class="ime-lexicon-form-grid">
                        <label><span>词语</span><input id="ime-lexicon-text" class="modal-input" placeholder="例：五条悟"></label>
                        <label><span>读音</span><input id="ime-lexicon-reading" class="modal-input" placeholder="例：ごじょうさとる"></label>
                        <label><span>词性</span><select id="ime-lexicon-pos" class="modal-input"></select></label>
                        <label><span>权重</span><select id="ime-lexicon-weight" class="modal-input">
                            <option value="low">低</option><option value="normal" selected>普通</option><option value="high">高</option>
                        </select></label>
                    </div>
                    <div class="ime-lexicon-editor-actions">
                        <button class="modal-btn modal-btn-secondary" id="ime-lexicon-editor-cancel">取消</button>
                        <button class="modal-btn modal-btn-primary" id="ime-lexicon-editor-save">保存</button>
                    </div>
                    <div id="ime-lexicon-form-error" class="ime-lexicon-form-error" aria-live="polite"></div>
                </div>
                <div class="ime-lexicon-summary"><span id="ime-lexicon-count">0 个词条</span><span>只保存在此浏览器</span></div>
                <div id="ime-lexicon-list" class="ime-lexicon-list"></div>
                <div class="ime-lexicon-transfer">
                    <button class="modal-btn modal-btn-secondary" id="ime-lexicon-export"><i class="fas fa-download"></i> 导出 JSON</button>
                    <button class="modal-btn modal-btn-secondary" id="ime-lexicon-import"><i class="fas fa-upload"></i> 导入 JSON</button>
                    <input type="file" id="ime-lexicon-import-file" accept="application/json,.json" hidden>
                </div>
                <div class="modal-buttons">
                    <button class="modal-btn modal-btn-secondary" id="ime-lexicon-back"><i class="fas fa-arrow-left"></i> 返回</button>
                    <button class="modal-btn modal-btn-secondary" id="ime-lexicon-close">关闭</button>
                </div>
            </div>`;
        document.body.appendChild(modal);

        const posSelect = document.getElementById("ime-lexicon-pos");
        Object.keys(POS_LABELS).forEach(function (pos) {
            const option = document.createElement("option");
            option.value = pos;
            option.textContent = POS_LABELS[pos];
            if (pos === "noun") option.selected = true;
            posSelect.appendChild(option);
        });
    }

    function setError(message) {
        document.getElementById("ime-lexicon-form-error").textContent = message || "";
    }

    function showEditor(entry) {
        editingId = entry ? entry.id : null;
        document.getElementById("ime-lexicon-editor-title").textContent = entry ? "编辑词语" : "添加词语";
        document.getElementById("ime-lexicon-text").value = entry ? entry.text : "";
        document.getElementById("ime-lexicon-reading").value = entry ? entry.reading : "";
        document.getElementById("ime-lexicon-pos").value = entry ? entry.pos : "noun";
        document.getElementById("ime-lexicon-weight").value = entry ? entry.weight : "normal";
        document.getElementById("ime-lexicon-editor").hidden = false;
        setError("");
        document.getElementById("ime-lexicon-text").focus();
    }

    function hideEditor() {
        editingId = null;
        document.getElementById("ime-lexicon-editor").hidden = true;
        setError("");
    }

    function render() {
        const all = api.list();
        const filtered = api.search(query);
        const list = document.getElementById("ime-lexicon-list");
        list.replaceChildren();
        document.getElementById("ime-lexicon-count").textContent =
            query ? `${filtered.length} / ${all.length} 个词条` : `${all.length} 个词条`;

        if (!filtered.length) {
            const empty = document.createElement("div");
            empty.className = "ime-lexicon-empty";
            empty.textContent = query ? "没有匹配的词条" : "还没有自定义词语";
            list.appendChild(empty);
            return;
        }

        filtered.sort(function (a, b) {
            return b.updatedAt.localeCompare(a.updatedAt);
        }).forEach(function (entry) {
            const row = document.createElement("div");
            row.className = "ime-lexicon-row" + (entry.enabled ? "" : " disabled");
            row.dataset.entryId = entry.id;

            const main = document.createElement("div");
            main.className = "ime-lexicon-row-main";
            const text = document.createElement("div");
            text.className = "ime-lexicon-row-text";
            text.textContent = entry.text;
            const meta = document.createElement("div");
            meta.className = "ime-lexicon-row-meta";
            meta.textContent = `${entry.reading} · ${POS_LABELS[entry.pos] || "其他"} · ${WEIGHT_LABELS[entry.weight] || "普通"}`;
            main.append(text, meta);

            const actions = document.createElement("div");
            actions.className = "ime-lexicon-row-actions";
            const toggle = document.createElement("button");
            toggle.className = "ime-lexicon-icon-btn ime-lexicon-toggle";
            toggle.title = entry.enabled ? "禁用" : "启用";
            toggle.setAttribute("aria-label", toggle.title);
            toggle.innerHTML = entry.enabled ? '<i class="fas fa-toggle-on"></i>' : '<i class="fas fa-toggle-off"></i>';
            toggle.addEventListener("click", async function () {
                await api.setEnabled(entry.id, !entry.enabled);
            });
            const edit = document.createElement("button");
            edit.className = "ime-lexicon-icon-btn ime-lexicon-edit";
            edit.title = "编辑";
            edit.setAttribute("aria-label", "编辑");
            edit.innerHTML = '<i class="fas fa-pen"></i>';
            edit.addEventListener("click", function () { showEditor(entry); });
            const remove = document.createElement("button");
            remove.className = "ime-lexicon-icon-btn danger ime-lexicon-delete";
            remove.title = "删除";
            remove.setAttribute("aria-label", "删除");
            remove.innerHTML = '<i class="fas fa-trash"></i>';
            remove.addEventListener("click", async function () {
                if (window.confirm(`确定删除“${entry.text}”吗？`)) {
                    await api.remove(entry.id);
                    notify("词条已删除");
                }
            });
            actions.append(toggle, edit, remove);
            row.append(main, actions);
            list.appendChild(row);
        });
    }

    async function saveEditor() {
        const wasEditing = Boolean(editingId);
        const input = {
            text: document.getElementById("ime-lexicon-text").value,
            reading: document.getElementById("ime-lexicon-reading").value,
            pos: document.getElementById("ime-lexicon-pos").value,
            weight: document.getElementById("ime-lexicon-weight").value
        };
        const result = editingId ? await api.update(editingId, input) : await api.add(input);
        if (!result.valid) {
            setError(result.error || "保存失败");
            return;
        }
        hideEditor();
        notify(wasEditing ? "词条已更新" : "词条已添加");
    }

    function downloadExport() {
        const blob = new Blob([api.exportJSON()], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `random-ime-custom-lexicon-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    async function importFile(file) {
        if (!file) return;
        const text = await file.text();
        const result = await api.importJSON(text, { mode: "merge" });
        if (!result.valid) {
            notify(result.error || "导入失败", "error");
            return;
        }
        notify(`导入 ${result.imported} 条，跳过 ${result.skipped} 条，重复 ${result.duplicates} 条`);
    }

    function open() {
        const advanced = document.getElementById("advanced-modal");
        if (advanced && typeof window.hideModal === "function") window.hideModal(advanced);
        render();
        if (typeof window.showModal === "function") {
            window.showModal(document.getElementById("ime-custom-lexicon-modal"));
        } else {
            document.getElementById("ime-custom-lexicon-modal").style.display = "flex";
        }
    }

    function close(returnToAdvanced) {
        hideEditor();
        const modal = document.getElementById("ime-custom-lexicon-modal");
        if (typeof window.hideModal === "function") window.hideModal(modal);
        else modal.style.display = "none";
        if (returnToAdvanced) {
            const advanced = document.getElementById("advanced-modal");
            if (advanced && typeof window.showModal === "function") window.showModal(advanced);
        }
    }

    function bind() {
        buildModal();
        const entry = document.getElementById("ime-custom-lexicon-function");
        if (entry) entry.addEventListener("click", open);
        document.getElementById("ime-lexicon-add").addEventListener("click", function () { showEditor(null); });
        document.getElementById("ime-lexicon-editor-cancel").addEventListener("click", hideEditor);
        document.getElementById("ime-lexicon-editor-save").addEventListener("click", saveEditor);
        document.getElementById("ime-lexicon-search").addEventListener("input", function (event) {
            query = event.target.value;
            render();
        });
        document.getElementById("ime-lexicon-export").addEventListener("click", downloadExport);
        document.getElementById("ime-lexicon-import").addEventListener("click", function () {
            document.getElementById("ime-lexicon-import-file").click();
        });
        document.getElementById("ime-lexicon-import-file").addEventListener("change", async function (event) {
            await importFile(event.target.files && event.target.files[0]);
            event.target.value = "";
        });
        document.getElementById("ime-lexicon-back").addEventListener("click", function () { close(true); });
        document.getElementById("ime-lexicon-close").addEventListener("click", function () { close(false); });
        api.subscribe(render);
        api.ready.then(render);
    }

    bind();
    window.RandomIMECustomLexiconUI = Object.freeze({ open, close, render, showEditor });
})();
