import React, { useState } from 'react';
import FileUpload from './components/FileUpload';
import SummaryDashboard from './components/SummaryDashboard';

// Import our new JS-based utilities
import { parseBooksFile, parseGSTR2BFile } from './utils/parser';
import { matchRecords } from './utils/matcher';
import { generateReport } from './utils/reporter';
import Merge2B from './components/Merge2B';

function App() {
    const [currentView, setCurrentView] = useState('RECONCILE'); // RECONCILE, MERGE
    const [appState, setAppState] = useState('UPLOAD'); // UPLOAD, PROCESSING, RESULTS, ERROR
    const [summaryData, setSummaryData] = useState(null);
    const [reportBuffer, setReportBuffer] = useState(null);
    const [errorMsg, setErrorMsg] = useState('');

    const handleStartReconciliation = async (booksFile, gstrFile) => {
        setAppState('PROCESSING');
        setErrorMsg('');

        try {
            // 1. Parsing
            const booksData = await parseBooksFile(booksFile);
            const gstrData = await parseGSTR2BFile(gstrFile);

            // 2. Matching
            const results = matchRecords(booksData, gstrData);

            // 3. Compute Summary
            const counts = { MATCHED: 0, DATE_DIFF: 0, VALUE_MISMATCH: 0, FUZZY_MATCH: 0, BOOKS_ONLY: 0, '2B_ONLY': 0, ITC_NA: 0 };
            const amounts = { MATCHED: 0, DATE_DIFF: 0, VALUE_MISMATCH: 0, FUZZY_MATCH: 0, BOOKS_ONLY: 0, '2B_ONLY': 0, ITC_NA: 0 };

            for (const r of results) {
                counts[r.status] = (counts[r.status] || 0) + 1;
                const b = r.books_record;
                const g = r.gstr2b_record;

                if (['MATCHED', 'DATE_DIFF', 'VALUE_MISMATCH', 'FUZZY_MATCH', 'BOOKS_ONLY'].includes(r.status)) {
                    if (b) amounts[r.status] += (b.taxable_value || 0) + (b.igst || 0) + (b.cgst || 0) + (b.sgst || 0);
                } else if (['2B_ONLY', 'ITC_NA'].includes(r.status)) {
                    if (g) amounts[r.status] += (g.taxable_value || 0) + (g.igst || 0) + (g.cgst || 0) + (g.sgst || 0);
                }
            }

            const summary = {
                total_books: booksData.length,
                total_2b: gstrData.length,
                matched: counts['MATCHED'] + counts['DATE_DIFF'],
                value_mismatch: counts['VALUE_MISMATCH'],
                fuzzy_match: counts['FUZZY_MATCH'],
                books_only: counts['BOOKS_ONLY'],
                gstr2b_only: counts['2B_ONLY'],
                itc_na: counts['ITC_NA'],
                amount_matched_itc: amounts['MATCHED'] + amounts['DATE_DIFF'],
                amount_fuzzy_itc: amounts['FUZZY_MATCH'],
                amount_at_risk_itc: amounts['BOOKS_ONLY'],
                amount_unclaimed_itc: amounts['2B_ONLY'],
                amount_itc_na: amounts['ITC_NA']
            };

            // 4. Generate Output Buffer
            const buffer = await generateReport(results, summary);

            setSummaryData(summary);
            setReportBuffer(buffer);
            setAppState('RESULTS');

        } catch (err) {
            console.error(err);
            setErrorMsg(err.message || 'An unexpected error occurred during processing.');
            setAppState('ERROR');
        }
    };

    const handleDownload = () => {
        if (!reportBuffer) return;
        const blob = new Blob([reportBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Reconciliation_Report.xlsx';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleReset = () => {
        setAppState('UPLOAD');
        setSummaryData(null);
        setReportBuffer(null);
        setErrorMsg('');
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
            <header className="bg-white border-b border-gray-200 mb-8 sticky top-0 z-10 shadow-sm">
                <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center">
                        <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center mr-4 shadow-inner">
                            <span className="text-white font-bold text-xl">2B</span>
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-gray-900 tracking-tight">GSTR-2B Reconciliation Tool</h1>
                            <p className="text-xs text-blue-600 font-semibold tracking-wide uppercase mt-0.5">Local • Private • Instant</p>
                        </div>
                    </div>
                    <div className="flex space-x-2 bg-gray-100 p-1 rounded-xl">
                        <button
                            onClick={() => setCurrentView('RECONCILE')}
                            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${currentView === 'RECONCILE' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Reconcile
                        </button>
                        <button
                            onClick={() => setCurrentView('MERGE')}
                            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${currentView === 'MERGE' ? 'bg-white text-purple-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Merge 2B
                        </button>
                    </div>
                </div>
            </header>

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 px-6 pb-12">
                {currentView === 'MERGE' ? (
                    <Merge2B />
                ) : (
                    <>
                        {appState === 'UPLOAD' && (
                            <FileUpload onStartReconciliation={handleStartReconciliation} />
                        )}

                        {appState === 'PROCESSING' && (
                            <div className="bg-white rounded-2xl shadow-xl p-16 max-w-2xl mx-auto border border-gray-100 flex flex-col items-center justify-center">
                                <div className="relative w-24 h-24 mb-8">
                                    <div className="absolute inset-0 border-4 border-blue-100 rounded-full"></div>
                                    <div className="absolute inset-0 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
                                </div>
                                <h2 className="text-2xl font-bold text-gray-800 animate-pulse">Running Matching Engine...</h2>
                                <p className="text-gray-500 mt-2 text-center text-sm">
                                    Cross-referencing invoices securely inside your browser.<br />This usually takes just a few seconds on your device.
                                </p>
                            </div>
                        )}

                        {appState === 'RESULTS' && summaryData && (
                            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out">
                                <SummaryDashboard
                                    summary={summaryData}
                                    onDownload={handleDownload}
                                    onReset={handleReset}
                                />
                            </div>
                        )}

                        {appState === 'ERROR' && (
                            <div className="bg-white rounded-2xl shadow-xl p-8 max-w-2xl mx-auto border border-red-100 text-center animate-in zoom-in-95">
                                <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <h2 className="text-xl font-bold text-gray-800 mb-2">Processing Failed</h2>
                                <p className="text-red-600 mb-6 bg-red-50 p-4 rounded-lg text-sm fontFamily-mono">{errorMsg}</p>
                                <button
                                    onClick={handleReset}
                                    className="px-6 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 font-medium transition-colors"
                                >
                                    Go Back and Try Again
                                </button>
                            </div>
                        )}
                    </>
                )}
            </main>

            <footer className="py-6 text-center text-gray-400 text-sm border-t border-gray-200 mt-auto bg-white">
                <p>Secure Browser Execution • Data Never Leaves This Tab</p>
            </footer>
        </div>
    );
}

export default App;
