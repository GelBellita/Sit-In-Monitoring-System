// ── analytics.js — Place in static/js/analytics.js
(function () {

    // ── Read data from <script type="application/json"> tag ──────────────────
    // Using textContent instead of getAttribute() avoids Jinja2 HTML-attribute
    // escaping that turns " into &#34; and breaks JSON.parse().
    const chartDataEl = document.getElementById('chartData');
    if (!chartDataEl) return;

    let LAB_VISITS_DATA, PURPOSE_LAB_DATA, HOURS_TARGET;
    try {
        const parsed     = JSON.parse(chartDataEl.textContent);
        LAB_VISITS_DATA  = parsed.lab_visits      || [];
        PURPOSE_LAB_DATA = parsed.purpose_per_lab || [];
        HOURS_TARGET     = parsed.hours_target    || 30;
    } catch (e) {
        console.error('Analytics: failed to parse chart data', e);
        LAB_VISITS_DATA  = [];
        PURPOSE_LAB_DATA = [];
        HOURS_TARGET     = 30;
    }

    const COLORS = {
        navy: '#1a2744', blue: '#3b5bdb', green: '#10b981', amber: '#f59e0b',
        red: '#ef4444', purple: '#7c3aed', teal: '#0891b2', pink: '#ec4899',
        lime: '#84cc16', orange: '#f97316',
    };
    const COLOR_PALETTE = Object.values(COLORS);
    function getColor(i) { return COLOR_PALETTE[i % COLOR_PALETTE.length]; }

    Chart.defaults.font.family = "'Sora', system-ui, sans-serif";
    Chart.defaults.color       = '#64748b';

    // ── 1. Most Visited Labs ──────────────────────────────────────────────────
    (function buildLabVisits() {
        const ctx = document.getElementById('labVisitsChart');
        if (!ctx) return;
        if (!LAB_VISITS_DATA.length) { showEmpty(ctx, 'No lab visit data yet'); return; }

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: LAB_VISITS_DATA.map(d => 'Lab ' + d.labRoom),
                datasets: [
                    {
                        label: 'Total Sit-ins',
                        data: LAB_VISITS_DATA.map(d => d.total_visits),
                        backgroundColor: COLORS.navy,
                        borderRadius: 6
                    },
                    {
                        label: 'Total Hours',
                        data: LAB_VISITS_DATA.map(d => parseFloat((d.total_minutes / 60).toFixed(1))),
                        backgroundColor: COLORS.amber,
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true, maintainAspectRatio: true, aspectRatio: 1.8,
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: c => ` ${c.dataset.label}: ${c.formattedValue}${c.datasetIndex === 1 ? ' hrs' : ' sessions'}`
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: { beginAtZero: true, grid: { color: '#f0f3f8' }, ticks: { precision: 0 } }
                }
            }
        });
    })();

    // ── 2. Most Common Purpose — Pie Chart (all labs combined) ───────────────
    (function buildPurposeChart() {
        const ctx = document.getElementById('purposeChart');
        if (!ctx) return;
        if (!PURPOSE_LAB_DATA.length) { showEmpty(ctx, 'No purpose data yet'); return; }

        // Jewel-tone palette — rich, saturated colors that match the navy/gold theme
        const JEWELS = [
            '#3b5bdb', '#f59e0b', '#10b981', '#ef4444',
            '#7c3aed', '#0891b2', '#ec4899', '#f97316',
            '#84cc16', '#06b6d4',
        ];
        function getPastel(i) { return JEWELS[i % JEWELS.length]; }

        // Aggregate counts across ALL labs per purpose
        const totals = {};
        PURPOSE_LAB_DATA.forEach(d => {
            if (!d.purpose) return;
            totals[d.purpose] = (totals[d.purpose] || 0) + d.cnt;
        });

        // Sort descending so the biggest slice comes first
        const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
        const labels = sorted.map(([purpose]) => purpose);
        const values = sorted.map(([, cnt])   => cnt);
        const total  = values.reduce((s, v) => s + v, 0);

        // Custom plugin: draw purpose name + % directly on each slice
        const sliceLabelPlugin = {
            id: 'pieSliceLabel',
            afterDraw(chart) {
                const { ctx: c } = chart;
                const meta = chart.getDatasetMeta(0);
                meta.data.forEach((arc, i) => {
                    if (arc.hidden) return;
                    const arcSpan = arc.endAngle - arc.startAngle;
                    if (arcSpan < 0.4) return; // skip slivers that are too thin

                    const midAngle = arc.startAngle + arcSpan / 2;
                    const r        = arc.outerRadius * 0.68; // 68% out from center
                    const x        = arc.x + Math.cos(midAngle) * r;
                    const y        = arc.y + Math.sin(midAngle) * r;
                    const pct      = ((values[i] / total) * 100).toFixed(1) + '%';

                    c.save();
                    c.textAlign    = 'center';
                    c.textBaseline = 'middle';
                    c.shadowColor  = 'rgba(0,0,0,0.18)';
                    c.shadowBlur   = 3;

                    // Purpose name (line 1)
                    c.font      = 'bold 11px system-ui, sans-serif';
                    c.fillStyle = '#ffffff';
                    c.fillText(labels[i], x, y - 7);

                    // Percentage (line 2)
                    c.font      = '10px system-ui, sans-serif';
                    c.fillStyle = 'rgba(255,255,255,0.85)';
                    c.fillText(pct, x, y + 7);

                    c.restore();
                });
            }
        };

        new Chart(ctx, {
            type: 'pie',
            plugins: [sliceLabelPlugin],
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: labels.map((_, i) => getPastel(i)),
                    borderWidth: 2,
                    borderColor: '#fff',
                    hoverOffset: 8,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                aspectRatio: 1.8,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            boxWidth: 13,
                            padding: 12,
                            font: { size: 11 },
                            generateLabels(chart) {
                                const meta = chart.getDatasetMeta(0);
                                return chart.data.labels.map((label, i) => ({
                                    text: `${label}  (${((values[i] / total) * 100).toFixed(1)}%)`,
                                    fillStyle: getPastel(i),
                                    strokeStyle: '#fff',
                                    lineWidth: 2,
                                    hidden: meta.data[i] && meta.data[i].hidden,
                                    index: i,
                                }));
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: c => {
                                const pct = ((c.raw / total) * 100).toFixed(1);
                                return `  ${c.label}: ${c.raw} sessions (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    })();

    // ── 3. Hours Donut ────────────────────────────────────────────────────────
    (function buildHoursDonut() {
        const ctx = document.getElementById('hoursDonutChart');
        if (!ctx) return;

        // Use all labs that have at least 1 visit — don't require minutes > 0
        // because Active sessions haven't been logged out yet (totalMinutes = 0)
        const data = LAB_VISITS_DATA.filter(d => d.total_visits > 0);
        if (!data.length) { showEmpty(ctx, 'No hours data yet'); return; }

        // Fall back to showing visit counts when no session has been closed yet
        const useHours = data.some(d => d.total_minutes > 0);
        const values   = data.map(d =>
            useHours
                ? parseFloat((d.total_minutes / 60).toFixed(1))
                : d.total_visits
        );
        const unit = useHours ? 'hrs' : 'sessions';

        // Custom plugin: draw "X.Xh" or "X sessions" labels on each visible slice
        const donutLabelPlugin = {
            id: 'donutSliceLabel',
            afterDraw(chart) {
                const { ctx: c, chartArea } = chart;
                const meta = chart.getDatasetMeta(0);
                meta.data.forEach((arc, i) => {
                    if (arc.hidden) return;
                    const val = values[i];
                    if (!val) return;

                    // midpoint angle of this arc
                    const midAngle  = arc.startAngle + (arc.endAngle - arc.startAngle) / 2;
                    const outerR    = arc.outerRadius;
                    const innerR    = arc.innerRadius;
                    const labelR    = innerR + (outerR - innerR) * 0.55; // sit in the band
                    const x         = arc.x + Math.cos(midAngle) * labelR;
                    const y         = arc.y + Math.sin(midAngle) * labelR;

                    // Only draw if the arc is tall enough to fit text
                    const arcSpan = arc.endAngle - arc.startAngle;
                    if (arcSpan < 0.35) return;

                    const label = useHours ? val.toFixed(1) + 'h' : val + ' ses';

                    c.save();
                    c.font         = 'bold 11px system-ui, sans-serif';
                    c.fillStyle    = '#fff';
                    c.textAlign    = 'center';
                    c.textBaseline = 'middle';
                    c.shadowColor  = 'rgba(0,0,0,0.35)';
                    c.shadowBlur   = 3;
                    c.fillText(label, x, y);
                    c.restore();
                });
            }
        };

        new Chart(ctx, {
            type: 'doughnut',
            plugins: [donutLabelPlugin],
            data: {
                labels: data.map(d => 'Lab ' + d.labRoom),
                datasets: [{
                    data: values,
                    backgroundColor: COLOR_PALETTE.slice(0, data.length),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: true, cutout: '60%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { boxWidth: 12, padding: 10, font: { size: 11 } }
                    },
                    tooltip: {
                        callbacks: {
                            label: c => ` ${c.label}: ${c.formattedValue} ${unit}`
                        }
                    }
                }
            }
        });
    })();

    // ── Shared helper ─────────────────────────────────────────────────────────
    function showEmpty(canvas, msg) {
        const wrap = canvas.closest('.chart-wrap');
        if (wrap) {
            canvas.style.display = 'none';
            const p = document.createElement('p');
            p.style.cssText = 'text-align:center;color:#94a3b8;font-size:.85rem;padding:32px 0;';
            p.textContent = msg;
            wrap.appendChild(p);
        }
    }

    // ── 4. Leaderboard Modal ──────────────────────────────────────────────────
    (function initLeaderboardModal() {

        document.body.insertAdjacentHTML('beforeend', `
        <div id="lbModal" class="lb-modal-overlay" style="display:none">
          <div class="lb-modal-box">

            <div class="lb-modal-header">
              <div class="lb-modal-avatar" id="lbModalAvatar"></div>
              <div style="flex:1">
                <div class="lb-modal-name" id="lbModalName"></div>
                <div class="lb-modal-meta" id="lbModalMeta"></div>
              </div>
              <button class="lb-modal-close" id="lbModalClose">&times;</button>
            </div>

            <div class="lb-modal-hero">
              <div class="lb-modal-composite" id="lbModalComposite"></div>
              <div class="lb-modal-composite-lbl">Composite Score</div>
              <div class="lb-modal-formula">= (Admin Rating pts × 50%) + (Hours score × 30%) + (Task rate × 20%)</div>
            </div>

            <div class="lb-modal-breakdown">
              <div class="lb-modal-section-title">Step-by-step calculation</div>

              <!-- Admin Rating -->
              <div class="lb-calc-block">
                <div class="lb-calc-header">
                  <span class="lb-calc-icon" style="background:#dbeafe;color:#1e40af">⭐</span>
                  <span class="lb-calc-label">Admin Rating <span class="lb-calc-weight">— 50% of score</span></span>
                  <span class="lb-calc-contrib" id="lbRatingContrib"></span>
                </div>
                <div class="lb-calc-steps" id="lbRatingSteps"></div>
                <div class="lb-calc-bar-wrap"><div class="lb-calc-bar" id="lbRatingBar" style="background:linear-gradient(90deg,#3b5bdb,#60a5fa);width:0"></div></div>
              </div>

              <!-- Total Hours -->
              <div class="lb-calc-block">
                <div class="lb-calc-header">
                  <span class="lb-calc-icon" style="background:#d1fae5;color:#065f46">⏱</span>
                  <span class="lb-calc-label">Total Hours <span class="lb-calc-weight">— 30% of score</span></span>
                  <span class="lb-calc-contrib" id="lbHoursContrib"></span>
                </div>
                <div class="lb-calc-steps" id="lbHoursSteps"></div>
                <div class="lb-calc-bar-wrap"><div class="lb-calc-bar" id="lbHoursBar" style="background:linear-gradient(90deg,#10b981,#34d399);width:0"></div></div>
              </div>

              <!-- Task Completion -->
              <div class="lb-calc-block">
                <div class="lb-calc-header">
                  <span class="lb-calc-icon" style="background:#fef3c7;color:#92400e">✅</span>
                  <span class="lb-calc-label">Task Completion <span class="lb-calc-weight">— 20% of score</span></span>
                  <span class="lb-calc-contrib" id="lbTaskContrib"></span>
                </div>
                <div class="lb-calc-steps" id="lbTaskSteps"></div>
                <div class="lb-calc-bar-wrap"><div class="lb-calc-bar" id="lbTaskBar" style="background:linear-gradient(90deg,#f59e0b,#fcd34d);width:0"></div></div>
              </div>

              <div class="lb-calc-sum" id="lbCalcSum"></div>
            </div>

            <div class="lb-modal-stats">
              <div class="lb-modal-stat"><div class="lb-modal-stat-num" id="lbStatSessions"></div><div class="lb-modal-stat-lbl">Sessions</div></div>
              <div class="lb-modal-stat"><div class="lb-modal-stat-num" id="lbStatHours"></div><div class="lb-modal-stat-lbl">Hours Logged</div></div>
              <div class="lb-modal-stat"><div class="lb-modal-stat-num" id="lbStatTasks"></div><div class="lb-modal-stat-lbl">Tasks Done</div></div>
              <div class="lb-modal-stat"><div class="lb-modal-stat-num" id="lbStatRating"></div><div class="lb-modal-stat-lbl">Total Rating</div></div>
            </div>

          </div>
        </div>`);

        const modal = document.getElementById('lbModal');
        document.getElementById('lbModalClose').addEventListener('click', closeModal);
        modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
        function closeModal() { modal.style.display = 'none'; document.body.style.overflow = ''; }

        document.querySelectorAll('.lb-row').forEach(row => {
            row.style.cursor = 'pointer';
            row.title = 'Click to see score breakdown';
            row.addEventListener('click', () => {
                const d = JSON.parse(row.getAttribute('data-student') || 'null');
                if (d) openModal(d);
            });
        });

        function openModal(d) {
            // Header
            set('lbModalAvatar', (d.firstName[0] + d.lastName[0]).toUpperCase());
            set('lbModalName',   d.lastName + ', ' + d.firstName);
            set('lbModalMeta',   d.course + ' · ' + d.yearLevel);
            set('lbModalComposite', d.composite);

            const hoursLogged    = (d.total_minutes / 60).toFixed(1);
            const ratingNorm     = parseFloat(d.rating_norm);
            const hoursNorm      = parseFloat(d.hours_norm);
            const taskRate       = parseFloat(d.task_rate);
            const ratingWeighted = parseFloat((ratingNorm * 0.50).toFixed(2));
            const hoursWeighted  = parseFloat((hoursNorm  * 0.30).toFixed(2));
            const taskWeighted   = parseFloat((taskRate   * 0.20).toFixed(2));

            // ── Admin Rating ─────────────────────────────────────────────────
            html('lbRatingSteps',
                row2('Stars given by admin across all sessions',
                     '<strong>' + d.total_admin_rating + ' stars</strong> (' + d.total_sessions + ' session' + (d.total_sessions !== 1 ? 's' : '') + ')') +
                row2('Convert to points &nbsp;<span class="lb-calc-dim">' + d.total_admin_rating + ' stars ÷ 3</span>',
                     '<strong>' + ratingNorm.toFixed(2) + ' pts</strong>') +
                row2('Apply 50% weight &nbsp;<span class="lb-calc-dim">' + ratingNorm.toFixed(2) + ' × 0.50</span>',
                     '<strong class="lb-calc-result">+' + ratingWeighted + ' pts</strong>')
            );
            set('lbRatingContrib', '+' + ratingWeighted);
            setBar('lbRatingBar', Math.min(100, ratingNorm));

            // ── Total Hours ──────────────────────────────────────────────────
            const cappedNote = hoursNorm >= 100 ? ' ✓ Target reached!' : ' (target: ' + HOURS_TARGET + ' hrs)';
            html('lbHoursSteps',
                row2('Total time spent in the lab',
                     '<strong>' + hoursLogged + ' hrs</strong> (' + d.total_minutes + ' min)') +
                row2('Hours score &nbsp;<span class="lb-calc-dim">(' + hoursLogged + ' ÷ ' + HOURS_TARGET + ' hrs target) × 100, max 100</span>',
                     '<strong>' + hoursNorm.toFixed(1) + ' / 100</strong><span class="lb-calc-dim">' + cappedNote + '</span>') +
                row2('Apply 30% weight &nbsp;<span class="lb-calc-dim">' + hoursNorm.toFixed(1) + ' × 0.30</span>',
                     '<strong class="lb-calc-result">+' + hoursWeighted + ' pts</strong>')
            );
            set('lbHoursContrib', '+' + hoursWeighted);
            setBar('lbHoursBar', hoursNorm);

            // ── Task Completion ──────────────────────────────────────────────
            html('lbTaskSteps',
                row2('Sessions where task was marked complete',
                     '<strong>' + d.tasks_done + ' out of ' + d.total_sessions + ' session' + (d.total_sessions !== 1 ? 's' : '') + '</strong>') +
                row2('Completion rate &nbsp;<span class="lb-calc-dim">(' + d.tasks_done + ' ÷ ' + d.total_sessions + ') × 100</span>',
                     '<strong>' + taskRate.toFixed(1) + '%</strong>') +
                row2('Apply 20% weight &nbsp;<span class="lb-calc-dim">' + taskRate.toFixed(1) + ' × 0.20</span>',
                     '<strong class="lb-calc-result">+' + taskWeighted + ' pts</strong>')
            );
            set('lbTaskContrib', '+' + taskWeighted);
            setBar('lbTaskBar', taskRate);

            // ── Final sum ────────────────────────────────────────────────────
            html('lbCalcSum',
                '<div class="lb-sum-row">' +
                '<span class="lb-sum-eq">' +
                  ratingWeighted + ' <span class="lb-sum-op">+</span> ' +
                  hoursWeighted  + ' <span class="lb-sum-op">+</span> ' +
                  taskWeighted   + ' <span class="lb-sum-op">=</span>' +
                '</span>' +
                '<span class="lb-sum-total">' + d.composite + '</span>' +
                '</div>'
            );

            // Stats strip
            set('lbStatSessions', d.total_sessions);
            set('lbStatHours',    hoursLogged + 'h');
            set('lbStatTasks',    d.tasks_done);
            set('lbStatRating',   d.total_admin_rating + '★');

            modal.style.display = 'flex';
            document.body.style.overflow = 'hidden';
        }

        function set(id, val)  { const el = document.getElementById(id); if (el) el.textContent = val; }
        function html(id, val) { const el = document.getElementById(id); if (el) el.innerHTML   = val; }
        function setBar(id, pct) {
            requestAnimationFrame(() => requestAnimationFrame(() => {
                const el = document.getElementById(id);
                if (el) el.style.width = Math.min(100, Math.max(0, pct)) + '%';
            }));
        }
        function row2(label, value) {
            return `<div class="lb-calc-step">
                      <span class="lb-calc-step-label">${label}</span>
                      <span class="lb-calc-step-value">${value}</span>
                    </div>`;
        }

    })();

})();