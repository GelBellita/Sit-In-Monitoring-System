// ── reservation.js ────────────────────────────────────────────────────────────
(function () {

    let selectedLab  = null;
    let selectedDate = null;
    let selectedSlot = null;
    let selectedPC   = null;
    let currentStep  = 1;

    const TOTAL_STEPS = 4;

    function pad(n) { return String(n).padStart(2, '0'); }
    function toYMD(y, m, d) { return `${y}-${pad(m + 1)}-${pad(d)}`; }

    const MONTHS    = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];
    const DAYS_FULL = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

    // ── DOM refs ───────────────────────────────────────────────────────────────
    const btnBack       = document.getElementById('btnBack');
    const btnNext       = document.getElementById('btnNext');
    const pcSelBar      = document.getElementById('pcSelectionBar');
    const pcSelNum      = document.getElementById('pcSelectionNum');
    const pcDeselectBtn = document.getElementById('pcDeselectLink');
    const pcAvailCount  = document.getElementById('pcAvailCount');
    const pcLoadingEl   = document.getElementById('pcLoadingOverlay');
    const stepLabBadge  = document.getElementById('stepLabBadge');

    // ── Step navigation ────────────────────────────────────────────────────────
    function goStep(n) {
        // Hide all panels
        document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));

        // Update step indicators
        for (let i = 1; i <= TOTAL_STEPS; i++) {
            const node = document.getElementById('step-ind-' + i);
            const circ = document.getElementById('sc' + i);
            if (!node) continue;
            node.classList.remove('active', 'done');
            if (i < n)  { node.classList.add('done'); circ.innerHTML = '<i class="fa-solid fa-check"></i>'; }
            if (i === n) { node.classList.add('active'); circ.textContent = i; }
            if (i > n)   { circ.textContent = i; }
            // connectors
            const conn = document.getElementById('conn' + i);
            if (conn) conn.classList.toggle('done', i < n);
        }

        const panel = document.getElementById('stepPanel' + n);
        if (panel) panel.classList.add('active');

        currentStep = n;
        updateNavBar();

        if (n === 3) loadPCAvailability();
        if (n === 4) populateConfirm();

        // Scroll panels to top
        const panels = document.querySelector('.resv-panels');
        if (panels) panels.scrollTop = 0;
    }

    // Expose globally for inline onclick fallback
    window.goStep = goStep;

    function updateNavBar() {
        // Back button
        if (btnBack) {
            btnBack.style.visibility = currentStep > 1 ? 'visible' : 'hidden';
        }
        // Next button — hide on step 4 (submit form takes over)
        if (btnNext) {
            if (currentStep === 4) {
                btnNext.style.display = 'none';
            } else {
                btnNext.style.display = 'flex';
                btnNext.disabled = !canProceed();
            }
        }
    }

    function canProceed() {
        if (currentStep === 1) return !!selectedLab;
        if (currentStep === 2) return !!(selectedDate && selectedSlot);
        if (currentStep === 3) return !!selectedPC;
        return false;
    }

    function navNext() { if (canProceed()) goStep(currentStep + 1); }
    function navBack() { if (currentStep > 1) goStep(currentStep - 1); }
    window.navNext = navNext;
    window.navBack = navBack;

    if (btnNext) btnNext.addEventListener('click', navNext);
    if (btnBack) btnBack.addEventListener('click', navBack);

    // ── Step 1: Lab ────────────────────────────────────────────────────────────
    document.querySelectorAll('.lab-tile').forEach(tile => {
        tile.addEventListener('click', function () {
            document.querySelectorAll('.lab-tile').forEach(t => t.style.borderColor = '');
            this.style.borderColor = '#1a2744';
            selectedLab = this.dataset.lab;

            // Show badge in stepbar
            if (stepLabBadge) {
                stepLabBadge.textContent = selectedLab;
                stepLabBadge.style.display = 'inline';
            }

            updateNavBar();
            // Auto-advance after brief delay for nice UX
            setTimeout(() => goStep(2), 180);
        });
    });

    // ── Step 2: Calendar ───────────────────────────────────────────────────────
    const calDaysEl  = document.getElementById('calDays');
    const calMonthLb = document.getElementById('calMonthLabel');
    const calStrip   = document.getElementById('calStrip');
    const calStripTx = document.getElementById('calSelectedText');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let calYear  = today.getFullYear();
    let calMonth = today.getMonth();

    function renderCalendar() {
        if (!calDaysEl) return;
        const firstDay    = new Date(calYear, calMonth, 1).getDay();
        const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
        if (calMonthLb) calMonthLb.textContent = MONTHS[calMonth] + ' ' + calYear;
        calDaysEl.innerHTML = '';

        for (let i = 0; i < firstDay; i++) {
            const el = document.createElement('button');
            el.className = 'cal-day cal-empty';
            el.disabled = true;
            calDaysEl.appendChild(el);
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const el       = document.createElement('button');
            el.className   = 'cal-day';
            el.textContent = d;
            const thisDate = new Date(calYear, calMonth, d);
            const ymd      = toYMD(calYear, calMonth, d);

            if (thisDate < today) {
                el.classList.add('cal-past'); el.disabled = true;
            } else if (thisDate.getDay() === 0) {
                el.classList.add('cal-sunday'); el.disabled = true; el.title = 'Closed on Sundays';
            } else {
                if (thisDate.getTime() === today.getTime()) el.classList.add('cal-today');
                if (ymd === selectedDate) el.classList.add('cal-selected');
                el.addEventListener('click', function () {
                    selectedDate = ymd;
                    calDaysEl.querySelectorAll('.cal-day').forEach(b => b.classList.remove('cal-selected'));
                    this.classList.add('cal-selected');
                    if (calStrip) calStrip.style.display = 'flex';
                    if (calStripTx) calStripTx.textContent =
                        DAYS_FULL[thisDate.getDay()] + ', ' + MONTHS[calMonth] + ' ' + d + ', ' + calYear;

                    // Reset slot on date change
                    selectedSlot = null;
                    document.querySelectorAll('.timeslot-btn').forEach(b => b.classList.remove('selected'));
                    loadSlotAvailability();
                    updateNavBar();
                });
            }
            calDaysEl.appendChild(el);
        }
    }

    document.getElementById('calPrev')?.addEventListener('click', () => {
        calMonth--;
        if (calMonth < 0) { calMonth = 11; calYear--; }
        if (calYear < today.getFullYear() ||
           (calYear === today.getFullYear() && calMonth < today.getMonth())) {
            calMonth = today.getMonth(); calYear = today.getFullYear();
        }
        renderCalendar();
    });
    document.getElementById('calNext')?.addEventListener('click', () => {
        calMonth++;
        if (calMonth > 11) { calMonth = 0; calYear++; }
        renderCalendar();
    });

    renderCalendar();

    // ── Step 2: Timeslots ──────────────────────────────────────────────────────
    document.querySelectorAll('.timeslot-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            if (this.classList.contains('blocked')) return;
            document.querySelectorAll('.timeslot-btn').forEach(b => b.classList.remove('selected'));
            this.classList.add('selected');
            selectedSlot = this.dataset.slot;
            updateNavBar();
        });
    });

    function loadSlotAvailability() {
        if (!selectedLab || !selectedDate) return;
        fetch(CHECK_URL + '?lab=' + encodeURIComponent(selectedLab) +
              '&date=' + encodeURIComponent(selectedDate) + '&type=slots')
            .then(r => r.json())
            .then(data => {
                document.querySelectorAll('.timeslot-btn').forEach(btn => {
                    const isBlocked = data.blocked_slots && data.blocked_slots.includes(btn.dataset.slot);
                    btn.classList.toggle('blocked', isBlocked);
                    // show/hide blocked label
                    let lbl = btn.querySelector('.blocked-label');
                    if (isBlocked) {
                        if (!lbl) {
                            lbl = document.createElement('span');
                            lbl.className = 'blocked-label timeslot-btn';
                            lbl.style.cssText = 'font-size:0.62rem;color:#ef4444;font-weight:600;flex-shrink:0;background:none;border:none;padding:0;margin:0';
                            lbl.textContent = 'Full';
                            btn.appendChild(lbl);
                        }
                    } else if (lbl) {
                        lbl.remove();
                    }
                });
            }).catch(() => {});
    }

    // ── Step 3: PC availability ────────────────────────────────────────────────
    function showPCLoading(show) {
        if (pcLoadingEl) pcLoadingEl.classList.toggle('visible', show);
    }

    function loadPCAvailability() {
        if (!selectedLab || !selectedDate || !selectedSlot) return;
        showPCLoading(true);

        fetch(CHECK_URL
            + '?lab='  + encodeURIComponent(selectedLab)
            + '&date=' + encodeURIComponent(selectedDate)
            + '&slot=' + encodeURIComponent(selectedSlot)
            + '&type=pcs')
            .then(r => r.json())
            .then(data => {
                const reserved = data.reserved || [];
                const pending  = data.pending  || [];
                const inuse    = data.inuse    || [];
                let free = 0;

                document.querySelectorAll('.pc-btn').forEach(btn => {
                    const pc = parseInt(btn.dataset.pc);
                    const st = btn.querySelector('.pc-status-text');
                    btn.className = 'pc-btn';
                    btn.disabled  = false;

                    if (inuse.includes(pc)) {
                        btn.classList.add('pc-inuse');
                        btn.disabled = true;
                        if (st) st.textContent = 'In Use';
                    } else if (reserved.includes(pc)) {
                        btn.classList.add('pc-reserved');
                        btn.disabled = true;
                        if (st) st.textContent = 'Reserved';
                    } else if (pending.includes(pc)) {
                        btn.classList.add('pc-reserved');   // reuse reserved style
                        btn.disabled = true;
                        if (st) st.textContent = 'Pending';
                    } else {
                        btn.classList.add('pc-free');
                        if (st) st.textContent = 'Free';
                        free++;
                    }
                });

                if (pcAvailCount) pcAvailCount.textContent = free + ' of 40 PCs available';
                showPCLoading(false);
            })
            .catch(() => {
                document.querySelectorAll('.pc-btn').forEach(btn => {
                    const st = btn.querySelector('.pc-status-text');
                    btn.className = 'pc-btn pc-free';
                    btn.disabled  = false;
                    if (st) st.textContent = 'Free';
                });
                if (pcAvailCount) pcAvailCount.textContent = '40 of 40 PCs available';
                showPCLoading(false);
            });
    }

    // PC click
    document.querySelectorAll('.pc-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            if (this.disabled) return;

            if (this.classList.contains('pc-selected')) {
                // Deselect
                this.classList.replace('pc-selected', 'pc-free');
                const st = this.querySelector('.pc-status-text');
                if (st) st.textContent = 'Free';
                selectedPC = null;
                if (pcSelBar) pcSelBar.classList.remove('visible');
                updateNavBar();
                return;
            }

            // Clear previous selection
            document.querySelectorAll('.pc-btn.pc-selected').forEach(b => {
                b.classList.replace('pc-selected', 'pc-free');
                const s = b.querySelector('.pc-status-text');
                if (s) s.textContent = 'Free';
            });

            this.classList.replace('pc-free', 'pc-selected');
            const st = this.querySelector('.pc-status-text');
            if (st) st.textContent = 'Selected';
            selectedPC = parseInt(this.dataset.pc);

            if (pcSelBar) {
                if (pcSelNum) pcSelNum.textContent = 'PC ' + selectedPC + ' selected';
                pcSelBar.classList.add('visible');
            }
            updateNavBar();
        });
    });

    if (pcDeselectBtn) {
        pcDeselectBtn.addEventListener('click', () => {
            document.querySelectorAll('.pc-btn.pc-selected').forEach(b => {
                b.classList.replace('pc-selected', 'pc-free');
                const s = b.querySelector('.pc-status-text');
                if (s) s.textContent = 'Free';
            });
            selectedPC = null;
            if (pcSelBar) pcSelBar.classList.remove('visible');
            updateNavBar();
        });
    }

    // ── Step 4: Confirm ────────────────────────────────────────────────────────
    function populateConfirm() {
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        const inp = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };

        set('cfLab',  'Lab ' + selectedLab);
        set('cfDate', selectedDate);
        set('cfSlot', selectedSlot);
        set('cfPC',   'PC ' + selectedPC);
        inp('fLabRoom', selectedLab);
        inp('fDate',    selectedDate);
        inp('fSlot',    selectedSlot);
        inp('fPC',      selectedPC);
    }

    // ── Init ───────────────────────────────────────────────────────────────────
    updateNavBar();

})();