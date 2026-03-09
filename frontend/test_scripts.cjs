const XLSX = require('xlsx');
const fs = require('fs');

const files = fs.readdirSync('C:/GoogleAG-2BReco/test_files')
    .filter(f => f.endsWith('.xlsx') || f.endsWith('.xls'))
    .map(f => 'C:/GoogleAG-2BReco/test_files/' + f);

const TARGET_SHEETS = [
    "B2B", "B2BA", "B2B-CDNR", "B2B-CDNRA",
    "ECO", "ECOA", "ISD", "ISDA",
    "IMPG", "IMPGA", "IMPGSEZ", "IMPGSEZA",
    "B2B (ITC Reversal)", "B2BA (ITC Reversal)",
    "B2B-DNR", "B2B-DNRA",
    "B2B(Rejected)", "B2BA(Rejected)",
    "B2B-CDNR(Rejected)", "B2B-CDNRA(Rejected)",
    "ECO(Rejected)", "ECOA(Rejected)",
    "ISD(Rejected)", "ISDA(Rejected)"
];
const normalizeSheetName = (name) => name.trim().toUpperCase().replace(/\s+/g, '');

const safeStr = (val) => {
    if (val === undefined || val === null) return "";
    return String(val).replace(/\n/g, ' ').trim();
};

for (const file of files) {
    console.log(`\n=== FILE: ${file} ===`);
    const workbook = XLSX.readFile(file);
    for (const sheetName of workbook.SheetNames) {
        const normName = normalizeSheetName(sheetName);
        if (!TARGET_SHEETS.some(ts => normalizeSheetName(ts) === normName)) continue;

        const worksheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
        if (rawData.length < 2) continue;

        let taxRow = -1;
        for (let i = Math.min(20, rawData.length) - 1; i >= 0; i--) {
            const rowStr = rawData[i].map(c => typeof c === 'string' ? c.replace(/[\s\n\r₹()]/g, '').toLowerCase() : String(c));
            if (
                rowStr.includes('integratedtax') ||
                rowStr.includes('centraltax') ||
                rowStr.includes('state/uttax') ||
                rowStr.includes('cess') ||
                rowStr.includes('gstinofsupplier') ||
                rowStr.includes('portcode')
            ) {
                taxRow = i;
                break;
            }
        }

        if (taxRow === -1) {
            console.log(`[${sheetName}] No headers found`);
            continue;
        }

        let maxCols = 0;
        for (let i = Math.max(0, taxRow - 3); i <= taxRow; i++) {
            if (rawData[i] && rawData[i].length > maxCols) {
                maxCols = rawData[i].length;
            }
        }

        const thisFileHeaderMap = [];
        for (let c = 0; c < maxCols; c++) {
            let colName = `unnamed_${c}`;
            for (let r = taxRow; r >= Math.max(0, taxRow - 3); r--) {
                const cellValText = rawData[r] && rawData[r][c] !== undefined ? safeStr(rawData[r][c]) : "";
                const canonicalText = cellValText.replace(/[\s\n\r₹()]/g, '').toLowerCase();
                if (canonicalText) {
                    colName = canonicalText;
                    break;
                }
            }
            thisFileHeaderMap.push(colName);
        }
        console.log(`[${sheetName}] MaxCols: ${maxCols} TaxRow: ${taxRow} | ${thisFileHeaderMap.join(', ')}`);
    }
}
