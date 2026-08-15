import React, { useState } from 'react';
import { ExtensionSettings } from '../types';
import { Key, Shield, Sliders, Save, Check } from 'lucide-react';

interface SettingsViewProps {
  settings: ExtensionSettings;
  onSaveSettings: (newSettings: ExtensionSettings) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, onSaveSettings }) => {
  const [form, setForm] = useState<ExtensionSettings>({ ...settings });
  const [saved, setSaved] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] text-zinc-100 overflow-y-auto p-4 space-y-6">
      <div className="flex items-center justify-between border-b border-[#3c3c3c] pb-3">
        <div>
          <h2 className="text-sm font-semibold text-white flex items-center space-x-2">
            <Sliders className="w-4 h-4 text-blue-400" />
            <span>EngOS Settings & Permissions</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5">
            Configure provider API keys, model budgets, and HITL gatekeeper permissions.
          </p>
        </div>
        <button
          onClick={handleSubmit}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center space-x-1.5 transition-colors shadow-sm"
        >
          {saved ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-300" />
              <span>Saved!</span>
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5" />
              <span>Save Changes</span>
            </>
          )}
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5 text-xs">
        {/* Server Connection Section */}
        <div className="space-y-3 bg-[#252526] p-4 rounded-xl border border-[#3c3c3c]">
          <h3 className="text-xs font-semibold text-zinc-200 flex items-center space-x-2 border-b border-[#3c3c3c] pb-2">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>EngOS Server & Authentication</span>
          </h3>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Server Port</label>
              <input
                type="number"
                value={form.serverPort ?? 16384}
                onChange={(e) => setForm({ ...form, serverPort: parseInt(e.target.value) || 16384 })}
                className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-500 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Server Username</label>
              <input
                type="text"
                value={form.serverUsername ?? 'opencode'}
                onChange={(e) => setForm({ ...form, serverUsername: e.target.value })}
                placeholder="opencode"
                className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-500 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Server Password (Basic Auth)</label>
              <input
                type="password"
                value={form.serverPassword ?? ''}
                onChange={(e) => setForm({ ...form, serverPassword: e.target.value })}
                placeholder="Optional password"
                className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-500 font-mono text-xs"
              />
            </div>
            <div className="pt-1">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.autoStartServer ?? true}
                  onChange={(e) => setForm({ ...form, autoStartServer: e.target.checked })}
                  className="rounded bg-[#1e1e1e] border-[#3c3c3c] text-blue-600 focus:ring-0"
                />
                <span className="text-zinc-300">Auto-start local EngOS server on activation</span>
              </label>
            </div>
          </div>
        </div>

        {/* API Keys Section */}
        <div className="space-y-3 bg-[#252526] p-4 rounded-xl border border-[#3c3c3c]">
          <h3 className="text-xs font-semibold text-zinc-200 flex items-center space-x-2 border-b border-[#3c3c3c] pb-2">
            <Key className="w-3.5 h-3.5 text-amber-400" />
            <span>Provider API Credentials</span>
          </h3>

          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">OpenRouter API Key</label>
              <input
                type="password"
                value={form.openrouterApiKey}
                onChange={(e) => setForm({ ...form, openrouterApiKey: e.target.value })}
                placeholder="sk-or-v1-..."
                className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-500 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">OpenAI API Key</label>
              <input
                type="password"
                value={form.openaiApiKey}
                onChange={(e) => setForm({ ...form, openaiApiKey: e.target.value })}
                placeholder="sk-..."
                className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-500 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Anthropic API Key</label>
              <input
                type="password"
                value={form.anthropicApiKey}
                onChange={(e) => setForm({ ...form, anthropicApiKey: e.target.value })}
                placeholder="sk-ant-..."
                className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-500 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Gemini API Key</label>
              <input
                type="password"
                value={form.geminiApiKey}
                onChange={(e) => setForm({ ...form, geminiApiKey: e.target.value })}
                placeholder="AIza..."
                className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-500 font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-[11px] text-zinc-400 mb-1">Ollama Base URL</label>
              <input
                type="text"
                value={form.ollamaUrl}
                onChange={(e) => setForm({ ...form, ollamaUrl: e.target.value })}
                placeholder="http://localhost:11434"
                className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-500 font-mono text-xs"
              />
            </div>
          </div>
        </div>

        {/* Context & Limits Section */}
        <div className="space-y-3 bg-[#252526] p-4 rounded-xl border border-[#3c3c3c]">
          <h3 className="text-xs font-semibold text-zinc-200 flex items-center space-x-2 border-b border-[#3c3c3c] pb-2">
            <Sliders className="w-3.5 h-3.5 text-blue-400" />
            <span>Context & Limits</span>
          </h3>

          <div>
            <label className="block text-[11px] text-zinc-400 mb-1">Max Token Budget per Turn</label>
            <input
              type="number"
              value={form.maxTokens}
              onChange={(e) => setForm({ ...form, maxTokens: parseInt(e.target.value) || 8192 })}
              className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-3 py-1.5 text-zinc-200 focus:outline-none focus:border-blue-500 font-mono text-xs"
            />
          </div>
        </div>

        {/* Permissions & HITL Section */}
        <div className="space-y-3 bg-[#252526] p-4 rounded-xl border border-[#3c3c3c]">
          <h3 className="text-xs font-semibold text-zinc-200 flex items-center space-x-2 border-b border-[#3c3c3c] pb-2">
            <Shield className="w-3.5 h-3.5 text-emerald-400" />
            <span>Permission Gatekeeper (HITL)</span>
          </h3>

          <div className="space-y-2.5">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.autoApproveReads}
                onChange={(e) => setForm({ ...form, autoApproveReads: e.target.checked })}
                className="rounded bg-[#1e1e1e] border-[#3c3c3c] text-blue-600 focus:ring-0"
              />
              <span className="text-zinc-300">Auto-approve read-only filesystem operations</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.hitlFileWrites}
                onChange={(e) => setForm({ ...form, hitlFileWrites: e.target.checked })}
                className="rounded bg-[#1e1e1e] border-[#3c3c3c] text-blue-600 focus:ring-0"
              />
              <span className="text-zinc-300">Require HITL confirmation for file writes & edits</span>
            </label>

            <label className="flex items-center space-x-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.hitlToolExecution}
                onChange={(e) => setForm({ ...form, hitlToolExecution: e.target.checked })}
                className="rounded bg-[#1e1e1e] border-[#3c3c3c] text-blue-600 focus:ring-0"
              />
              <span className="text-zinc-300">Require HITL confirmation for destructive tool executions</span>
            </label>
          </div>
        </div>
      </form>
    </div>
  );
};
