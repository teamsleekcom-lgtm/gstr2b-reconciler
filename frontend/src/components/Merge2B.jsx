import React, { useState } from 'react';
import { FilePlus, CheckCircle2, X } from 'lucide-react';
import { mergeGSTR2BFiles } from '../utils/merger';

export default function Merge2B() {
    const [files, setFiles] = useState([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const handleDrop = (e) => {
        e.preventDefault();
        if (e.dataTransfer.files) {
            const newFiles = Array.from(e.dataTransfer.files).filter(f =>
                f.name.endsWith('.xls') || f.name.endsWith('.xlsx')
            );
            setFiles(prev => [...prev, ...newFiles]);
        }
    };

    const handleFileSelect = (e) => {
        if (e.target.files) {
            const newFiles = Array.from(e.target.files).filter(f =>
                f.name.endsWith('.xls') || f.name.endsWith('.xlsx')
            );
            setFiles(prev => [...prev, ...newFiles]);
        }
    };

    const removeFile = (index) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    };

    const handleMerge = async () => {
        if (files.length < 2) {
            setErrorMsg("Please upload at least 2 files to merge.");
            return;
        }

        setIsProcessing(true);
        setErrorMsg('');

        try {
            const buffer = await mergeGSTR2BFiles(files);

            // Trigger download
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Merged_GSTR2B_${files.length}_Months.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            // Success cleanup
            setFiles([]);
        } catch (err) {
            console.error(err);
            setErrorMsg(err.message || "Failed to merge files.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-4xl mx-auto border border-gray-100 animate-in fade-in slide-in-from-bottom-4">
            <div className="text-center mb-8">
                <h2 className="text-2xl font-bold text-gray-800 tracking-tight">Merge GSTR-2B Months</h2>
                <p className="text-gray-500 mt-2">Combine multiple GSTR-2B Excel files from different months into one master file.</p>
            </div>

            {errorMsg && (
                <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-lg text-sm text-center border border-red-100">
                    {errorMsg}
                </div>
            )}

            <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                className="border-2 border-dashed border-blue-300 bg-blue-50 hover:bg-blue-100 rounded-xl p-10 flex flex-col items-center justify-center transition-colors cursor-pointer mb-8 min-h-[200px]"
                onClick={() => document.getElementById('merge-upload').click()}
            >
                <input
                    type="file"
                    id="merge-upload"
                    multiple
                    accept=".xls,.xlsx"
                    className="hidden"
                    onChange={handleFileSelect}
                />
                <FilePlus className="w-12 h-12 text-blue-500 mb-4" />
                <p className="font-semibold text-gray-700">Add GSTR-2B Files</p>
                <p className="text-sm text-gray-500 mt-1">Drag and drop multiple files, or click to browse</p>
            </div>

            {files.length > 0 && (
                <div className="mb-8">
                    <h3 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wider">Queue to Merge ({files.length})</h3>
                    <div className="space-y-2">
                        {files.map((f, i) => (
                            <div key={i} className="flex items-center justify-between p-3 bg-gray-50 border border-gray-100 rounded-lg">
                                <div className="flex items-center">
                                    <CheckCircle2 className="w-5 h-5 text-green-500 mr-3" />
                                    <span className="text-sm font-medium text-gray-700">{f.name}</span>
                                </div>
                                <button onClick={() => removeFile(i)} className="text-gray-400 hover:text-red-500 transition-colors p-1">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="flex justify-center">
                <button
                    onClick={handleMerge}
                    disabled={files.length < 2 || isProcessing}
                    className={`px-8 py-3 rounded-xl font-bold text-lg flex items-center transition-all ${files.length >= 2 && !isProcessing
                            ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-lg hover:shadow-purple-500/30'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                >
                    {isProcessing ? (
                        <>
                            <div className="w-5 h-5 border-2 border-white rounded-full border-t-transparent animate-spin mr-3"></div>
                            Merging Buffers...
                        </>
                    ) : (
                        'Merge & Download'
                    )}
                </button>
            </div>
            <p className="mt-6 text-center text-xs text-gray-400 flex justify-center items-center font-medium">
                <span className="mr-1">🔒</span> Files are concatenated locally and never leave this device.
            </p>
        </div>
    );
}
