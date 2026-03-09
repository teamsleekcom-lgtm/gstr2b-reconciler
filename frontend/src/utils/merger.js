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

export const mergeGSTR2BFiles = async (files) => {
    const mergedSheetsData = {}; // Map of normalizedSheetName -> { originalName, headers, combinedHeaderMap, allDataRows }

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

            // Find header row bounds robustly
            let headerRowTop = -1;
            let headerRowBottom = -1;

            for (let i = 0; i < Math.min(20, rawData.length); i++) {
                const rowStr = rawData[i].map(c => typeof c === 'string' ? c.replace(/[\s\n\r₹()]/g, '').toLowerCase() : String(c));
                
                // Check if this row contains 'integratedtax'
                if (rowStr.includes('integratedtax') || rowStr.includes('centraltax') || rowStr.includes('cess') || rowStr.includes('state/uttax')) {
                    // We found the tax row! Is GSTIN/Name in this row too?
                    if (rowStr.includes('gstinofsupplier') || rowStr.includes('trade/legalname') || rowStr.includes('recorddetails')) {
                        headerRowTop = i;
                        headerRowBottom = i; // single row header or top row
                    } else if (i > 0) {
                        const prevRowStr = rawData[i-1].map(c => typeof c === 'string' ? c.replace(/[\s\n\r₹()]/g, '').toLowerCase() : String(c));
                        if (prevRowStr.includes('gstinofsupplier') || prevRowStr.includes('trade/legalname') || prevRowStr.includes('recorddetails')) {
                            headerRowTop = i - 1;
                            headerRowBottom = i;
                        } else {
                            // Default fallback
                            headerRowTop = i;
                            headerRowBottom = i;
                        }
                    } else {
                        headerRowTop = i;
                        headerRowBottom = i;
                    }
                    break;
                } else if (rowStr.includes('gstinofsupplier') || rowStr.includes('trade/legalname') || rowStr.includes('recorddetails')) {
                    // Found top header but not tax yet, tax might be in next row
                    headerRowTop = i;
                    headerRowBottom = i + 1; // tentatively try combining with next
                    break;
                }
            }

            if (headerRowTop === -1) {
                console.warn(`Could not find headers in sheet ${sheetName} of file ${file.name}. Skipping sheet.`);
                continue;
            }

            // Construct this sheet's composite header map
            const colNames1 = rawData[headerRowTop] || [];
            const colNames2 = headerRowBottom > headerRowTop ? (rawData[headerRowBottom] || []) : [];
            const maxCols = Math.max(colNames1.length, colNames2.length);
            const thisFileHeaderMap = [];

            for (let c = 0; c < maxCols; c++) {
                const c1 = safeStr(colNames1[c]);
                const c2 = safeStr(colNames2[c]);
                if (c1 && c2 && c1 !== c2) thisFileHeaderMap.push(`${c1} ${c2}`);
                else if (c1) thisFileHeaderMap.push(c1);
                else if (c2) thisFileHeaderMap.push(c2);
                else thisFileHeaderMap.push(`Unnamed_${c}`);
            }

            // Initialize sheet memory if this is the first file exposing this sheet
            if (!mergedSheetsData[normName]) {
                mergedSheetsData[normName] = {
                    originalName: sheetName,
                    headers: rawData.slice(0, headerRowBottom + 1), // Top static gov text + Header rows
                    combinedHeaderMap: thisFileHeaderMap,
                    allDataRows: []
                };
            }

            const targetData = mergedSheetsData[normName];
            
            // Build a column map from This File Index -> Primary File Index
            const colMap = [];
            for (let c = 0; c < thisFileHeaderMap.length; c++) {
                const headerStr = thisFileHeaderMap[c].replace(/[\s\n\r₹()]/g, '').toLowerCase();
                const primaryIdx = targetData.combinedHeaderMap.findIndex(h => 
                    h.replace(/[\s\n\r₹()]/g, '').toLowerCase() === headerStr
                );
                colMap[c] = primaryIdx;
            }

            // Push each row, realigned to match the primary combinedHeaderMap
            const dataRows = rawData.slice(headerRowBottom + 1);
            dataRows.forEach(row => {
                // Skip completely empty arrays (blank lines)
                if (!row || row.length === 0 || row.every(c => !safeStr(c))) return;
                
                const alignedRow = new Array(targetData.combinedHeaderMap.length).fill("");
                row.forEach((cellVal, rawIdx) => {
                    const targetIdx = colMap[rawIdx];
                    if (targetIdx !== -1 && targetIdx !== undefined) {
                        // Keep cellVal natively (e.g. number for dates) or safeStr
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
            const finalData = [...sheetData.headers, ...sheetData.allDataRows];
            const newWs = XLSX.utils.aoa_to_sheet(finalData);
            XLSX.utils.book_append_sheet(newWb, newWs, sheetData.originalName);
        }
    }
    
    // Generate Buffer
    const wbout = XLSX.write(newWb, { bookType: 'xlsx', type: 'array' });
    return wbout;
};
