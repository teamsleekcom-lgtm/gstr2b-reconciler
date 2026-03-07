import ExcelJS from 'exceljs';

const COLOR_MAP = {
    'MATCHED': '0000C851',
    'DATE_DIFF': '0000C851',
    'VALUE_MISMATCH': '00FFBB33',
    'FUZZY_MATCH': '00FFBB33',
    'BOOKS_ONLY': '00FF4444',
    '2B_ONLY': '00AA66CC',
    'ITC_NA': '00AAAAAA'
};

const styleHeader = (worksheet, rowLimit) => {
    const row = worksheet.getRow(1);
    row.font = { color: { argb: 'FFFFFFFF' }, bold: true };

    for (let i = 1; i <= rowLimit; i++) {
        const cell = row.getCell(i);
        cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: '001A237E' }
        };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
};

const autoSizeColumns = (worksheet) => {
    worksheet.columns.forEach(column => {
        let maxLength = 0;
        column["eachCell"]({ includeEmpty: true }, (cell) => {
            const colLength = cell.value ? String(cell.value).length : 10;
            if (colLength > maxLength) {
                maxLength = colLength;
            }
        });
        column.width = maxLength < 10 ? 10 : maxLength + 2;
    });
};

const appendRecordsToWs = (worksheet, results, includeGstr = true, includeBooks = true, includeDiff = true) => {
    const headers = ["Status"];
    if (includeBooks) headers.push("Books GSTIN", "Books Party", "Books Inv No", "Books Inv Date", "Books Taxable", "Books IGST", "Books CGST", "Books SGST");
    if (includeGstr) headers.push("2B GSTIN", "2B Party", "2B Inv No", "2B Inv Date", "2B Taxable", "2B IGST", "2B CGST", "2B SGST", "2B ITC Avail");
    if (includeDiff) headers.push("Diff Taxable", "Diff IGST", "Diff CGST", "Diff SGST");

    worksheet.addRow(headers);
    styleHeader(worksheet, headers.length);

    results.forEach(r => {
        const row = [r.status];
        const b = r.books_record;
        const g = r.gstr2b_record;

        if (includeBooks) {
            if (b) row.push(b.gstin, b.party_name, b.inv_no, b.inv_date, b.taxable_value, b.igst, b.cgst, b.sgst);
            else row.push("-", "-", "-", "-", "-", "-", "-", "-");
        }

        if (includeGstr) {
            if (g) row.push(g.gstin, g.party_name, g.inv_no, g.inv_date, g.taxable_value, g.igst, g.cgst, g.sgst, g.itc_available);
            else row.push("-", "-", "-", "-", "-", "-", "-", "-", "-");
        }

        if (includeDiff) {
            row.push(r.diff_taxable, r.diff_igst, r.diff_cgst, r.diff_sgst);
        }

        const newRow = worksheet.addRow(row);

        // Apply styling
        const argbColor = COLOR_MAP[r.status] || '00FFFFFF';
        for (let colOffset = 1; colOffset <= headers.length; colOffset++) {
            const cell = newRow.getCell(colOffset);
            cell.fill = {
                type: 'pattern',
                pattern: 'solid',
                fgColor: { argb: argbColor }
            };
        }
    });

    autoSizeColumns(worksheet);
};

export const generateReport = async (results, summaryData) => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'GSTR-2B Tool';

    // 1. Summary Sheet
    const wsSummary = workbook.addWorksheet('Summary');
    wsSummary.addRow(["Metric", "Count", "Amount (₹)"]);
    styleHeader(wsSummary, 3);

    wsSummary.addRows([
        ["Fully Matched", summaryData.matched, summaryData.amount_matched_itc],
        ["Probable Match (Fuzzy)", summaryData.fuzzy_match, summaryData.amount_fuzzy_itc],
        ["Value Mismatch", summaryData.value_mismatch, 0], // Abstracted amount
        ["In Books Only (ITC at Risk)", summaryData.books_only, summaryData.amount_at_risk_itc],
        ["In 2B Only (Unclaimed ITC)", summaryData.gstr2b_only, summaryData.amount_unclaimed_itc],
        ["ITC Not Available", summaryData.itc_na, summaryData.amount_itc_na]
    ]);
    autoSizeColumns(wsSummary);

    // 2. All Matched
    const wsMatched = workbook.addWorksheet('All Matched');
    const matchedResults = results.filter(r => ['MATCHED', 'DATE_DIFF'].includes(r.status));
    appendRecordsToWs(wsMatched, matchedResults);

    // 3. Review Required
    const wsReview = workbook.addWorksheet('Review Required');
    const reviewResults = results.filter(r => ['VALUE_MISMATCH', 'FUZZY_MATCH'].includes(r.status));
    appendRecordsToWs(wsReview, reviewResults);

    // 4. Books Only
    const wsBooks = workbook.addWorksheet('Books Only');
    const booksResults = results.filter(r => r.status === 'BOOKS_ONLY');
    appendRecordsToWs(wsBooks, booksResults, false, true, false);

    // 5. 2B Only
    const ws2b = workbook.addWorksheet('2B Only');
    const gstrResults = results.filter(r => r.status === '2B_ONLY');
    appendRecordsToWs(ws2b, gstrResults, true, false, false);

    // Buffer conversion
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
};
