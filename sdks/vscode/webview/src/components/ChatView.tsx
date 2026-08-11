import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, ProviderType, AgentPersona, ExtensionSettings } from '../types';
import { Send, Bot, User, Copy, Check, Terminal, FileCode, Sparkles, Sliders } from 'lucide-react';

interface ChatViewProps {
  messages: ChatMessage[];
  onSendMessage: (text: string, persona: AgentPersona, provider: ProviderType, model: string) => void;
  settings: ExtensionSettings;
  onUpdateSettings: (newSettings: Partial<ExtensionSettings>) => void;
  onApplyCode: (code: string, language: string) => void;
}

const MODELS_BY_PROVIDER: Record<ProviderType, string[]> = {
  OpenRouter: ['google/gemini-3.5-flash-lite', 'anthropic/claude-3.5-sonnet', 'openai/gpt-4o', 'deepseek/deepseek-chat'],
  OpenAI: ['gpt-4o', 'gpt-4o-mini', 'o1-preview', 'o3-mini'],
  Anthropic: ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  Gemini: ['gemini-2.0-flash-exp', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  Ollama: ['deepseek-r1:7b', 'llama3.3:70b', 'codellama:latest', 'qwen2.5-coder:7b']
};

export const ChatView: React.FC<ChatViewProps> = ({
  messages,
  onSendMessage,
  settings,
  onUpdateSettings,
  onApplyCode
}) => {
  const [input, setInput] = useState('');
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSendMessage(input, settings.persona, settings.provider, settings.model);
    setInput('');
  };

  const handleCopy = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeId(id);
    setTimeout(() => setCopiedCodeId(null), 2000);
  };

  const availableModels = MODELS_BY_PROVIDER[settings.provider] || [];

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] text-zinc-100">
      {/* Top selectors bar */}
      <div className="border-b border-[#3c3c3c] p-2.5 bg-[#252526] space-y-2 text-xs">
        <div className="grid grid-cols-3 gap-2">
          {/* Provider Selector */}
          <div>
            <label className="block text-[10px] font-semibold text-zinc-400 mb-1 uppercase tracking-wider">
              Provider
            </label>
            <select
              value={settings.provider}
              onChange={(e) => {
                const prov = e.target.value as ProviderType;
                onUpdateSettings({
                  provider: prov,
                  model: MODELS_BY_PROVIDER[prov]?.[0] || 'default'
                });
              }}
              className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-blue-500"
            >
              {Object.keys(MODELS_BY_PROVIDER).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Model Selector */}
          <div>
            <label className="block text-[10px] font-semibold text-zinc-400 mb-1 uppercase tracking-wider">
              Model
            </label>
            <select
              value={settings.model}
              onChange={(e) => onUpdateSettings({ model: e.target.value })}
              className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-blue-500 truncate"
            >
              {availableModels.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          {/* Persona Selector */}
          <div>
            <label className="block text-[10px] font-semibold text-zinc-400 mb-1 uppercase tracking-wider">
              Persona
            </label>
            <select
              value={settings.persona}
              onChange={(e) => onUpdateSettings({ persona: e.target.value as AgentPersona })}
              className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded px-2 py-1 text-zinc-200 focus:outline-none focus:border-blue-500"
            >
              {['Auto', 'Planner', 'Architect', 'Backend', 'Frontend', 'QA', 'Security'].map((per) => (
                <option key={per} value={per}>{per}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500 space-y-3">
            <Sparkles className="w-10 h-10 text-blue-500 animate-pulse" />
            <div>
              <h4 className="text-sm font-medium text-zinc-300">InnexarCode Active</h4>
              <p className="text-xs mt-1 text-zinc-400">
                Ask a question, request a feature, or trigger an autonomous pipeline execution.
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={msg.id || idx}
              className={`flex space-x-3 text-xs leading-relaxed ${
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              {msg.role !== 'user' && (
                <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[85%] rounded-lg p-3 space-y-2 shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white ml-auto'
                    : 'bg-[#252526] border border-[#3c3c3c] text-zinc-200'
                }`}
              >
                {msg.persona && msg.role === 'assistant' && (
                  <div className="flex items-center space-x-2 text-[10px] text-blue-400 font-mono border-b border-[#3c3c3c] pb-1 mb-1">
                    <span className="bg-blue-950 px-1.5 py-0.5 rounded border border-blue-800">
                      {msg.persona}
                    </span>
                    {msg.model && <span className="text-zinc-400">({msg.model})</span>}
                  </div>
                )}

                <div className="whitespace-pre-wrap font-sans">{msg.content}</div>

                {/* Render Code Blocks if any */}
                {msg.codeBlocks && msg.codeBlocks.map((cb, cIdx) => {
                  const blockId = `${msg.id}-${cIdx}`;
                  return (
                    <div key={cIdx} className="my-2 rounded-lg bg-[#181818] border border-[#3c3c3c] overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-1 bg-[#2d2d2d] border-b border-[#3c3c3c] text-[11px] text-zinc-400">
                        <span className="font-mono">{cb.language}</span>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleCopy(cb.code, blockId)}
                            className="flex items-center space-x-1 hover:text-white transition-colors"
                            title="Copy Code"
                          >
                            {copiedCodeId === blockId ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-emerald-400">Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => onApplyCode(cb.code, cb.language)}
                            className="flex items-center space-x-1 bg-blue-600 hover:bg-blue-500 text-white px-2 py-0.5 rounded text-[10px] font-medium transition-colors"
                            title="Apply to active editor"
                          >
                            <FileCode className="w-3 h-3" />
                            <span>Apply</span>
                          </button>
                        </div>
                      </div>
                      <pre className="p-3 overflow-x-auto text-[11px] font-mono text-zinc-300">
                        <code>{cb.code}</code>
                      </pre>
                    </div>
                  );
                })}
              </div>

              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-200 shrink-0">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input */}
      <form onSubmit={handleSend} className="p-3 border-t border-[#3c3c3c] bg-[#252526]">
        <div className="relative flex items-center">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            placeholder={`Ask ${settings.persona} agent (Shift+Enter for newline)...`}
            rows={2}
            className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded-lg pl-3 pr-10 py-2 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 resize-none"
          />
          <button
            type="submit"
            disabled={!input.trim()}
            className="absolute right-2 bottom-2 p-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white transition-colors shadow-sm"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="flex items-center justify-between mt-2 text-[10px] text-zinc-400 px-1">
          <span>Active Persona: <strong className="text-zinc-300">{settings.persona}</strong></span>
          <span>Tip: Use @file to reference code</span>
        </div>
      </form>
    </div>
  );
};
