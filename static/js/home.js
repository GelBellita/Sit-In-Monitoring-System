// ── home.js — Admin Dashboard Home Page Scripts
// Place in: static/js/home.js

(function () {
    const HOURS_PER_SESSION = 2;   // expected max hours per session

    /* ── helpers ── */
    function qs(id)      { return document.getElementById(id); }
    function set(id, v)  { const e = qs(id); if (e) e.textContent = v; }
    function html(id, v) { const e = qs(id); if (e) e.innerHTML   = v; }
    function setBar(id, pct) {
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const e = qs(id);
            if (e) e.style.width = Math.min(100, Math.max(0, pct)) + '%';
        }));
    }

    function step(label, value, isResult) {
        return `<div class="bd-step">
                  <span class="bd-step-label">${label}</span>
                  <span class="bd-step-value${isResult ? ' result' : ''}">${value}</span>
                </div>`;
    }

    /* ── modal open/close ── */
    const overlay = qs('bdOverlay');
    if (!overlay) return;

    qs('bdClose').addEventListener('click', close);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    function close() {
        overlay.classList.remove('open');
        document.body.style.overflow = '';
    }

    function open(d, rank) {
        /* Header */
        const initials = (d.firstName[0] + d.lastName[0]).toUpperCase();
        set('bdAvatar', initials);
        set('bdName',   d.lastName + ', ' + d.firstName);
        set('bdMeta',   d.course + ' · ' + d.yearLevel);

        /* Hero */
        set('bdScoreNum', d.composite);
        const medals = ['🥇', '🥈', '🥉'];
        qs('bdRankChip').textContent = rank <= 3
            ? medals[rank - 1] + ' Rank #' + rank
            : 'Rank #' + rank;

        const sessions    = parseInt(d.total_sessions)     || 0;
        const starTotal   = parseInt(d.total_admin_rating) || 0;
        const minutes     = parseInt(d.total_minutes)      || 0;
        const tasksDone   = parseInt(d.tasks_done)         || 0;
        const hoursLogged = (minutes / 60).toFixed(1);

        /* ── Recalculate hours norm based on sessions × 2 hrs ── */
        const expectedHours = sessions * HOURS_PER_SESSION;
        const actualHours   = minutes / 60;
        const hoursNorm     = expectedHours > 0
            ? Math.min(100, (actualHours / expectedHours) * 100)
            : 0;

        const ratingNorm = parseFloat(d.rating_norm);
        const taskRate   = parseFloat(d.task_rate);

        const ratingW = (ratingNorm * 0.50).toFixed(2);
        const hoursW  = (hoursNorm  * 0.30).toFixed(2);
        const taskW   = (taskRate   * 0.20).toFixed(2);

        // Recompute composite with new hours formula
        const composite = (parseFloat(ratingW) + parseFloat(hoursW) + parseFloat(taskW)).toFixed(1);

        /* Update formula display */
        const formulaEl = document.querySelector('.bd-formula');
        if (formulaEl) {
            formulaEl.innerHTML = `Score = <strong>(Admin Stars ÷ 3) × 50%</strong>
              &nbsp;+&nbsp; <strong>(Actual Hrs ÷ Expected Hrs × 100) × 30%</strong>
              &nbsp;+&nbsp; <strong>Task Rate × 20%</strong>`;
        }

        /* ── ① Admin Rating ── */
        html('bdRatingSteps',
            step('Admin stars earned across all ' + sessions + ' session' + (sessions !== 1 ? 's' : ''),
                 starTotal + '★') +
            step('Convert to points <em>(' + starTotal + ' stars ÷ 3)</em>',
                 ratingNorm.toFixed(2) + ' pts') +
            step('Apply 50% weight <em>(' + ratingNorm.toFixed(2) + ' × 0.50)</em>',
                 '+' + ratingW + ' pts', true)
        );
        set('bdRatingPts', '+' + ratingW);
        setBar('bdRatingBar', ratingNorm * 100 / 3);

        /* ── ② Hours ── */
        const cappedNote = hoursNorm >= 100
            ? '✓ Full attendance!'
            : parseFloat(hoursLogged).toFixed(1) + ' of ' + expectedHours.toFixed(1) + ' expected hrs';
        html('bdHoursSteps',
            step('Total time logged across all sessions',
                 hoursLogged + ' hrs (' + minutes + ' min)') +
            step('Expected hours <em>(' + sessions + ' sessions × ' + HOURS_PER_SESSION + ' hrs)</em>',
                 expectedHours.toFixed(1) + ' hrs expected') +
            step('Attendance rate <em>(' + hoursLogged + ' ÷ ' + expectedHours.toFixed(1) + ') × 100, capped at 100</em>',
                 hoursNorm.toFixed(1) + ' / 100 <em style="color:#94a3b8">(' + cappedNote + ')</em>') +
            step('Apply 30% weight <em>(' + hoursNorm.toFixed(1) + ' × 0.30)</em>',
                 '+' + hoursW + ' pts', true)
        );
        set('bdHoursPts', '+' + hoursW);
        setBar('bdHoursBar', hoursNorm);

        /* ── ③ Task Completion ── */
        html('bdTaskSteps',
            step('Sessions where task was marked complete',
                 tasksDone + ' out of ' + sessions + ' session' + (sessions !== 1 ? 's' : '')) +
            step('Completion rate <em>(' + tasksDone + ' ÷ ' + sessions + ') × 100</em>',
                 taskRate.toFixed(1) + '%') +
            step('Apply 20% weight <em>(' + taskRate.toFixed(1) + ' × 0.20)</em>',
                 '+' + taskW + ' pts', true)
        );
        set('bdTaskPts', '+' + taskW);
        setBar('bdTaskBar', taskRate);

        /* ── Final sum ── */
        html('bdSumEq',
            ratingW + ' <span>+</span> ' +
            hoursW  + ' <span>+</span> ' +
            taskW   + ' <span>=</span>');
        set('bdSumTotal', composite);

        /* ── Stats strip ── */
        set('bdStatSessions', sessions);
        set('bdStatHours',    hoursLogged + 'h');
        set('bdStatTasks',    tasksDone);
        set('bdStatRating',   starTotal + '★');

        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    /* ── Attach click to every leaderboard row ── */
    document.querySelectorAll('.lb-table tbody tr[data-student]').forEach(function (row) {
        row.addEventListener('click', function () {
            try {
                const d    = JSON.parse(this.dataset.student);
                const rank = parseInt(this.dataset.rank) || 99;
                open(d, rank);
            } catch (err) {
                console.error('Breakdown parse error', err);
            }
        });
    });

})();