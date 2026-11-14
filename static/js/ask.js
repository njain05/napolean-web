/*
 * Ask Napoléon + ease-of-use helpers.
 * Adds, without changing the existing markup:
 *   1. An "Ask Napoléon" tab: chat with the crawled website in plain English.
 *      When a campaign with a mission finishes, the mission is answered automatically
 *      (the "Mission Briefing").
 *   2. Example-mission buttons under the mission field (one click fills the form).
 *   3. A "Max pages" box (smart-crawl budget) next to the depth slider.
 *   4. An "Advanced" toggle that hides the expert-only settings.
 */
(function () {
    'use strict';

    const $ = (sel) => document.querySelector(sel);
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const EXAMPLE_MISSIONS = [
        { label: 'Faculty & departments', intent: 'faculty members, professors and their departments' },
        { label: 'Admissions & fees', intent: 'admission process, eligibility, deadlines and fees' },
        { label: 'Contacts & emails', intent: 'contact details, email addresses and phone numbers' },
        { label: 'Leadership', intent: 'leadership team, directors, principal and heads' },
    ];
    const EXAMPLE_QUESTIONS = [
        'Who is the head of the computer science department?',
        'What is the admission deadline?',
        'What is the contact email?',
    ];

    // ------------------------------------------------------------------ 1. Ask tab

    function buildAskTab() {
        const tabs = $('#warRoomTabs');
        const panes = $('#warRoomTabContent');
        if (!tabs || !panes || $('#ask-tab')) return;

        const li = document.createElement('li');
        li.className = 'nav-item';
        li.setAttribute('role', 'presentation');
        li.innerHTML = `<button class="nav-link ask-tab-link" id="ask-tab" data-bs-toggle="tab" data-bs-target="#ask-pane" type="button" role="tab">
            <i class="fa-solid fa-comments me-2"></i> Ask Napoléon</button>`;
        tabs.insertBefore(li, tabs.children[1] || null);

        const pane = document.createElement('div');
        pane.className = 'tab-pane fade';
        pane.id = 'ask-pane';
        pane.setAttribute('role', 'tabpanel');
        pane.innerHTML = `
            <div class="ask-wrap">
                <div class="ask-head">
                    <div>
                        <div class="ask-title"><i class="fa-solid fa-comments me-2"></i>Ask the website a question</div>
                        <div class="ask-sub" id="ask-status">Run a campaign first, then ask anything about the pages it found.</div>
                    </div>
                </div>
                <div class="ask-log" id="ask-log" aria-live="polite"></div>
                <div class="ask-chips" id="ask-chips"></div>
                <form class="ask-form" id="ask-form" autocomplete="off">
                    <input type="text" id="ask-input" class="form-control" maxlength="500"
                           placeholder="e.g. Which department is Dr. Sharma from?">
                    <button type="submit" class="btn btn-antique" id="ask-send"><i class="fa-solid fa-paper-plane me-1"></i> Ask</button>
                </form>
            </div>`;
        panes.appendChild(pane);

        const chips = $('#ask-chips');
        EXAMPLE_QUESTIONS.forEach(q => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'ask-chip';
            b.textContent = q;
            b.addEventListener('click', () => ask(q));
            chips.appendChild(b);
        });

        $('#ask-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const q = $('#ask-input').value.trim();
            if (q) ask(q);
        });
        $('#ask-tab').addEventListener('shown.bs.tab', refreshStatus);
        refreshStatus();
    }

    function addBubble(role, html) {
        const log = $('#ask-log');
        const div = document.createElement('div');
        div.className = `ask-msg ask-${role}`;
        div.innerHTML = html;
        log.appendChild(div);
        log.scrollTop = log.scrollHeight;
        return div;
    }

    function renderAnswer(res, heading) {
        const sources = (res.sources || []).slice(0, 4).map((s, i) => `
            <li><a href="${esc(s.url)}" target="_blank" rel="noopener">[${i + 1}] ${esc(s.title || s.url)}</a>
                <div class="ask-snippet">${esc(s.best_line)}</div></li>`).join('');
        const badge = res.mode === 'claude' ? '<span class="ask-badge">AI answer</span>'
                    : res.mode === 'offline' ? '<span class="ask-badge">Found on the site</span>' : '';
        return `${heading ? `<div class="ask-briefing">${heading}</div>` : ''}
            <div class="ask-answer">${esc(res.answer)} ${badge}</div>
            ${sources ? `<details class="ask-sources" ${heading ? 'open' : ''}><summary>Sources (${(res.sources || []).length})</summary><ol>${sources}</ol></details>` : ''}`;
    }

    async function ask(question, heading) {
        if (!heading) addBubble('user', esc(question));
        const pending = addBubble('bot', '<span class="ask-typing">Searching the conquered pages…</span>');
        $('#ask-input').value = '';
        try {
            const r = await fetch('/api/ask', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ question })
            });
            const res = await r.json();
            pending.innerHTML = r.ok ? renderAnswer(res, heading) : esc(res.error || 'Something went wrong.');
        } catch (err) {
            pending.innerHTML = 'Could not reach the server.';
        }
        $('#ask-log').scrollTop = $('#ask-log').scrollHeight;
    }

    async function refreshStatus() {
        try {
            const s = await (await fetch('/api/ask/status')).json();
            const el = $('#ask-status');
            if (!el) return;
            el.textContent = s.pages
                ? `Ready: ${s.pages} pages read (${s.passages} passages). ${s.llm ? 'AI answers on.' : 'Answers come straight from the site, with sources.'}`
                : 'Run a campaign first, then ask anything about the pages it found.';
        } catch (_) { /* server restarting */ }
    }

    function missionBriefingOnComplete() {
        const es = new EventSource('/api/campaign/stream');
        es.onmessage = (e) => {
            let msg;
            try { msg = JSON.parse(e.data); } catch (_) { return; }
            if (msg.event !== 'complete') return;
            refreshStatus();
            const intent = ($('#campaign-intent')?.value || '').trim();
            if (!intent) return;
            ask(intent, `<i class="fa-solid fa-crosshairs me-1"></i> Mission briefing: “${esc(intent)}”`);
            const badge = $('#ask-tab');
            if (badge) badge.classList.add('ask-new');
        };
    }

    // ------------------------------------------------------------------ 2-4. Form helpers

    function buildFormHelpers() {
        const intent = $('#campaign-intent');
        if (intent && !$('#mission-examples')) {
            intent.placeholder = 'What are you looking for? e.g. faculty and their departments';
            const row = document.createElement('div');
            row.id = 'mission-examples';
            row.className = 'mission-examples';
            row.innerHTML = '<span class="mission-examples-label">Try:</span>';
            EXAMPLE_MISSIONS.forEach(m => {
                const b = document.createElement('button');
                b.type = 'button';
                b.className = 'ask-chip';
                b.textContent = m.label;
                b.title = m.intent;
                b.addEventListener('click', () => {
                    intent.value = m.intent;
                    intent.dispatchEvent(new Event('input', { bubbles: true }));
                });
                row.appendChild(b);
            });
            intent.closest('.input-group')?.insertAdjacentElement('afterend', row);
        }

        // Max pages (smart-crawl budget), placed under the depth slider
        const depth = $('#crawl-depth');
        if (depth && !$('#max-pages')) {
            const box = document.createElement('div');
            box.className = 'max-pages-box';
            box.innerHTML = `<label for="max-pages" class="field-parchment-label mb-0"><i class="fa-solid fa-flag me-1"></i> Max pages</label>
                <input type="number" id="max-pages" class="form-control form-control-sm" min="0" max="500" value="25"
                       title="Stop after this many pages. With a mission, the most promising pages are visited first. 0 = no limit.">`;
            depth.parentElement.appendChild(box);
        }

        // Advanced toggle: hide expert-only settings (browser engine, terminal command)
        const form = $('#campaign-form');
        const method = $('#recon-method');
        const cipher = document.querySelector('.cipher-slip');
        if (form && method && !$('#btn-advanced')) {
            const advanced = [method.closest('[class*="col-"]'), cipher].filter(Boolean);
            advanced.forEach(el => el.classList.add('advanced-only'));
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'btn-advanced';
            btn.className = 'btn btn-sm btn-link advanced-toggle';
            const sync = () => {
                const show = form.classList.contains('show-advanced');
                btn.innerHTML = show ? '<i class="fa-solid fa-chevron-up me-1"></i>Hide advanced settings'
                                     : '<i class="fa-solid fa-sliders me-1"></i>Advanced settings';
            };
            btn.addEventListener('click', () => {
                form.classList.toggle('show-advanced');
                try { localStorage.setItem('napoleon-advanced', form.classList.contains('show-advanced') ? '1' : '0'); } catch (_) {}
                sync();
            });
            try { if (localStorage.getItem('napoleon-advanced') === '1') form.classList.add('show-advanced'); } catch (_) {}
            sync();
            const actions = form.querySelector('.border-top');
            (actions || form).insertAdjacentElement('beforebegin', btn);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        buildFormHelpers();
        buildAskTab();
        missionBriefingOnComplete();
        $('#ask-tab')?.addEventListener('click', e => e.currentTarget.classList.remove('ask-new'));
    });
})();
