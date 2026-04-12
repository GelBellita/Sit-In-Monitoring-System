const sections = document.querySelectorAll('section[id]');
const navLinks  = document.querySelectorAll('.nav-link[data-section]');
function updateActiveLink() {
    const scrollY = window.scrollY + 100;
    sections.forEach(section => {
        const top    = section.offsetTop;
        const bottom = top + section.offsetHeight;
        const id     = section.getAttribute('id');
        if (scrollY >= top && scrollY < bottom) {
            navLinks.forEach(link => {
                link.classList.remove('active');
                if (link.dataset.section === id) link.classList.add('active');
            });
        }
    });
}
window.addEventListener('scroll', updateActiveLink);
updateActiveLink();

setTimeout(() => {
    document.querySelectorAll('.flash-msg').forEach(el => {
        el.style.transition = 'opacity 0.5s';
        el.style.opacity    = '0';
        setTimeout(() => el.remove(), 500);
    });
}, 4000);

const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const mobileDrawer  = document.getElementById('mobileDrawer');
if (mobileMenuBtn && mobileDrawer) {
    mobileMenuBtn.addEventListener('click', () => mobileDrawer.classList.toggle('open'));
}

const fileInput      = document.getElementById('profileImageInput');
const previewImg     = document.getElementById('previewImg');
const avatarInitials = document.getElementById('avatarInitials');
if (fileInput && previewImg) {
    fileInput.addEventListener('change', function () {
        const file = this.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = e => {
            previewImg.src = e.target.result;
            previewImg.style.display = 'block';
            if (avatarInitials) avatarInitials.style.display = 'none';
        };
        reader.readAsDataURL(file);
    });
}

// ── Feedback modal ────────────────────────────────────────────────────────────
const fbModalBackdrop = document.getElementById('fbModalBackdrop');
if (fbModalBackdrop) {
    const fbForm          = document.getElementById('fbForm');
    const fbModalSubtitle = document.getElementById('fbModalSubtitle');
    const fbTextarea      = document.getElementById('fbTextarea');
    const fbCancelBtn     = document.getElementById('fbCancelBtn');
    document.querySelectorAll('.btn-feedback').forEach(btn => {
        btn.addEventListener('click', function () {
            fbModalSubtitle.textContent = 'Session in ' + this.dataset.labRoom + ' — how was it?';
            fbForm.action = '/student/history/feedback/' + this.dataset.recordId;
            fbTextarea.value = '';
            fbModalBackdrop.classList.add('open');
            setTimeout(() => fbTextarea.focus(), 100);
        });
    });
    fbCancelBtn?.addEventListener('click', () => fbModalBackdrop.classList.remove('open'));
    fbModalBackdrop.addEventListener('click', e => { if (e.target === fbModalBackdrop) fbModalBackdrop.classList.remove('open'); });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && fbModalBackdrop.classList.contains('open'))
            fbModalBackdrop.classList.remove('open');
    });
}

