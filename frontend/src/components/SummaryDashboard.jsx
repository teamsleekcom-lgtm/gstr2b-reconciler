import React from 'react';
import { Download, RefreshCw, CheckCircle, AlertTriangle, XCircle, AlertCircle } from 'lucide-react';

export default function SummaryDashboard({ summary, onDownload, onReset }) {
    const formatAmount = (amt) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0
        }).format(amt || 0);
    };

    const Card = ({ title, count, amount, colorClass, icon: Icon, description }) => (
        <div className={`rounded-xl p-5 border shadow-sm flex flex-col ${colorClass}`}>
            <div className="flex justify-between items-start mb-2">
                <h3 className="font-semibold text-sm opacity-90 flex items-center">
                    <Icon className="w-4 h-4 mr-2" />
                    {title}
                </h3>
                <span className="text-2xl font-bold">{count || 0}</span>
            </div>
            <div className="mt-auto pt-2 border-t border-black/10 flex justify-between items-end">
                <span className="text-xs opacity-80">{description}</span>
                <span className="font-bold text-lg">{formatAmount(amount)}</span>
            </div>
        </div>
    );

    return (
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-5xl mx-auto border border-gray-100">
            <div className="flex justify-between items-center mb-8 border-b pb-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Reconciliation Results</h2>
                    <p className="text-gray-500 mt-1">
                        Processed {summary.total_books} Book records vs {summary.total_2b} GSTR-2B records
                    </p>
                </div>
                <div className="flex space-x-3">
                    <button
                        onClick={onReset}
                        className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center transition-colors"
                    >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Start Over
                    </button>
                    <button
                        onClick={onDownload}
                        className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20 rounded-lg flex items-center transition-colors"
                    >
                        <Download className="w-4 h-4 mr-2" />
                        Download Excel Report
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <Card
                    title="Fully Matched"
                    count={summary.matched}
                    amount={summary.amount_matched_itc}
                    description="Perfect Match ITC"
                    colorClass="bg-green-50 border-green-200 text-green-900"
                    icon={CheckCircle}
                />
                <Card
                    title="Review Required"
                    count={(summary.value_mismatch || 0) + (summary.fuzzy_match || 0)}
                    amount={summary.amount_fuzzy_itc} // Can show fuzzy ITC value optionally
                    description="Probable or Value Diff"
                    colorClass="bg-yellow-50 border-yellow-200 text-yellow-900"
                    icon={AlertTriangle}
                />
                <Card
                    title="Books Only"
                    count={summary.books_only}
                    amount={summary.amount_at_risk_itc}
                    description="ITC at Risk"
                    colorClass="bg-red-50 border-red-200 text-red-900"
                    icon={XCircle}
                />
                <Card
                    title="2B Only"
                    count={summary.gstr2b_only}
                    amount={summary.amount_unclaimed_itc}
                    description="Unclaimed ITC"
                    colorClass="bg-purple-50 border-purple-200 text-purple-900"
                    icon={AlertCircle}
                />
            </div>

            {summary.itc_na > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg py-3 px-5 flex justify-between items-center text-gray-700 text-sm">
                    <span className="flex items-center"><AlertCircle className="w-4 h-4 mr-2 text-gray-500" /> {summary.itc_na} records mapped as "ITC Not Available"</span>
                    <span className="font-semibold text-gray-500">Excluded from matched metrics</span>
                </div>
            )}
        </div>
    );
}
