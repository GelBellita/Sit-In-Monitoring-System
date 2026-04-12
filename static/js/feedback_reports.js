// ── feedback_reports.js ───────────────────────────────────────────────────────
// Live filter only — foul-word blocking is enforced server-side on submit.
// Place in: static/js/feedback_reports.js
// ─────────────────────────────────────────────────────────────────────────────

(function () {

    const tbody       = document.getElementById('feedbackTbody');
    const filterInput = document.getElementById('filterInput');
    const footerInfo  = document.getElementById('footerInfo');

    if (!tbody) return;

    const allRows = Array.from(tbody.querySelectorAll('.fb-row'));

    if (filterInput) {
        filterInput.addEventListener('input', function () {
            const q = this.value.toLowerCase().trim();
            let visible = 0;

            allRows.forEach(row => {
                const match = !q || [
                    row.dataset.id   || '',
                    row.dataset.name || '',
                    row.dataset.lab  || '',
                    row.dataset.date || '',
                    row.dataset.msg  || '',
                ].some(v => v.toLowerCase().includes(q));

                row.classList.toggle('hidden', !match);
                if (match) visible++;
            });

            // Re-number visible rows
            let idx = 1;
            allRows.forEach(row => {
                if (!row.classList.contains('hidden')) {
                    row.querySelector('.row-num').textContent = idx++;
                }
            });

            if (footerInfo) {
                const total = allRows.length;
                footerInfo.textContent = q
                    ? `Showing ${visible} of ${total} response${total !== 1 ? 's' : ''}`
                    : `Showing all ${total} response${total !== 1 ? 's' : ''}`;
            }
        });
    }

})();