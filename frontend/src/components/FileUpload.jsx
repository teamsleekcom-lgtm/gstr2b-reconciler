import React, { useState } from 'react';
import { FileUp, FileSpreadsheet, CheckCircle2, RotateCcw } from 'lucide-react';

export default function FileUpload({ onStartReconciliation }) {
    const [booksFile, setBooksFile] = useState(null);
    const [gstrFile, setGstrFile] = useState(null);
    const [booksSoftware, setBooksSoftware] = useState('tally');

    const handleBooksDrop = (e) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setBooksFile(e.dataTransfer.files[0]);
        }
    };

    const handleGstrDrop = (e) => {
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            setGstrFile(e.dataTransfer.files[0]);
        }
    };

    const handleSubmit = () => {
        if (booksFile && gstrFile) {
            onStartReconciliation(booksFile, gstrFile, booksSoftware);
        }
    };

    const preventDefault = (e) => e.preventDefault();

    const renderDropZone = (file, setFile, onDrop, label, accept) => (
        <div
            onDrop={onDrop}
            onDragOver={preventDefault}
            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center transition-colors cursor-pointer min-h-[200px]
        ${file ? 'border-green-500 bg-green-50' : 'border-blue-300 hover:border-blue-500 bg-white hover:bg-blue-50'}`}
            onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = accept;
                input.onchange = (e) => {
                    if (e.target.files && e.target.files[0]) setFile(e.target.files[0]);
                };
                input.click();
            }}
        >
            {file ? (
                <>
                    <CheckCircle2 className="w-12 h-12 text-green-500 mb-3" />
                    <p className="font-semibold text-gray-800 text-center">{file.name}</p>
                    <p className="text-sm text-green-600 mt-1">Ready to process</p>
                    <button
                        onClick={(e) => { e.stopPropagation(); setFile(null); }}
                        className="mt-4 text-xs flex items-center text-gray-500 hover:text-red-500"
                    >
                        <RotateCcw className="w-3 h-3 mr-1" /> Remove
                    </button>
                </>
            ) : (
                <>
                    <FileSpreadsheet className="w-12 h-12 text-blue-400 mb-3" />
                    <p className="font-semibold text-gray-700">{label}</p>
                    <p className="text-sm text-gray-500 mt-1">Drag & drop or click to browse</p>
                    <p className="text-xs text-gray-400 mt-2 font-mono">{accept}</p>
                </>
            )}
        </div>
    );

    return (
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-4xl mx-auto border border-gray-100">
            <div className="text-center mb-10">
                <h2 className="text-2xl font-bold text-gray-800 tracking-tight">Select Files for Reconciliation</h2>
                <p className="text-gray-500 mt-2">Upload your Books of Accounts and GSTR-2B file to begin matching.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                <div>
                    <div className="mb-3">
                        <label className="block text-sm font-semibold text-gray-600 mb-1">Books Software</label>
                        <select
                            value={booksSoftware}
                            onChange={(e) => setBooksSoftware(e.target.value)}
                            className="w-full px-4 py-2 rounded-lg border border-gray-300 bg-white text-gray-700 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition-all"
                        >
                            <option value="tally">Tally</option>
                            <option value="easy">Easy</option>
                        </select>
                    </div>
                    {renderDropZone(booksFile, setBooksFile, handleBooksDrop, "Books File (.xls / .xlsx)", ".xls,.xlsx")}
                </div>
                {renderDropZone(gstrFile, setGstrFile, handleGstrDrop, "GSTR-2B File (.xls / .xlsx)", ".xls,.xlsx")}
            </div>

            <div className="flex flex-col items-center">
                <button
                    onClick={handleSubmit}
                    disabled={!booksFile || !gstrFile}
                    className={`px-8 py-3 rounded-xl font-bold text-lg flex items-center transition-all ${booksFile && gstrFile
                        ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-blue-500/30'
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                >
                    <FileUp className="w-5 h-5 mr-2" />
                    Run Reconciliation
                </button>
                <p className="mt-4 text-xs text-gray-400 flex items-center font-medium">
                    <span className="mr-1">🔒</span> Your files are processed locally and never leave this device.
                </p>
            </div>
        </div>
    );
}
