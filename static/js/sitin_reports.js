// ── sitin_reports.js ─────────────────────────────────────────────────────────
// Place in: static/js/sitin_reports.js

(function () {

    const tbody       = document.getElementById('reportTbody');
    if (!tbody) return;

    const allRows     = Array.from(tbody.querySelectorAll('.report-row'));
    const datePicker  = document.getElementById('datePicker');
    const filterInput = document.getElementById('filterInput');
    const btnReset    = document.getElementById('btnReset');
    const chipShowing = document.getElementById('chipShowing');
    const footerInfo  = document.getElementById('footerInfo');

    // ── Filtering ──────────────────────────────────────────────────────────────
    function applyFilters() {
        const date = datePicker.value;
        const q    = (filterInput.value || '').toLowerCase().trim();
        let visible = 0;

        allRows.forEach(row => {
            const matchDate = !date || row.dataset.date === date;
            const matchText = !q || [
                row.dataset.id, row.dataset.name, row.dataset.course,
                row.dataset.purpose, row.dataset.lab, row.dataset.date,
            ].some(v => v.toLowerCase().includes(q));

            const show = matchDate && matchText;
            row.classList.toggle('hidden', !show);
            if (show) visible++;
        });

        let idx = 1;
        allRows.forEach(row => {
            if (!row.classList.contains('hidden'))
                row.querySelector('.row-num').textContent = idx++;
        });

        const total = allRows.length;
        if (chipShowing) chipShowing.textContent = visible;
        if (footerInfo) {
            footerInfo.textContent = (date || q)
                ? `Showing ${visible} of ${total} record${total !== 1 ? 's' : ''}`
                : `Showing all ${total} record${total !== 1 ? 's' : ''}`;
        }
    }

    datePicker?.addEventListener('change', applyFilters);
    filterInput?.addEventListener('input', applyFilters);
    btnReset?.addEventListener('click', () => {
        datePicker.value = '';
        filterInput.value = '';
        applyFilters();
    });
    applyFilters();

    // ── Helpers ────────────────────────────────────────────────────────────────
    function getVisibleData() {
        const headers = ['#', 'ID No.', 'Name', 'Course', 'Year', 'Purpose', 'Lab', 'Login', 'Logout', 'Date'];
        const rows = [];
        allRows.forEach(row => {
            if (row.classList.contains('hidden')) return;
            rows.push(Array.from(row.querySelectorAll('td')).map(c => c.textContent.trim()));
        });
        return { headers, rows };
    }

    function triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a   = Object.assign(document.createElement('a'), { href: url, download: filename });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

    // ── CSV ────────────────────────────────────────────────────────────────────
    document.getElementById('btnCSV')?.addEventListener('click', () => {
        const { headers, rows } = getVisibleData();
        const lines = [headers, ...rows].map(r =>
            r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')
        );
        triggerDownload(
            new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' }),
            'sitin_report.csv'
        );
    });

    // ── Excel ──────────────────────────────────────────────────────────────────
    document.getElementById('btnExcel')?.addEventListener('click', () => {
        if (typeof XLSX === 'undefined') {
            alert('Excel library not loaded. Check your internet connection.');
            return;
        }
        const { headers, rows } = getVisibleData();
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
        ws['!cols'] = [4, 13, 24, 11, 8, 16, 9, 8, 8, 13].map(w => ({ wch: w }));
        XLSX.utils.book_append_sheet(wb, ws, 'Sit-in Records');
        const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        triggerDownload(
            new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
            'sitin_report.xlsx'
        );
    });

    // ── PDF — portrait, Letter (215.9 × 279.4 mm) ────────────────────────────
    document.getElementById('btnPDF')?.addEventListener('click', () => {
        const jsPDFLib = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
        if (!jsPDFLib) {
            alert('PDF library not loaded. Check your internet connection.');
            return;
        }

        const doc = new jsPDFLib({ orientation: 'portrait', unit: 'mm', format: 'letter' });

        // Letter portrait usable width: 215.9 mm − 2×14 mm margins = 187.9 mm
        const pageW   = doc.internal.pageSize.getWidth();   // 215.9
        const margin  = 14;
        const usableW = pageW - margin * 2;                 // 187.9 mm

        // ── Header banner ────────────────────────────────────────────────────
        doc.setFillColor(26, 39, 68);
        doc.rect(0, 0, pageW, 22, 'F');

        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('CCS Sit-in Records Report', margin, 14);

        const now = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(180, 195, 220);
        doc.text('Generated: ' + now, pageW - margin, 14, { align: 'right' });

        let startY = 28;
        const dateVal   = datePicker.value;
        const filterVal = filterInput.value.trim();
        if (dateVal || filterVal) {
            const note = [
                dateVal   ? 'Date: ' + dateVal   : '',
                filterVal ? 'Filter: ' + filterVal : '',
            ].filter(Boolean).join('   ·   ');
            doc.setFontSize(8);
            doc.setTextColor(100, 116, 139);
            doc.text(note, margin, startY);
            startY += 6;
        }

        const { headers, rows } = getVisibleData();

        // ── Column widths — must sum to exactly usableW (187.9 mm) ───────────
        // #=7  ID=20  Name=38  Course=17  Year=14  Purpose=24  Lab=15  Login=14  Logout=14  Date=24.9
        // Total = 7+20+38+17+14+24+15+14+14+24.9 = 187.9 ✓
        const colWidths = [7, 20, 38, 17, 14, 24, 15, 14, 14, 24.9];

        doc.autoTable({
            head: [headers],
            body: rows,
            startY,
            margin: { left: margin, right: margin },
            tableWidth: usableW,
            styles: {
                fontSize: 7,
                cellPadding: { top: 2.5, bottom: 2.5, left: 2.5, right: 2.5 },
                textColor: [45, 55, 72],
                overflow: 'linebreak',
                lineColor: [220, 227, 237],
                lineWidth: 0.1,
            },
            headStyles: {
                fillColor: [26, 39, 68],
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 7,
                halign: 'left',
                cellPadding: { top: 3, bottom: 3, left: 2.5, right: 2.5 },
            },
            alternateRowStyles: { fillColor: [247, 249, 252] },
            columnStyles: {
                0: { cellWidth: colWidths[0],  halign: 'center' },
                1: { cellWidth: colWidths[1] },
                2: { cellWidth: colWidths[2] },
                3: { cellWidth: colWidths[3] },
                4: { cellWidth: colWidths[4] },
                5: { cellWidth: colWidths[5] },
                6: { cellWidth: colWidths[6] },
                7: { cellWidth: colWidths[7],  halign: 'center' },
                8: { cellWidth: colWidths[8],  halign: 'center' },
                9: { cellWidth: colWidths[9] },
            },
            didDrawPage(data) {
                const pg    = doc.internal.getCurrentPageInfo().pageNumber;
                const total = doc.internal.getNumberOfPages();
                const footY = doc.internal.pageSize.getHeight() - 8;
                doc.setFontSize(7);
                doc.setTextColor(160, 174, 192);
                doc.text(
                    'University of Cebu — College of Computer Studies Sit-in Monitoring System',
                    margin, footY
                );
                doc.text(`Page ${pg} of ${total}`, pageW - margin, footY, { align: 'right' });
            },
        });

        doc.save('sitin_report.pdf');
    });

    // ── Print ─────────────────────────────────────────────────────────────────
    document.getElementById('btnPrint')?.addEventListener('click', () => {
        window.print();
    });

})();