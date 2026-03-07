import * as XLSX from 'xlsx';

// Helper to safely extract float
const safeFloat = (val) => {
    if (val === undefined || val === null || val === '') return 0.0;
    const num = parseFloat(val);
    return isNaN(num) ? 0.0 : num;
};

// Helper to safely extract string
const safeStr = (val) => {
    if (val === undefined || val === null) return "";
    return String(val).replace(/\n/g, ' ').trim();
};

// Helper to safely extract and format dates (especially Excel serial dates)
const safeDate = (val) => {
    if (val === undefined || val === null || val === '') return "";
    if (typeof val === 'number') {
        try {
            const dateObj = XLSX.SSF.parse_date_code(val);
            if (dateObj) {
                const d = String(dateObj.d).padStart(2, '0');
                const m = String(dateObj.m).padStart(2, '0');
                const y = dateObj.y;
                return `${d}-${m}-${y}`;
            }
        } catch (e) {
            return String(val).trim();
        }
    }
    return String(val).replace(/\n/g, ' ').trim();
};

export const parseBooksFile = async (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                // read raw file
                const workbook = XLSX.read(data, { type: 'array' });

                let targetSheetName = "GSTR-3B - Voucher Register";
                if (!workbook.SheetNames.includes(targetSheetName)) {
                    // fallback to first sheet if name doesn't match exactly
                    targetSheetName = workbook.SheetNames[0];
                }

                const worksheet = workbook.Sheets[targetSheetName];
                // Convert to array of arrays (raw format to detect header)
                const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

                if (!rawData || rawData.length === 0) {
                    throw new Error("Books file is empty.");
                }

                // 1. Find header row (any cell equals "Party GSTIN/UIN") within first 15 rows
                let headerRowIdx = -1;
                for (let i = 0; i < Math.min(15, rawData.length); i++) {
                    const rowValues = rawData[i].map(c => safeStr(c).replace(/[\s\n\r]/g, '').toLowerCase());
                    if (rowValues.includes("partygstin/uin") || rowValues.includes("partygstin")) {
                        headerRowIdx = i;
                        break;
                    }
                }

                if (headerRowIdx === -1) {
                    throw new Error("Could not find header row containing 'Party GSTIN/UIN' in the first 15 rows of the Books file.");
                }

                // 2. Combine row N and N+1 to form headers
                const colNames1 = rawData[headerRowIdx];
                const colNames2 = rawData[headerRowIdx + 1] || [];

                const headers = [];
                const maxCols = Math.max(colNames1.length, colNames2.length);

                for (let i = 0; i < maxCols; i++) {
                    const c1 = safeStr(colNames1[i]);
                    const c2 = safeStr(colNames2[i]);

                    if (c1 && c2 && c1 !== c2) headers.push(`${c1} ${c2}`);
                    else if (c1) headers.push(c1);
                    else if (c2) headers.push(c2);
                    else headers.push(`Unnamed_${i}`);
                }

                // 3. Read data starting from headerRowIdx + 2
                const dataRows = rawData.slice(headerRowIdx + 2);

                // Map column indices to required fields
                const getColIdx = (possibleNames) => {
                    for (let i = 0; i < headers.length; i++) {
                        const hLower = headers[i].toLowerCase().replace(/[\s\n\r]/g, '');
                        for (const p of possibleNames) {
                            if (hLower.includes(p.toLowerCase().replace(/[\s\n\r]/g, ''))) {
                                return i;
                            }
                        }
                    }
                    return -1;
                };

                const gstinIdx = getColIdx(["Party GSTIN/UIN", "Party GSTIN"]);
                const invNoIdx = getColIdx(["Doc No", "Document Number", "Invoice No"]);
                const invDateIdx = getColIdx(["Date", "Invoice Date"]);
                const taxIdx = getColIdx(["Taxable Amount", "Taxable Value", "Taxable"]);
                const igstIdx = getColIdx(["IGST", "Integrated Tax"]);
                const cgstIdx = getColIdx(["CGST", "Central Tax"]);
                const sgstIdx = getColIdx(["SGST/UTGST", "SGST", "UTGST", "State/UT Tax"]);
                const partyIdx = getColIdx(["Particulars", "Party Name"]);

                const mappedData = [];

                for (const row of dataRows) {
                    // Skip empty rows or "Total" row
                    if (!row || row.length === 0) continue;
                    if (partyIdx !== -1 && safeStr(row[partyIdx]).toLowerCase() === 'total') {
                        continue;
                    }

                    const gstin = gstinIdx !== -1 ? safeStr(row[gstinIdx]) : "";

                    // Must have GSTIN to be considered a valid record for B2B
                    if (gstin && gstin.toLowerCase() !== 'total') {
                        mappedData.push({
                            gstin: gstin,
                            inv_no: invNoIdx !== -1 ? safeStr(row[invNoIdx]) : "",
                            inv_date: invDateIdx !== -1 ? safeDate(row[invDateIdx]) : "",
                            taxable_value: taxIdx !== -1 ? safeFloat(row[taxIdx]) : 0.0,
                            igst: igstIdx !== -1 ? safeFloat(row[igstIdx]) : 0.0,
                            cgst: cgstIdx !== -1 ? safeFloat(row[cgstIdx]) : 0.0,
                            sgst: sgstIdx !== -1 ? safeFloat(row[sgstIdx]) : 0.0,
                            party_name: partyIdx !== -1 ? safeStr(row[partyIdx]) : ""
                        });
                    }
                }

                resolve(mappedData);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = (err) => reject(new Error("Failed to read the file"));
        reader.readAsArrayBuffer(file);
    });
};

