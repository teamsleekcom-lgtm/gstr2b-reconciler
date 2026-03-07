import * as XLSX from 'xlsx';

export const mergeGSTR2BFiles = async (files) => {
    let allDataRows = [];
    let headers = null;
    let headerRowIdx = -1;
    let combinedHeaderMap = [];

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

        let targetSheetName = "B2B";
        const b2bSheet = workbook.SheetNames.find(s => s.trim().toUpperCase() === "B2B");

        if (b2bSheet) {
            targetSheetName = b2bSheet;
        } else if (!workbook.SheetNames.includes(targetSheetName)) {
            targetSheetName = workbook.SheetNames[0]; // fallback
        }

        const worksheet = workbook.Sheets[targetSheetName];

        // We only want the raw structure (array of arrays)
        const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

        if (rawData.length < 2) continue; // Skip empty sheets

        // If this is the first valid file, extract the headers and the top static content
        if (!headers) {
            for (let i = 0; i < Math.min(15, rawData.length); i++) {
                const rowValues = rawData[i].map(c => typeof c === 'string' ? c.replace(/[\s\n\r]/g, '').toLowerCase() : String(c));
                if (rowValues.includes('gstinofsupplier') || rowValues.includes('trade/legalname')) {
                    headerRowIdx = i;
                    break;
                }
            }
            if (headerRowIdx === -1) throw new Error(`Could not find headers in the first file: ${file.name}`);

            // Capture all the government info above the headers (Rows 0 to headerRowIdx+1)
            headers = rawData.slice(0, headerRowIdx + 2);
            combinedHeaderMap = rawData[headerRowIdx]; // Primary header for aligning columns

            // Append the data rows from the first file immediately after its headers
            const dataRows = rawData.slice(headerRowIdx + 2);
            allDataRows = allDataRows.concat(dataRows);

        } else {
            // For subsequent files, we find their respective data rows and match their columns to the primary file's columns
            let thisFileHeaderIdx = -1;
            for (let i = 0; i < Math.min(15, rawData.length); i++) {
                const rowValues = rawData[i].map(c => typeof c === 'string' ? c.replace(/[\s\n\r]/g, '').toLowerCase() : String(c));
                if (rowValues.includes('gstinofsupplier') || rowValues.includes('trade/legalname')) {
                    thisFileHeaderIdx = i;
                    break;
                }
            }

            if (thisFileHeaderIdx !== -1) {
                const thisFileHeaders = rawData[thisFileHeaderIdx];
                const dataRows = rawData.slice(thisFileHeaderIdx + 2);

                // Build a column map from This File Index -> Primary File Index
                const colMap = [];
                for (let c = 0; c < thisFileHeaders.length; c++) {
                    const headerStr = String(thisFileHeaders[c]).replace(/[\s\n\r]/g, '').toLowerCase();
                    // Find it in the primary file's combinedHeaderMap
                    const primaryIdx = combinedHeaderMap.findIndex(h =>
                        String(h).replace(/[\s\n\r]/g, '').toLowerCase() === headerStr
                    );
                    colMap[c] = primaryIdx;
                }

                // Push each row, realigned to match File 1's column structure
                dataRows.forEach(row => {
                    // Skip completely empty arrays
                    if (row.length === 0) return;

                    const alignedRow = new Array(combinedHeaderMap.length).fill("");
                    row.forEach((cellVal, rawIdx) => {
                        const targetIdx = colMap[rawIdx];
                        if (targetIdx !== -1 && targetIdx !== undefined) {
                            alignedRow[targetIdx] = cellVal;
                        }
                    });

                    // Add filename identifier
                    allDataRows.push(alignedRow);
                });
            }
        }
    }

    if (!headers) throw new Error("Could not find any valid B2B sheets in the uploaded files.");

    // Final workbook construction
    const finalData = [...headers, ...allDataRows];

    // Create new sheet and book
    const newWs = XLSX.utils.aoa_to_sheet(finalData);
    const newWb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(newWb, newWs, "Merged_B2B");

    // Generate Buffer
    const wbout = XLSX.write(newWb, { bookType: 'xlsx', type: 'array' });
    return wbout;
};
