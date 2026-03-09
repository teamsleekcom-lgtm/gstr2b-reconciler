import * as XLSX from 'xlsx';

const safeStr = (val) => {
    if (val === undefined || val === null) return "";
    return String(val).replace(/\n/g, ' ').trim();
};

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

const normalizeColText = (text) => {
    let t = String(text).replace(/[\s\n\r₹()]/g, '').toLowerCase();

    // Heuristic normalization for inconsistent government text changes
    if (t.endsWith('period')) return 'period';
    if (t.endsWith('filingdate')) return 'filingdate';
    if (t.includes('whetheritctobereduced')) return 'itcreduced';
    if (t === 'rmarks') return 'remarks'; // GST portal typo in DEC-2025
    if (t === 'rate%') return 'applicable%oftaxrate';

    return t;
};

export const mergeGSTR2BFiles = async (files) => {
    const mergedSheetsData = {}; // Map of normalizedSheetName -> { originalName, headerRows, masterTaxRow, colKeys, allDataRows }

    // Process files sequentially
    for (let fIdx = 0; fIdx < files.length; fIdx++) {
        const file = files[fIdx];
        const data = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(new Uint8Array(e.target.result));
            reader.onerror = (err) => reject(new Error(`Failed to read file: ${file.name}`));
            reader.readAsArrayBuffer(file);
        });

        const workbook = XLSX.read(data, { type: 'array' });

        for (const sheetName of workbook.SheetNames) {
            const normName = normalizeSheetName(sheetName);
            // Check if this sheet is one of the target sheets
            const isTarget = TARGET_SHEETS.some(ts => normalizeSheetName(ts) === normName);
            if (!isTarget) continue;

            const worksheet = workbook.Sheets[sheetName];
            const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

            if (rawData.length < 2) continue; // Skip empty sheets

            // 1. Locate the bottom row of the table headers scanning upwards
            let taxRow = -1;
            for (let i = Math.min(20, rawData.length) - 1; i >= 0; i--) {
                const rowStr = rawData[i].map(c => typeof c === 'string' ? c.replace(/[\s\n\r₹()]/g, '').toLowerCase() : String(c));
                if (
                    rowStr.includes('integratedtax') ||
                    rowStr.includes('centraltax') ||
                    rowStr.includes('state/uttax') ||
                    rowStr.includes('cess') ||
                    rowStr.includes('gstinofsupplier') ||
                    rowStr.includes('portcode') ||
                    rowStr.includes('documentnumber')
                ) {
                    taxRow = i;
                    break;
                }
            }

            if (taxRow === -1) {
                console.warn(`Could not find table headers in sheet ${sheetName} of file ${file.name}. Skipping sheet.`);
                continue;
            }

            // Detect actual number of columns for this sheet in this file
            let maxCols = 0;
            for (let i = Math.max(0, taxRow - 3); i <= taxRow; i++) {
                if (rawData[i] && rawData[i].length > maxCols) {
                    maxCols = rawData[i].length;
                }
            }

            // Initialize sheet memory if this is the first file exposing this sheet
            if (!mergedSheetsData[normName]) {
                const initialHeaders = rawData.slice(0, taxRow + 1).map(r => [...r]);
                mergedSheetsData[normName] = {
                    originalName: sheetName,
                    masterTaxRow: taxRow,
                    headerRows: initialHeaders,
                    colKeys: [],
                    allDataRows: []
                };
            }

            const targetData = mergedSheetsData[normName];
            const colMap = []; // Maps CurrentFile Index -> Master Index

            // Build dictionary matching mapped index logic
            for (let c = 0; c < maxCols; c++) {
                let rawHeaderStr = ""; // original text visually shown
                let normKey = `unnamed_${c}`;

                // Scan upwards to find the true textual header for this column visually
                for (let r = taxRow; r >= Math.max(0, taxRow - 3); r--) {
                    const cellVal = rawData[r] && rawData[r][c] !== undefined ? rawData[r][c] : "";
                    const cellValText = safeStr(cellVal);
                    if (cellValText) {
                        rawHeaderStr = cellValText;
                        normKey = normalizeColText(cellValText);
                        break;
                    }
                }

                let primaryIdx = targetData.colKeys.indexOf(normKey);

                if (primaryIdx === -1) {
                    // This is a BRAND NEW column introduced in this month's file!
                    // We expand the master map horizontally to accommodate it securely.
                    primaryIdx = targetData.colKeys.length;
                    targetData.colKeys.push(normKey);

                    // Insert the visual text into the Master Headers at the Tax Row
                    if (targetData.headerRows[targetData.masterTaxRow]) {
                        targetData.headerRows[targetData.masterTaxRow][primaryIdx] = rawHeaderStr;
                    }
                    // Pad preceding header rows visually with blanks
                    for (let hr = 0; hr < targetData.masterTaxRow; hr++) {
                        if (targetData.headerRows[hr]) targetData.headerRows[hr][primaryIdx] = "";
                    }
                }

                colMap[c] = primaryIdx;
            }

            // Push each data row, realigned perfectly to match the master format dynamically
            const dataRows = rawData.slice(taxRow + 1);
            dataRows.forEach(row => {
                // Skip completely empty arrays (blank lines)
                if (!row || row.length === 0 || row.every(c => !safeStr(c))) return;

                const alignedRow = new Array(targetData.colKeys.length).fill("");
                row.forEach((cellVal, rawIdx) => {
                    const targetIdx = colMap[rawIdx];
                    if (targetIdx !== -1 && targetIdx !== undefined) {
                        alignedRow[targetIdx] = cellVal;
                    }
                });

                targetData.allDataRows.push(alignedRow);
            });
        }
    }

    if (Object.keys(mergedSheetsData).length === 0) {
        throw new Error("Could not find any valid GSTR-2B datasets matching the required sheets.");
    }

    // Final workbook construction
    const newWb = XLSX.utils.book_new();

    // Iterate through TARGET_SHEETS to preserve a standard ordered workbook
    for (const ts of TARGET_SHEETS) {
        const normName = normalizeSheetName(ts);
        const sheetData = mergedSheetsData[normName];
        if (sheetData) {
            const finalData = [...sheetData.headerRows, ...sheetData.allDataRows];
            const newWs = XLSX.utils.aoa_to_sheet(finalData);
            XLSX.utils.book_append_sheet(newWb, newWs, sheetData.originalName);
        }
    }

    // Generate Buffer
    const wbout = XLSX.write(newWb, { bookType: 'xlsx', type: 'array' });
    return wbout;
};
