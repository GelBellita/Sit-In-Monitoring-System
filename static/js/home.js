// ── home.js — Leaderboard Score Breakdown Modal

(function () {
    const HOURS_PER_SESSION = 2;

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

    function init() {
        const overlay = qs('bdOverlay');
        if (!overlay) {
            console.warn('bdOverlay not found — modal will not work');
            return;
        }

        function closeModal() {
            overlay.classList.remove('open');
            document.body.style.overflow = '';
        }

        qs('bdClose').addEventListener('click', closeModal);
        overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

        function openModal(d, rank) {
            const sessions  = parseInt(d.total_sessions)     || 0;
            const starTotal = parseInt(d.total_admin_rating) || 0;
            const minutes   = parseInt(d.total_minutes)      || 0;
            const tasksDone = parseInt(d.tasks_done)         || 0;

            const actualHours   = minutes / 60;
            const expectedHours = sessions * HOURS_PER_SESSION;
            const maxStars      = sessions * 3;

            const ratingNorm = maxStars > 0      ? Math.min(100, (starTotal / maxStars) * 100)         : 0;
            const hoursNorm  = expectedHours > 0 ? Math.min(100, (actualHours / expectedHours) * 100)  : 0;
            const taskRate   = sessions > 0      ? (tasksDone / sessions) * 100                        : 0;

            const ratingW   = (ratingNorm * 0.50).toFixed(2);
            const hoursW    = (hoursNorm  * 0.30).toFixed(2);
            const taskW     = (taskRate   * 0.20).toFixed(2);
            const composite = (parseFloat(ratingW) + parseFloat(hoursW) + parseFloat(taskW)).toFixed(1);

            /* Header */
            set('bdAvatar', (d.firstName[0] + d.lastName[0]).toUpperCase());
            set('bdName',   d.lastName + ', ' + d.firstName);
            set('bdMeta',   d.course + ' · ' + d.yearLevel);

            /* Hero */
            set('bdScoreNum', composite);
            const medals = ['🥇', '🥈', '🥉'];
            qs('bdRankChip').textContent = rank <= 3 ? medals[rank - 1] + ' Rank #' + rank : 'Rank #' + rank;

            /* ① Admin Rating — 50% */
            html('bdRatingSteps',
                step('Admin stars earned across ' + sessions + ' session' + (sessions !== 1 ? 's' : ''), starTotal + '★') +
                step('Max possible stars <em>(' + sessions + ' sessions × 3 stars)</em>', maxStars + '★ max') +
                step('Rating score <em>(' + starTotal + ' ÷ ' + maxStars + ') × 100, capped at 100</em>', ratingNorm.toFixed(1) + ' / 100') +
                step('Apply 50% weight <em>(' + ratingNorm.toFixed(1) + ' × 0.50)</em>', '+' + ratingW + ' pts', true)
            );
            set('bdRatingPts', '+' + ratingW);
            setBar('bdRatingBar', ratingNorm);

            /* ② Hours — 30% */
            const hoursLogged = actualHours.toFixed(1);
            const cappedNote  = hoursNorm >= 100
                ? '✓ Full attendance!'
                : hoursLogged + ' of ' + expectedHours.toFixed(1) + ' expected hrs';
            html('bdHoursSteps',
                step('Total time logged', hoursLogged + ' hrs (' + minutes + ' min)') +
                step('Expected hours <em>(' + sessions + ' sessions × ' + HOURS_PER_SESSION + ' hrs)</em>', expectedHours.toFixed(1) + ' hrs') +
                step('Session rate, capped at 100 <em>(' + hoursLogged + ' ÷ ' + expectedHours.toFixed(1) + ' × 100)</em>', '<em style="color:#94a3b8">' + cappedNote + '</em>') +
                step('Apply 30% weight <em>(' + hoursNorm.toFixed(1) + ' × 0.30)</em>', '+' + hoursW + ' pts', true)
            );
            set('bdHoursPts', '+' + hoursW);
            setBar('bdHoursBar', hoursNorm);

            /* ③ Task Completion — 20% */
            html('bdTaskSteps',
                step('Sessions with task marked complete', tasksDone + ' of ' + sessions + ' session' + (sessions !== 1 ? 's' : '')) +
                step('Completion rate <em>(' + tasksDone + ' ÷ ' + sessions + ' × 100)</em>', taskRate.toFixed(1) + '%') +
                step('Apply 20% weight <em>(' + taskRate.toFixed(1) + ' × 0.20)</em>', '+' + taskW + ' pts', true)
            );
            set('bdTaskPts', '+' + taskW);
            setBar('bdTaskBar', taskRate);

            /* Final sum */
            html('bdSumEq', ratingW + ' <span>+</span> ' + hoursW + ' <span>+</span> ' + taskW + ' <span>=</span>');
            set('bdSumTotal', composite);

            /* Stats strip */
            set('bdStatSessions', sessions);
            set('bdStatHours',    hoursLogged + 'h');
            set('bdStatTasks',    tasksDone);
            set('bdStatRating',   starTotal + '★');

            overlay.classList.add('open');
            document.body.style.overflow = 'hidden';
        }

        /* Attach click to every leaderboard row on any page */
        document.querySelectorAll('.lb-table tbody tr[data-student], .landing-lb-table tbody tr[data-student]').forEach(function (row) {
            row.addEventListener('click', function () {
                try {
                    const d    = JSON.parse(this.dataset.student);
                    const rank = parseInt(this.dataset.rank) || 99;
                    openModal(d, rank);
                } catch (err) {
                    console.error('Breakdown parse error:', err, this.dataset.student);
                }
            });
        });
    }

    /* Run after DOM is fully ready */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();