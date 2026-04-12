// ── sitin_records.js ─────────────────────────────────────────────────────────
// Place in: static/js/sitin_records.js

(function () {

    // ── STACKED BAR CHART ─────────────────────────────────────────────────────
    const chartDataEl = document.getElementById('chartData');
    if (chartDataEl && typeof Chart !== 'undefined') {
        try {
            const raw = JSON.parse(chartDataEl.textContent);
            buildStackedBarChart(raw.by_purpose_lab);
        } catch (e) {
            console.error('Chart data parse error:', e);
        }
    }

    function buildStackedBarChart(rows) {
        if (!rows || rows.length === 0) return;

        const purposes = [...new Set(rows.map(r => r.purpose).filter(Boolean))];
        const labs     = [...new Set(rows.map(r => r.lab).filter(Boolean))].sort();

        if (purposes.length === 0 || labs.length === 0) return;

        const counts = {};
        labs.forEach(lab => {
            counts[lab] = {};
            purposes.forEach(p => counts[lab][p] = 0);
        });
        rows.forEach(r => {
            if (r.lab && r.purpose) counts[r.lab][r.purpose]++;
        });

        const labColors = [
            '#3b82f6',
            '#10b981',
            '#f59e0b',
            '#ef4444',
            '#8b5cf6',
            '#ec4899',
            '#14b8a6',
        ];

        const datasets = labs.map((lab, i) => ({
            label: 'Lab ' + lab,
            data: purposes.map(p => counts[lab][p]),
            backgroundColor: labColors[i % labColors.length],
            borderColor: '#fff',
            borderWidth: 2,
            borderRadius: 0,
            borderSkipped: false,
        }));

        const ctx = document.getElementById('recordsBarChart');
        if (!ctx) return;

        // Draw only the lab number centered inside each segment
        const inBarLabelPlugin = {
            id: 'inBarLabel',
            afterDatasetsDraw(chart) {
                const { ctx: c } = chart;
                chart.data.datasets.forEach((dataset, dsIdx) => {
                    const meta = chart.getDatasetMeta(dsIdx);
                    if (meta.hidden) return;
                    meta.data.forEach((bar, idx) => {
                        const value = dataset.data[idx];
                        if (!value || value < 1) return;
                        const { x, y, height } = bar.getProps(['x', 'y', 'height']);
                        if (height < 16) return;
                        const labNum = dataset.label.replace('Lab ', '');
                        c.save();
                        c.fillStyle = '#fff';
                        c.font = 'bold 12px system-ui, sans-serif';
                        c.textAlign = 'center';
                        c.textBaseline = 'middle';
                        c.fillText(labNum, x, y + height / 2);
                        c.restore();
                    });
                });
            }
        };

        new Chart(ctx, {
            type: 'bar',
            plugins: [inBarLabelPlugin],
            data: { labels: purposes, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        stacked: true,
                        grid: { display: false },
                        ticks: {
                            font: { size: 12, weight: '700' },
                            color: '#374151',
                        },
                        border: { color: '#e5e7eb' },
                        title: { display: false }         // ← removed subtitle text
                    },
                    y: {
                        stacked: true,
                        beginAtZero: true,
                        ticks: { display: false },        // ← hide Y-axis numbers
                        grid: { color: '#f3f4f6' },       // ← keep horizontal lines
                        border: { display: false },
                        title: { display: false }         // ← hide "Total Sessions" label
                    }
                },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        position: 'top',
                        align: 'end',
                        labels: {
                            boxWidth: 14,
                            boxHeight: 14,
                            padding: 16,
                            font: { size: 12, weight: '600' },
                            color: '#374151',
                            usePointStyle: true,
                            pointStyle: 'rectRounded',
                        }
                    },
                    tooltip: {
                        backgroundColor: '#1a2744',
                        titleColor: '#fff',
                        bodyColor: 'rgba(255,255,255,.85)',
                        padding: 14,
                        cornerRadius: 10,
                        titleFont: { size: 13, weight: '700' },
                        bodyFont: { size: 12 },
                        footerFont: { size: 11 },
                        callbacks: {
                            title: (items) => '📋  ' + items[0].label,
                            label: (item) => {
                                const val = item.raw;
                                if (val === 0) return null;
                                return `  ${item.dataset.label}:  ${val} session${val !== 1 ? 's' : ''}`;
                            },
                            footer: (items) => {
                                const total = items.reduce((s, i) => s + i.raw, 0);
                                return `  Total: ${total} session${total !== 1 ? 's' : ''}`;
                            }
                        },
                        filter: (item) => item.raw > 0
                    }
                }
            }
        });
    }


    // ── TABLE SEARCH ──────────────────────────────────────────────────────────
    const tbody       = document.getElementById('recordsTbody');
    const searchInput = document.getElementById('tableSearch');
    const infoEl      = document.getElementById('paginationInfo');

    if (!tbody) return;

    const allRows = Array.from(tbody.querySelectorAll('.record-row'));

    searchInput?.addEventListener('input', function () {
        const q = this.value.toLowerCase().trim();
        let visible = 0;

        allRows.forEach(row => {
            const match =
                row.dataset.id.toLowerCase().includes(q) ||
                row.dataset.name.toLowerCase().includes(q) ||
                (row.dataset.course || '').toLowerCase().includes(q) ||
                row.dataset.purpose.toLowerCase().includes(q) ||
                row.dataset.lab.toLowerCase().includes(q) ||
                row.dataset.date.toLowerCase().includes(q);

            row.classList.toggle('hidden', !match);
            if (match) visible++;
        });

        let idx = 1;
        allRows.forEach(row => {
            if (!row.classList.contains('hidden')) {
                row.querySelector('.row-num').textContent = idx++;
            }
        });

        if (infoEl) {
            infoEl.textContent = q
                ? `Showing ${visible} of ${allRows.length} records`
                : `Showing all ${allRows.length} record${allRows.length !== 1 ? 's' : ''}`;
        }
    });

})();