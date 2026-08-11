import React from 'react';
import { ApprovalRequest } from '../types';
import { AlertTriangle, Check, X, ShieldAlert } from 'lucide-react';

interface ApprovalModalProps {
  request: ApprovalRequest | null;
  onApprove: (id: string, always: boolean) => void;
  onDeny: (id: string) => void;
}

export const ApprovalModal: React.FC<ApprovalModalProps> = ({ request, onApprove, onDeny }) => {
  if (!request) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#1e1e1e] border border-[#3c3c3c] rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4 animate-in fade-in zoom-in duration-200">
        <div className="flex items-center space-x-3 text-amber-400">
          <ShieldAlert className="w-6 h-6 shrink-0 animate-pulse" />
          <h3 className="text-base font-semibold tracking-wide text-white">
            Permission Required (HITL Gatekeeper)
          </h3>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium text-zinc-200">
            {request.title}
          </p>
          <div className="bg-[#2d2d2d] p-3 rounded-lg border border-[#404040] text-xs font-mono text-zinc-300 overflow-x-auto max-h-32">
            {request.details}
          </div>
          {request.path && (
            <p className="text-xs text-zinc-400 truncate">
              Target: <span className="font-mono text-zinc-300">{request.path}</span>
            </p>
          )}
        </div>

        <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#3c3c3c]">
          <button
            onClick={() => onDeny(request.id)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 flex items-center space-x-1.5 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            <span>Deny</span>
          </button>
          <button
            onClick={() => onApprove(request.id, false)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center space-x-1.5 transition-colors shadow-sm"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Allow Once</span>
          </button>
          <button
            onClick={() => onApprove(request.id, true)}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center space-x-1.5 transition-colors shadow-sm"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Always Allow</span>
          </button>
        </div>
      </div>
    </div>
  );
};