// ── Notification Bell ─────────────────────────────────────────────────────────
(function () {
    const notifWrap  = document.getElementById('notifWrap');
    const notifBtn   = document.getElementById('notifBtn');
    const notifDrop  = document.getElementById('notifDropdown');
    const notifBadge = document.getElementById('notifBadge');
    const notifList  = document.getElementById('notifList');
    const markAllBtn = document.getElementById('markAllReadBtn');
    if (!notifBtn || !notifWrap || !notifDrop) return;

    const FETCH_URL = '/student/notifications';
    const READ_URL  = '/student/notifications/mark-read';
    let notifs = [], open = false;

    function iconFor(type) {
        if (type==='success') return '<i class="fa-solid fa-circle-check notif-item-icon success"></i>';
        if (type==='error')   return '<i class="fa-solid fa-circle-xmark notif-item-icon error"></i>';
        if (type==='warning') return '<i class="fa-solid fa-triangle-exclamation notif-item-icon warning"></i>';
        return '<i class="fa-solid fa-circle-info notif-item-icon info"></i>';
    }
    function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
    function timeAgo(d) {
        if (!d) return '';
        const t   = new Date(d.replace(' ','T'));
        if (isNaN(t)) return '';
        const sec = Math.floor((Date.now()-t)/1000);
        if (sec<60)    return 'just now';
        if (sec<3600)  return Math.floor(sec/60)+'m ago';
        if (sec<86400) return Math.floor(sec/3600)+'h ago';
        return Math.floor(sec/86400)+'d ago';
    }
    function renderList() {
        if (!notifList) return;
        if (!notifs.length) {
            notifList.innerHTML = '<div class="notif-empty"><i class="fa-regular fa-bell-slash"></i><p>No notifications yet</p></div>';
            return;
        }
        notifList.innerHTML = notifs.map(n =>
            '<div class="notif-item '+(n.isRead?'':'notif-unread')+' notif-type-'+(n.type||'info')+'">' +
            iconFor(n.type) +
            '<div class="notif-item-body"><div class="notif-item-msg">'+esc(n.message)+'</div>' +
            '<div class="notif-item-time">'+timeAgo(n.createdAt)+'</div></div></div>'
        ).join('');
    }
    function setBadge(count) {
        if (!notifBadge) return;
        notifBadge.textContent   = count > 99 ? '99+' : count;
        notifBadge.style.display = count > 0 ? 'flex' : 'none';
    }
    function fetchAndOpen() {
        fetch(FETCH_URL,{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(data=>{
            if(data){ notifs=data.notifications||[]; setBadge(data.unread_count||0); }
            open=true; notifDrop.classList.add('open'); notifWrap.classList.add('open'); renderList();
        }).catch(()=>{ open=true; notifDrop.classList.add('open'); notifWrap.classList.add('open'); renderList(); });
    }
    function fetchSilent() {
        fetch(FETCH_URL,{credentials:'same-origin'}).then(r=>r.ok?r.json():null).then(data=>{
            if(!data) return; notifs=data.notifications||[]; setBadge(data.unread_count||0);
            if(open) renderList();
        }).catch(()=>{});
    }
    function closeDrop() { open=false; notifDrop.classList.remove('open'); notifWrap.classList.remove('open'); }
    notifBtn.addEventListener('click', e=>{ e.stopPropagation(); open?closeDrop():fetchAndOpen(); });
    document.addEventListener('click', e=>{ if(open&&!notifWrap.contains(e.target)) closeDrop(); });
    document.addEventListener('keydown', e=>{ if(e.key==='Escape'&&open) closeDrop(); });
    if(markAllBtn) {
        markAllBtn.addEventListener('click', e=>{
            e.stopPropagation();
            fetch(READ_URL,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin'})
            .then(r=>r.json()).then(()=>{ notifs.forEach(n=>n.isRead=1); setBadge(0); renderList(); }).catch(()=>{});
        });
    }
    fetchSilent(); setInterval(fetchSilent,30000);
})();


// ════════════════════════════════════════════════════════════════
//  ADMIN SIT-IN WIZARD  (2-step, auto date+slot)
// ════════════════════════════════════════════════════════════════
(function () {

    // ── Determine today's date (YYYY-MM-DD) and current slot ──────────────────
    const SLOT_MAP = [
        { label: '7:00 AM – 9:00 AM',   start:  7, end:  9 },
        { label: '9:00 AM – 11:00 AM',  start:  9, end: 11 },
        { label: '11:00 AM – 1:00 PM',  start: 11, end: 13 },
        { label: '1:00 PM – 3:00 PM',   start: 13, end: 15 },
        { label: '3:00 PM – 5:00 PM',   start: 15, end: 17 },
        { label: '5:00 PM – 7:00 PM',   start: 17, end: 19 },
    ];

    function getTodayYMD() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    function getCurrentSlot() {
        const h = new Date().getHours() + new Date().getMinutes() / 60;
        return SLOT_MAP.find(s => h >= s.start && h < s.end) || null;
    }

    // ── State ──────────────────────────────────────────────────────────────────
    let _lab  = null;
    let _pc   = null;
    const _today = getTodayYMD();
    const _slot  = getCurrentSlot();

    // ── Step indicator ─────────────────────────────────────────────────────────
    function setSteps(active) {
        for (let i = 1; i <= 2; i++) {
            const node = document.getElementById(`sitin-sn${i}`);
            const circ = document.getElementById(`sitin-sc${i}`);
            const line = document.getElementById(`sitin-sl${i}`);
            if (!node) continue;
            node.classList.remove('active', 'done');
            if (i < active)  { node.classList.add('done');   circ.innerHTML = '<i class="fa-solid fa-check"></i>'; }
            if (i === active) { node.classList.add('active'); circ.textContent = i; }
            if (i > active)  { circ.textContent = i; }
            if (line) line.classList.toggle('done', i < active);
        }
    }

    function showPanel(n) {
        document.querySelectorAll('.sitin-panel').forEach(p => p.classList.remove('active'));
        document.getElementById(`sitinPanel${n}`)?.classList.add('active');
        setSteps(n);
    }

    // ── Reset ──────────────────────────────────────────────────────────────────
    function resetModal() {
        _lab = null; _pc = null;
        showPanel(1);

        const ps = document.getElementById('sitin_purpose_sel');
        if (ps) ps.selectedIndex = 0;
        const nb = document.getElementById('sitin_next_btn');
        if (nb) nb.disabled = true;

        document.querySelectorAll('.sitin-lab-tile').forEach(t => t.classList.remove('selected'));

        // Show slot info
        renderSlotInfo();

        document.getElementById('sitin_pc_number').value = '';
        const sb = document.getElementById('sitinPCSelBar');
        if (sb) sb.style.display = 'none';
        const sub = document.getElementById('submitBtn');
        const submitBtn = document.getElementById('sitinSubmitBtn');
        if (submitBtn) submitBtn.disabled = true;

        document.getElementById('sitinModalSub').textContent = 'Select purpose and lab room';
    }

    // ── Slot info pill (Step 1) ────────────────────────────────────────────────
    function renderSlotInfo() {
        const el = document.getElementById('sitinSlotInfo');
        if (!el) return;
        if (_slot) {
            el.innerHTML =
                `<div class="sitin-slot-pill has-slot">
                    <i class="fa-solid fa-clock"></i>
                    Current slot: <strong>${_slot.label}</strong> &nbsp;·&nbsp; ${_today}
                </div>`;
        } else {
            el.innerHTML =
                `<div class="sitin-slot-pill no-slot">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    No active time slot right now (outside lab hours). PC availability shown as-is.
                </div>`;
        }
    }

    // ── Open / Close ───────────────────────────────────────────────────────────
    window.closeSitInModal = function () {
        document.getElementById('sitInModalBackdrop').classList.remove('open');
        setTimeout(resetModal, 250);
    };
    document.getElementById('sitInModalBackdrop')?.addEventListener('click', function (e) {
        if (e.target === this) window.closeSitInModal();
    });

    // ── Step 1: check readiness ────────────────────────────────────────────────
    function checkReady() {
        const ps  = document.getElementById('sitin_purpose_sel');
        const btn = document.getElementById('sitin_next_btn');
        if (btn) btn.disabled = !(ps && ps.value && _lab);
    }

    document.getElementById('sitin_purpose_sel')?.addEventListener('change', checkReady);

    document.querySelectorAll('.sitin-lab-tile').forEach(tile => {
        tile.addEventListener('click', function () {
            document.querySelectorAll('.sitin-lab-tile').forEach(t => t.classList.remove('selected'));
            this.classList.add('selected');
            _lab = this.dataset.lab;
            checkReady();
        });
    });

    // Render slot pill on load (for when modal first opens)
    renderSlotInfo();

    // ── Go to Step 2 ───────────────────────────────────────────────────────────
    window.sitinGoStep2 = function () {
        const ps = document.getElementById('sitin_purpose_sel');
        if (!ps?.value || !_lab) return;

        document.getElementById('sitin_purpose_hidden').value = ps.value;
        document.getElementById('sitin_lab_hidden').value     = _lab;

        const labLbl  = document.getElementById('sitinPCLabLabel');
        const slotLbl = document.getElementById('sitinPCSlotLabel');
        if (labLbl)  labLbl.textContent  = _lab;
        if (slotLbl) slotLbl.textContent = _slot ? `· ${_slot.label}` : '';

        document.getElementById('sitinModalSub').textContent =
            `Lab ${_lab}` + (_slot ? ` · ${_slot.label}` : '') + ` · ${_today}`;

        // Reset PC state
        _pc = null;
        document.getElementById('sitin_pc_number').value = '';
        const sb = document.getElementById('sitinPCSelBar');
        if (sb) sb.style.display = 'none';
        const submitBtn = document.getElementById('sitinSubmitBtn');
        if (submitBtn) submitBtn.disabled = true;

        showPanel(2);
        loadPCs();
    };

    window.sitinGoStep1 = function () { showPanel(1); };

    // ── Load PC grid ───────────────────────────────────────────────────────────
    const PC_ROWS = [
        [40,39,38,37,36,35,34,33],
        [32,31,30,29,28,27,26,25],
        [24,23,22,21,20,19,18,17],
        [16,15,14,13,12,11,10, 9],
        [ 8, 7, 6, 5, 4, 3, 2, 1],
    ];

    function loadPCs() {
        const grid   = document.getElementById('sitinPCGrid');
        const loader = document.getElementById('sitinPCLoader');
        const avail  = document.getElementById('sitinPCAvailCount');
        if (!grid || !loader) return;

        grid.innerHTML = '';
        loader.classList.add('on');

        // Use today + current slot (empty string if outside hours — backend handles it)
        const slotParam = _slot ? _slot.label : '';
        const url = (typeof CHECK_AVAIL_URL !== 'undefined' ? CHECK_AVAIL_URL : '/student/check-availability')
            + `?lab=${encodeURIComponent(_lab)}`
            + `&date=${encodeURIComponent(_today)}`
            + `&slot=${encodeURIComponent(slotParam)}`
            + `&type=pcs`;

        fetch(url)
            .then(r => r.json())
            .then(data => {
                buildGrid(grid, data.inuse || [], data.reserved || [], data.pending || []);
                const freeCount = grid.querySelectorAll('.spc-free').length;
                if (avail) avail.textContent = `${freeCount} of 40 available`;
                loader.classList.remove('on');
            })
            .catch(() => {
                buildGrid(grid, [], [], []);
                if (avail) avail.textContent = '40 of 40 available';
                loader.classList.remove('on');
            });
    }

    function buildGrid(grid, inuse, reserved, pending) {
        grid.innerHTML = '';
        PC_ROWS.forEach(row => {
            row.forEach(pc => {
                const btn  = document.createElement('button');
                btn.type   = 'button';
                btn.dataset.pc = pc;
                btn.title  = `PC ${pc}`;

                let cls = 'spc-free', txt = 'Free', dis = false;
                if      (inuse.includes(pc))    { cls = 'spc-inuse';    txt = 'In Use';   dis = true; }
                else if (reserved.includes(pc)) { cls = 'spc-reserved'; txt = 'Reserved'; dis = true; }
                else if (pending.includes(pc))  { cls = 'spc-pending';  txt = 'Pending';  dis = true; }

                btn.className = `spc ${cls}`;
                btn.disabled  = dis;
                btn.innerHTML =
                    `<i class="fa-solid fa-desktop"></i>` +
                    `<span class="spc-num">${pc}</span>` +
                    `<span class="spc-st">${txt}</span>`;

                if (!dis) btn.addEventListener('click', () => selectPC(btn, pc));
                grid.appendChild(btn);
            });
        });
    }

    function selectPC(btn, pc) {
        // Deselect previous
        document.querySelectorAll('.spc.spc-selected').forEach(b => {
            b.classList.replace('spc-selected', 'spc-free');
            const st = b.querySelector('.spc-st');
            if (st) st.textContent = 'Free';
        });

        if (_pc === pc) {
            // Toggle off
            _pc = null;
            document.getElementById('sitin_pc_number').value = '';
            document.getElementById('sitinPCSelBar').style.display = 'none';
            document.getElementById('sitinSubmitBtn').disabled = true;
            return;
        }

        btn.classList.replace('spc-free', 'spc-selected');
        const st = btn.querySelector('.spc-st');
        if (st) st.textContent = 'Selected';

        _pc = pc;
        document.getElementById('sitin_pc_number').value = pc;
        document.getElementById('sitinPCSelBar').style.display   = 'flex';
        document.getElementById('sitinPCSelLabel').textContent    = `PC ${pc} selected`;
        document.getElementById('sitinSubmitBtn').disabled        = false;
    }

    window.sitinDeselectPC = function () {
        document.querySelectorAll('.spc.spc-selected').forEach(b => {
            b.classList.replace('spc-selected', 'spc-free');
            const st = b.querySelector('.spc-st');
            if (st) st.textContent = 'Free';
        });
        _pc = null;
        document.getElementById('sitin_pc_number').value      = '';
        document.getElementById('sitinPCSelBar').style.display = 'none';
        document.getElementById('sitinSubmitBtn').disabled     = true;
    };

})(); // end sit-in IIFE


// ── Search modal ──────────────────────────────────────────────────────────────
function openSearchModal() {
    document.getElementById('searchQuery').value = '';
    document.getElementById('searchError').style.display = 'none';
    document.getElementById('searchModalBackdrop').classList.add('open');
    setTimeout(() => document.getElementById('searchQuery').focus(), 100);
}
function closeSearchModal() {
    document.getElementById('searchModalBackdrop').classList.remove('open');
}

function doSearch() {
    const query = document.getElementById('searchQuery').value.trim();
    if (!query) return;
    document.getElementById('searchError').style.display = 'none';

    fetch(SEARCH_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'query=' + encodeURIComponent(query)
    })
    .then(r => r.json())
    .then(data => {
        if (!data.found) {
            document.getElementById('searchErrorMsg').textContent = `No student found for "${query}".`;
            document.getElementById('searchError').style.display = 'flex';
            return;
        }
        if (data.sessions !== null && data.sessions <= 0) {
            document.getElementById('searchErrorMsg').textContent =
                `${data.firstName} ${data.lastName} has no remaining sessions.`;
            document.getElementById('searchError').style.display = 'flex';
            return;
        }
        // Populate student banner
        document.getElementById('sitin_student_id').value             = data.idNumber;
        document.getElementById('sitin_display_id').textContent       = data.idNumber;
        document.getElementById('sitin_display_name').textContent     = `${data.firstName} ${data.lastName}`;
        document.getElementById('sitin_display_sessions').textContent = data.sessions ?? 30;
        document.getElementById('sitin_display_course').textContent   = data.course;

        closeSearchModal();
        document.getElementById('sitInModalBackdrop').classList.add('open');
    })
    .catch(() => {
        document.getElementById('searchErrorMsg').textContent = 'Server error. Please try again.';
        document.getElementById('searchError').style.display = 'flex';
    });
}

document.getElementById('searchModalBackdrop')?.addEventListener('click', function (e) {
    if (e.target === this) closeSearchModal();
});
document.getElementById('searchQuery')?.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') doSearch();
});