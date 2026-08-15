import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, ProviderType, AgentPersona, ExtensionSettings, MessagePart } from '../types';
import { Send, Bot, User, Copy, Check, Terminal, FileCode, Sparkles, Square, ChevronDown, ChevronRight, Loader2, Wrench, Brain, AlertCircle, CheckCircle2 } from 'lucide-react';

interface ChatViewProps {
  messages: ChatMessage[];
  onSendMessage: (text: string, persona: AgentPersona, provider: ProviderType, model: string) => void;
  onAbort: () => void;
  isExecuting: boolean;
  activeSessionID?: string;
  settings: ExtensionSettings;
  onUpdateSettings: (newSettings: Partial<ExtensionSettings>) => void;
  onApplyCode: (code: string, language: string, sessionID?: string, messageID?: string) => void;
  onApplyPatch: (sessionID: string, messageID: string) => void;
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
  onAbort,
  isExecuting,
  activeSessionID,
  settings,
  onUpdateSettings,
  onApplyCode,
  onApplyPatch
}) => {
  const [input, setInput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedReasoning, setExpandedReasoning] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isExecuting]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isExecuting) return;
    onSendMessage(input, settings.persona, settings.provider, settings.model);
    setInput('');
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleReasoning = (key: string) => {
    setExpandedReasoning((prev) => ({ ...prev, [key]: !prev[key] }));
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
              <h4 className="text-sm font-medium text-zinc-300">InnexarCode Agentic Mode</h4>
              <p className="text-xs mt-1 text-zinc-400">
                Experience Codex/Cursor agentic workflow with real-time reasoning, tool execution, and code patches.
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg, msgIdx) => {
            const isUser = msg.role === 'user';
            const isSystem = msg.role === 'system';

            if (isSystem) {
              return (
                <div key={msg.id || msgIdx} className="flex justify-center my-2">
                  <div className="bg-red-950/60 border border-red-800/50 text-red-300 px-3 py-1.5 rounded-lg text-xs flex items-center space-x-2">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{msg.content}</span>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={msg.id || msgIdx}
                className={`flex space-x-3 text-xs leading-relaxed ${
                  isUser ? 'justify-end' : 'justify-start'
                }`}
              >
                {!isUser && (
                  <div className="w-7 h-7 rounded-full bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                    <Bot className="w-4 h-4" />
                  </div>
                )}

                <div
                  className={`max-w-[88%] rounded-xl p-3.5 space-y-3 shadow-sm ${
                    isUser
                      ? 'bg-blue-600 text-white ml-auto'
                      : 'bg-[#252526] border border-[#3c3c3c] text-zinc-200'
                  }`}
                >
                  {/* Persona Header */}
                  {!isUser && (msg.persona || msg.model) && (
                    <div className="flex items-center justify-between text-[10px] text-blue-400 font-mono border-b border-[#3c3c3c] pb-1.5 mb-2">
                      <div className="flex items-center space-x-2">
                        {msg.persona && (
                          <span className="bg-blue-950 px-1.5 py-0.5 rounded border border-blue-800 text-blue-300 font-semibold">
                            {msg.persona}
                          </span>
                        )}
                        {msg.model && <span className="text-zinc-400 truncate max-w-[180px]">({msg.model})</span>}
                      </div>
                      {activeSessionID && <span className="text-zinc-500">session: {activeSessionID.slice(0, 8)}</span>}
                    </div>
                  )}

                  {/* Legacy content fallback */}
                  {msg.content && !msg.parts && (
                    <div className="whitespace-pre-wrap font-sans">{msg.content}</div>
                  )}

                  {/* Structured Parts Rendering */}
                  {msg.parts && msg.parts.map((part, pIdx) => {
                    const partKey = `${msg.id || msgIdx}-part-${pIdx}`;

                    if (part.type === 'reasoning') {
                      const isExpanded = expandedReasoning[partKey] ?? false;
                      return (
                        <div key={pIdx} className="rounded-lg bg-[#1a1a1a] border border-[#333] overflow-hidden my-1">
                          <button
                            onClick={() => toggleReasoning(partKey)}
                            className="w-full flex items-center justify-between px-3 py-1.5 text-left text-zinc-400 hover:text-zinc-200 bg-[#222] transition-colors"
                          >
                            <div className="flex items-center space-x-2">
                              <Brain className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                              <span className="text-[11px] font-medium text-purple-300">Agent Reasoning / Chain of Thought</span>
                            </div>
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                          {isExpanded && (
                            <div className="p-3 text-[11px] font-mono text-zinc-400 whitespace-pre-wrap border-t border-[#333] bg-[#181818]">
                              {part.text || 'Thinking...'}
                            </div>
                          )}
                        </div>
                      );
                    }

                    if (part.type === 'tool') {
                      const isRunning = part.toolStatus === 'running';
                      const isError = part.toolStatus === 'error';
                      return (
                        <div key={pIdx} className="my-2 rounded-lg bg-[#1c1c1e] border border-[#3c3c3c] p-2.5 space-y-1.5 font-mono text-[11px]">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              {isRunning ? (
                                <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" />
                              ) : isError ? (
                                <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              )}
                              <span className="font-semibold text-zinc-200 flex items-center space-x-1">
                                <Wrench className="w-3 h-3 text-zinc-400 mr-1" />
                                {part.toolName || 'Tool Execution'}
                              </span>
                            </div>
                            <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider ${
                              isRunning ? 'bg-amber-950 text-amber-300 border border-amber-800' :
                              isError ? 'bg-red-950 text-red-300 border border-red-800' :
                              'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            }`}>
                              {part.toolStatus || 'completed'}
                            </span>
                          </div>

                          {part.toolArgs && Object.keys(part.toolArgs).length > 0 && (
                            <div className="bg-[#141414] p-2 rounded text-zinc-400 text-[10px] overflow-x-auto">
                              <span className="text-zinc-500 block mb-0.5">Arguments:</span>
                              <code>{JSON.stringify(part.toolArgs, null, 2)}</code>
                            </div>
                          )}

                          {part.toolResult !== undefined && (
                            <div className={`p-2 rounded text-[10px] overflow-x-auto ${isError ? 'bg-red-950/40 text-red-200' : 'bg-[#141414] text-zinc-300'}`}>
                              <span className="text-zinc-500 block mb-0.5">Result:</span>
                              <code>{typeof part.toolResult === 'string' ? part.toolResult : JSON.stringify(part.toolResult, null, 2)}</code>
                            </div>
                          )}
                        </div>
                      );
                    }

                    if (part.type === 'patch' || part.type === 'file' || part.code) {
                      const codeSnippet = part.code || part.patchContent || '';
                      const codeId = `${msg.id || msgIdx}-${pIdx}`;
                      return (
                        <div key={pIdx} className="my-2 rounded-lg bg-[#181818] border border-[#3c3c3c] overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-1.5 bg-[#2d2d2d] border-b border-[#3c3c3c] text-[11px] text-zinc-300">
                            <span className="font-mono flex items-center space-x-1.5">
                              <FileCode className="w-3.5 h-3.5 text-blue-400" />
                              <span>{part.filePath || part.language || 'code patch'}</span>
                            </span>
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleCopy(codeSnippet, codeId)}
                                className="flex items-center space-x-1 hover:text-white transition-colors"
                                title="Copy Code"
                              >
                                {copiedId === codeId ? (
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
                                onClick={() => {
                                  if (msg.sessionID && msg.id) {
                                    onApplyPatch(msg.sessionID, msg.id);
                                  } else {
                                    onApplyCode(codeSnippet, part.language || 'txt', msg.sessionID, msg.id);
                                  }
                                }}
                                className="flex items-center space-x-1 bg-blue-600 hover:bg-blue-500 text-white px-2 py-0.5 rounded text-[10px] font-medium transition-colors shadow-sm"
                                title="Apply to workspace"
                              >
                                <FileCode className="w-3 h-3" />
                                <span>Apply</span>
                              </button>
                            </div>
                          </div>
                          <pre className="p-3 overflow-x-auto text-[11px] font-mono text-zinc-300 bg-[#141414]">
                            <code>{codeSnippet}</code>
                          </pre>
                        </div>
                      );
                    }

                    // Default text part
                    return (
                      <div key={pIdx} className="whitespace-pre-wrap font-sans">
                        {part.text}
                      </div>
                    );
                  })}

                  {/* Render legacy codeBlocks if present */}
                  {msg.codeBlocks && msg.codeBlocks.map((cb, cIdx) => {
                    const blockId = `${msg.id || msgIdx}-cb-${cIdx}`;
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
                              {copiedId === blockId ? (
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
                              onClick={() => onApplyCode(cb.code, cb.language, msg.sessionID, msg.id)}
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

                  {/* Streaming indicator cursor */}
                  {msg.isStreaming && isExecuting && (
                    <span className="inline-block w-2 h-3.5 bg-blue-400 animate-pulse ml-0.5 align-middle" />
                  )}
                </div>

                {isUser && (
                  <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-200 shrink-0">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Chat Input & Abort Control */}
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
            placeholder={isExecuting ? 'Agent is executing task...' : `Ask ${settings.persona} agent (Shift+Enter for newline)...`}
            rows={2}
            disabled={isExecuting}
            className="w-full bg-[#1e1e1e] border border-[#3c3c3c] rounded-lg pl-3 pr-20 py-2 text-xs text-zinc-200 focus:outline-none focus:border-blue-500 resize-none disabled:opacity-50"
          />

          <div className="absolute right-2 bottom-2 flex items-center space-x-1.5">
            {isExecuting ? (
              <button
                type="button"
                onClick={onAbort}
                className="p-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white transition-colors shadow-sm flex items-center space-x-1 text-xs font-medium px-2.5"
                title="Stop / Abort Execution"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white transition-colors shadow-sm"
                title="Send Prompt"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between mt-2 text-[10px] text-zinc-400 px-1">
          <span>Active Persona: <strong className="text-zinc-300">{settings.persona}</strong></span>
          <span>{isExecuting ? <span className="text-amber-400 animate-pulse">● Running agent loop...</span> : 'Tip: Use @file to reference code'}</span>
        </div>
      </form>
    </div>
  );
};

