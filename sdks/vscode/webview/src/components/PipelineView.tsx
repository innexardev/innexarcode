import React from 'react';
import { PipelinePhase } from '../types';
import { CheckCircle2, Clock, AlertCircle, Play, ArrowRight, ShieldCheck } from 'lucide-react';

interface PipelineViewProps {
  phases: PipelinePhase[];
  onTriggerPhase: (phaseId: string) => void;
}

export const PipelineView: React.FC<PipelineViewProps> = ({ phases, onTriggerPhase }) => {
  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] text-zinc-100 overflow-y-auto p-4 space-y-4">
      <div className="flex items-center justify-between border-b border-[#3c3c3c] pb-3">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>Autonomous 13-Phase Pipeline</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Strict Engineering OS pipeline enforcement & quality gates.
          </p>
        </div>
        <button
          onClick={() => onTriggerPhase(phases[0]?.id || 'discovery')}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white flex items-center space-x-1.5 transition-colors shadow-sm"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>Run Pipeline</span>
        </button>
      </div>

      <div className="space-y-2.5">
        {phases.map((phase, idx) => {
          const isCompleted = phase.status === 'completed';
          const isCurrent = phase.status === 'current';
          const isFailed = phase.status === 'failed';

          return (
            <div
              key={phase.id}
              className={`p-3 rounded-xl border transition-all ${
                isCurrent
                  ? 'bg-blue-950/30 border-blue-500/50 shadow-md'
                  : isCompleted
                  ? 'bg-[#252526] border-[#3c3c3c]'
                  : isFailed
                  ? 'bg-red-950/20 border-red-500/50'
                  : 'bg-[#252526]/50 border-[#3c3c3c]/50 opacity-70'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-3">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      isCompleted
                        ? 'bg-emerald-600 text-white'
                        : isCurrent
                        ? 'bg-blue-600 text-white animate-pulse'
                        : isFailed
                        ? 'bg-red-600 text-white'
                        : 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {phase.number}
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-zinc-200 flex items-center space-x-2">
                      <span>{phase.name}</span>
                      <code className="text-[10px] font-mono text-zinc-400 bg-[#1e1e1e] px-1.5 py-0.5 rounded border border-[#3c3c3c]">
                        {phase.command}
                      </code>
                    </h3>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      {phase.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {isCompleted && (
                    <span className="flex items-center space-x-1 text-[10px] text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Passed</span>
                    </span>
                  )}
                  {isCurrent && (
                    <span className="flex items-center space-x-1 text-[10px] text-blue-400 font-medium animate-pulse">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Running</span>
                    </span>
                  )}
                  {isFailed && (
                    <span className="flex items-center space-x-1 text-[10px] text-red-400 font-medium">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Failed</span>
                    </span>
                  )}
                  <button
                    onClick={() => onTriggerPhase(phase.id)}
                    className="p-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                    title={`Run Phase ${phase.name}`}
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