export const parseGSTR2BFile = async (file) => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                let targetSheetName = "B2B";
                const b2bSheet = workbook.SheetNames.find(s => s.trim().toUpperCase() === "B2B");

                if (b2bSheet) {
                    targetSheetName = b2bSheet;
                } else if (!workbook.SheetNames.includes(targetSheetName)) {
                    targetSheetName = workbook.SheetNames[0]; // fallback
                }

                const worksheet = workbook.Sheets[targetSheetName];

                // Let's get it as a raw array first
                const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });

                if (rawData.length < 2) {
                    throw new Error("GSTR-2B file does not contain enough rows to find headers.");
                }

                // 1. Find header row
                let headerRowIdx = -1;
                for (let i = 0; i < Math.min(15, rawData.length); i++) {
                    const rowValues = rawData[i].map(c => typeof c === 'string' ? c.replace(/[\s\n\r]/g, '').toLowerCase() : String(c));
                    if (rowValues.includes('gstinofsupplier') || rowValues.includes('trade/legalname')) {
                        headerRowIdx = i;
                        break;
                    }
                }

                if (headerRowIdx === -1) {
                    throw new Error("Could not find GSTR-2B header row containing 'GSTIN of supplier' or 'Trade/Legal name'.");
                }

                // 2. Combine row N and N+1 to form headers
                const colNames1 = rawData[headerRowIdx];
                const colNames2 = rawData[headerRowIdx + 1] || [];
                const headers = [];
                const maxCols = Math.max(colNames1.length, colNames2.length);

                for (let i = 0; i < maxCols; i++) {
                    const c1 = safeStr(colNames1[i]);
                    const c2 = safeStr(colNames2[i]);

                    if (c1 && c2 && c1 !== c2) headers.push(`${c1} ${c2}`);
                    else if (c1) headers.push(c1);
                    else if (c2) headers.push(c2);
                    else headers.push(`Unnamed_${i}`);
                }

                const dataRows = rawData.slice(headerRowIdx + 2);

                const getColIdx = (possibleNames) => {
                    for (let i = 0; i < headers.length; i++) {
                        const hLower = headers[i].toLowerCase().replace(/[\s\n\r]/g, '');
                        for (const p of possibleNames) {
                            if (hLower.includes(p.toLowerCase().replace(/[\s\n\r]/g, ''))) {
                                return i;
                            }
                        }
                    }
                    return -1;
                };

                const indices = {
                    gstin: getColIdx(["GSTIN of supplier"]),
                    party_name: getColIdx(["Trade/Legal name"]),
                    inv_no: getColIdx(["Invoice number"]),
                    inv_date: getColIdx(["Invoice Date"]),
                    taxable_value: getColIdx(["Taxable Value"]),
                    igst: getColIdx(["Integrated Tax"]),
                    cgst: getColIdx(["Central Tax"]),
                    sgst: getColIdx(["State/UT Tax"]),
                    cess: getColIdx(["Cess"]),
                    itc_available: getColIdx(["ITC Availability"]),
                    filing_date: getColIdx(["GSTR-1/IFF Filing Date", "GSTR-1 Filing Date"])
                };

                const mappedData = [];

                for (const row of dataRows) {
                    if (!row || row.length === 0) continue;

                    const gstin = indices.gstin !== -1 ? safeStr(row[indices.gstin]) : "";

                    // Skip totals and empty GSTINs
                    if (gstin && gstin.toLowerCase() !== 'total') {
                        mappedData.push({
                            gstin: gstin,
                            party_name: indices.party_name !== -1 ? safeStr(row[indices.party_name]) : "",
                            inv_no: indices.inv_no !== -1 ? safeStr(row[indices.inv_no]) : "",
                            inv_date: indices.inv_date !== -1 ? safeDate(row[indices.inv_date]) : "",
                            taxable_value: indices.taxable_value !== -1 ? safeFloat(row[indices.taxable_value]) : 0.0,
                            igst: indices.igst !== -1 ? safeFloat(row[indices.igst]) : 0.0,
                            cgst: indices.cgst !== -1 ? safeFloat(row[indices.cgst]) : 0.0,
                            sgst: indices.sgst !== -1 ? safeFloat(row[indices.sgst]) : 0.0,
                            cess: indices.cess !== -1 ? safeFloat(row[indices.cess]) : 0.0,
                            itc_available: indices.itc_available !== -1 ? safeStr(row[indices.itc_available]) : "",
                            filing_date: indices.filing_date !== -1 ? safeDate(row[indices.filing_date]) : "",
                        });
                    }
                }

                resolve(mappedData);

            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = (err) => reject(new Error("Failed to read the file"));
        reader.readAsArrayBuffer(file);
    });
};
