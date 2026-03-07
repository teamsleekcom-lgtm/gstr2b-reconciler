import * as fuzzball from 'fuzzball';

const TOLERANCE = 1.0;
const FUZZY_THRESHOLD = 85;

export const normalizeInvNo = (s) => {
    if (!s) return "";
    return String(s).toUpperCase().replace(/[\s/\-_]/g, '').trim();
};

const amountsClose = (b, g) => {
    if (Math.abs((b.taxable_value || 0) - (g.taxable_value || 0)) > TOLERANCE) return false;
    if (Math.abs((b.igst || 0) - (g.igst || 0)) > TOLERANCE) return false;
    if (Math.abs((b.cgst || 0) - (g.cgst || 0)) > TOLERANCE) return false;
    if (Math.abs((b.sgst || 0) - (g.sgst || 0)) > TOLERANCE) return false;
    return true;
};

const validateAmounts = (b, g) => {
    if (String(g.itc_available).toUpperCase() === "NO") {
        return "ITC_NA";
    }
    if (!amountsClose(b, g)) {
        return "VALUE_MISMATCH";
    }
    if (b.inv_date !== g.inv_date) {
        return "DATE_DIFF";
    }
    return "MATCHED";
};

const round2Str = (num) => {
    return Math.round((num + Number.EPSILON) * 100) / 100;
};

const buildResult = (b, g, status) => {
    const books_record = b ? { ...b, cess: 0.0 } : null;
    const gstr2b_record = g ? { ...g, cess: g.cess || 0.0, itc_available: g.itc_available || '', filing_date: g.filing_date || '' } : null;

    const diff_taxable = round2Str((b?.taxable_value || 0) - (g?.taxable_value || 0));
    const diff_igst = round2Str((b?.igst || 0) - (g?.igst || 0));
    const diff_cgst = round2Str((b?.cgst || 0) - (g?.cgst || 0));
    const diff_sgst = round2Str((b?.sgst || 0) - (g?.sgst || 0));

    return {
        status,
        books_record,
        gstr2b_record,
        diff_taxable: (b && g) ? diff_taxable : 0.0,
        diff_igst: (b && g) ? diff_igst : 0.0,
        diff_cgst: (b && g) ? diff_cgst : 0.0,
        diff_sgst: (b && g) ? diff_sgst : 0.0,
        diff_cess: 0.0
    };
};

export const matchRecords = (booksData, gstrData) => {
    const results = [];
    const gstrIndexed = new Map();
    const gstrList = [];

    for (const g of gstrData) {
        const key = `${String(g.gstin).trim().toUpperCase()}|${normalizeInvNo(g.inv_no)}`;
        gstrIndexed.set(key, g);
        gstrList.push({ key, record: g, gstin: String(g.gstin).trim().toUpperCase() });
    }

    const matchedGstrKeys = new Set();

    for (const b of booksData) {
        const bGstin = String(b.gstin).trim().toUpperCase();
        const bNormInvNo = normalizeInvNo(b.inv_no);
        const bKey = `${bGstin}|${bNormInvNo}`;

        // Step 1: Strict match
        if (gstrIndexed.has(bKey)) {
            const g = gstrIndexed.get(bKey);
            matchedGstrKeys.add(bKey);
            const status = validateAmounts(b, g);
            results.push(buildResult(b, g, status));
            continue;
        }

        // Step 2: Fuzzy match
        let bestRatio = 0;
        let bestMatch = null;
        let bestKey = null;

        const sameGstinEntries = gstrList.filter(item => item.gstin === bGstin);

        for (const entry of sameGstinEntries) {
            const gNormInvNo = entry.key.split('|')[1];
            const ratio = fuzzball.token_sort_ratio(bNormInvNo, gNormInvNo);

            if (ratio > bestRatio) {
                bestRatio = ratio;
                bestMatch = entry.record;
                bestKey = entry.key;
            }
        }

        if (bestRatio >= FUZZY_THRESHOLD && !matchedGstrKeys.has(bestKey)) {
            matchedGstrKeys.add(bestKey);
            let status;
            if (String(bestMatch.itc_available || '').toUpperCase() === "NO") {
                status = 'ITC_NA';
            } else {
                status = 'FUZZY_MATCH';
                if (!amountsClose(b, bestMatch)) {
                    status = 'VALUE_MISMATCH';
                }
            }
            results.push(buildResult(b, bestMatch, status));
            continue;
        }

        // Step 3: Books only
        results.push(buildResult(b, null, 'BOOKS_ONLY'));
    }

    // Step 4: 2B only
    for (const [key, g] of gstrIndexed.entries()) {
        if (!matchedGstrKeys.has(key)) {
            results.push(buildResult(null, g, '2B_ONLY'));
        }
    }

    return results;
};
