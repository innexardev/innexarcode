import React, { useState, useEffect } from 'react';
import { TabType, ChatMessage, PipelinePhase, ExtensionSettings, ApprovalRequest, ProviderType, AgentPersona, MessagePart } from './types';
import { ChatView } from './components/ChatView';
import { PipelineView } from './components/PipelineView';
import { SettingsView } from './components/SettingsView';
import { ApprovalModal } from './components/ApprovalModal';
import { MessageSquare, ShieldCheck, Sliders } from 'lucide-react';

// Declare VS Code API function provided by webview environment
declare function acquireVsCodeApi(): {
  postMessage: (message: any) => void;
  getState: () => any;
  setState: (state: any) => void;
};

const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : { postMessage: () => {} };

const INITIAL_PHASES: PipelinePhase[] = [
  { id: 'discovery', number: 1, name: 'Discovery', command: 'discover', description: 'Scan README, AGENTS.md, config, and structure', status: 'pending' },
  { id: 'research', number: 2, name: 'Research', command: 'research', description: 'Verify official docs and breaking changes', status: 'pending' },
  { id: 'planning', number: 3, name: 'Planning', command: 'plan-create', description: 'Markdown plan in .opencode/plans/', status: 'pending' },
  { id: 'architecture', number: 4, name: 'Architecture', command: 'architect', description: 'ADRs, interfaces, and schema decisions', status: 'pending' },
  { id: 'debate', number: 5, name: 'Debate', command: 'debate', description: 'Multi-agent cross critique (Backend, QA, Security)', status: 'pending' },
  { id: 'implementation', number: 6, name: 'Implementation', command: 'implement', description: 'Domain agents executing code changes', status: 'pending' },
  { id: 'review', number: 7, name: 'Review', command: 'code-reviewer', description: 'Bugs, security, performance, correctness review', status: 'pending' },
  { id: 'qa', number: 8, name: 'QA', command: 'qa', description: 'Test execution, coverage, and adversarial breaking', status: 'pending' },
  { id: 'security', number: 9, name: 'Security', command: 'security', description: 'OWASP Top 10, injection, secrets scan', status: 'pending' },
  { id: 'self-critique', number: 10, name: 'Self-Critique', command: 'self-critique', description: 'Check for incomplete or orphaned code', status: 'pending' },
  { id: 'question', number: 11, name: 'Question', command: 'questionador', description: 'What could be missing verification', status: 'pending' },
  { id: 'audit', number: 12, name: 'Audit', command: 'audit-report', description: 'Comprehensive audit scorecard report', status: 'pending' },
  { id: 'delivery', number: 13, name: 'Delivery', command: 'deliver', description: 'Release manager checklist and green light', status: 'pending' }
];

const INITIAL_SETTINGS: ExtensionSettings = {
  provider: 'OpenRouter',
  model: 'google/gemini-3.5-flash-lite',
  persona: 'Auto',
  openrouterApiKey: '',
  openaiApiKey: '',
  anthropicApiKey: '',
  geminiApiKey: '',
  ollamaUrl: 'http://localhost:11434',
  maxTokens: 8192,
  autoApproveReads: true,
  hitlFileWrites: true,
  hitlToolExecution: true,
  serverPort: 16384,
  serverUsername: 'opencode',
  serverPassword: '',
  autoStartServer: true
};

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phases, setPhases] = useState<PipelinePhase[]>(INITIAL_PHASES);
  const [settings, setSettings] = useState<ExtensionSettings>(INITIAL_SETTINGS);
  const [approvalRequest, setApprovalRequest] = useState<ApprovalRequest | null>(null);
  const [activeSessionID, setActiveSessionID] = useState<string | undefined>(undefined);
  const [isExecuting, setIsExecuting] = useState(false);
  const [serverStatus, setServerStatus] = useState<{ connected: boolean; port?: number; version?: string; error?: string }>({ connected: false });

  useEffect(() => {
    // Listen for messages from extension host
    const messageListener = (event: MessageEvent) => {
      const message = event.data;
      if (!message) return;

      switch (message.type) {
        case 'init':
          if (message.settings) {
            setSettings((prev) => ({ ...prev, ...message.settings }));
          }
          if (message.server) {
            setServerStatus({
              connected: !!message.server.connected,
              port: message.server.port,
              version: message.server.version,
              error: message.server.error
            });
            if (typeof message.server.port === 'number') {
              setSettings((prev) => ({ ...prev, serverPort: message.server.port }));
            }
          }
          break;

        case 'index.server_error':
          setServerStatus((prev) => ({ ...prev, connected: false, error: message.message }));
          break;

        case 'session_created':
          if (message.session && message.session.id) {
            setActiveSessionID(message.session.id);
          }
          break;

        case 'message_parts': {
          const { sessionID, messageID, role, parts } = message;
          setMessages((prev) => {
            const existingIndex = prev.findIndex((m) => m.id === messageID);
            const newParts: MessagePart[] = (parts || []).map((p: any) => ({
              type: p.type || 'text',
              text: p.text,
              toolName: p.toolName,
              toolArgs: p.toolArgs,
              toolResult: p.toolResult,
              toolStatus: p.toolStatus || 'completed'
            }));

            if (existingIndex >= 0) {
              const updated = [...prev];
              updated[existingIndex] = {
                ...updated[existingIndex],
                parts: newParts,
                isStreaming: true
              };
              return updated;
            } else {
              return [
                ...prev,
                {
                  id: messageID || Date.now().toString(),
                  sessionID,
                  role: role as 'user' | 'assistant' | 'system',
                  parts: newParts,
                  timestamp: Date.now(),
                  isStreaming: true
                }
              ];
            }
          });
          break;
        }

        case 'event': {
          const ev = message.event;
          if (!ev) break;
          const evType = ev.type;
          const props = ev.properties || {};

          if (evType === 'session.start' || evType === 'session.run.start') {
            setIsExecuting(true);
          } else if (evType === 'session.finish' || evType === 'session.run.finish' || evType === 'session.idle') {
            setIsExecuting(false);
            setMessages((prev) => prev.map((m) => ({ ...m, isStreaming: false })));
          } else if (evType === 'text.delta' || evType === 'content.delta') {
            const deltaText = props.text || props.delta || '';
            if (deltaText) {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'assistant' && last.isStreaming) {
                  const updatedParts = [...(last.parts || [])];
                  const lastPart = updatedParts[updatedParts.length - 1];
                  if (lastPart && lastPart.type === 'text') {
                    updatedParts[updatedParts.length - 1] = {
                      ...lastPart,
                      text: (lastPart.text || '') + deltaText
                    };
                  } else {
                    updatedParts.push({ type: 'text', text: deltaText });
                  }
                  const updated = [...prev];
                  updated[updated.length - 1] = { ...last, parts: updatedParts };
                  return updated;
                } else {
                  return [
                    ...prev,
                    {
                      id: Date.now().toString(),
                      role: 'assistant',
                      parts: [{ type: 'text', text: deltaText }],
                      timestamp: Date.now(),
                      isStreaming: true
                    }
                  ];
                }
              });
            }
          } else if (evType === 'reasoning.delta' || evType === 'reasoning') {
            const reasoningText = props.text || props.delta || '';
            if (reasoningText) {
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.role === 'assistant') {
                  const updatedParts = [...(last.parts || [])];
                  const reasoningPartIndex = updatedParts.findIndex((p) => p.type === 'reasoning');
                  if (reasoningPartIndex >= 0) {
                    const existing = updatedParts[reasoningPartIndex];
                    updatedParts[reasoningPartIndex] = {
                      ...existing,
                      text: (existing.text || '') + reasoningText
                    };
                  } else {
                    updatedParts.unshift({ type: 'reasoning', text: reasoningText });
                  }
                  const updated = [...prev];
                  updated[updated.length - 1] = { ...last, parts: updatedParts };
                  return updated;
                }
                return prev;
              });
            }
          } else if (evType === 'tool.called' || evType === 'tool_call') {
            const toolName = props.name || props.toolName || 'tool';
            const toolArgs = props.args || props.arguments || {};
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              const parts = last && last.role === 'assistant' ? [...(last.parts || [])] : [];
              parts.push({
                type: 'tool',
                toolName,
                toolArgs: typeof toolArgs === 'object' ? toolArgs : { raw: toolArgs },
                toolStatus: 'running'
              });
              if (last && last.role === 'assistant') {
                const updated = [...prev];
                updated[updated.length - 1] = { ...last, parts, isStreaming: true };
                return updated;
              } else {
                return [
                  ...prev,
                  {
                    id: Date.now().toString(),
                    role: 'assistant',
                    parts,
                    timestamp: Date.now(),
                    isStreaming: true
                  }
                ];
              }
            });
          } else if (evType === 'tool.success' || evType === 'tool.complete') {
            const toolName = props.name || props.toolName;
            const result = props.result || props.output;
            setMessages((prev) => {
              const updated = [...prev];
              for (let i = updated.length - 1; i >= 0; i--) {
                const m = updated[i];
                if (m.parts) {
                  const pIdx = m.parts.findIndex((p) => p.type === 'tool' && p.toolStatus === 'running' && (!toolName || p.toolName === toolName));
                  if (pIdx >= 0) {
                    const newParts = [...m.parts];
                    newParts[pIdx] = { ...newParts[pIdx], toolResult: result, toolStatus: 'completed' };
                    updated[i] = { ...m, parts: newParts };
                    break;
                  }
                }
              }
              return updated;
            });
          } else if (evType === 'tool.failed' || evType === 'tool.error') {
            const toolName = props.name || props.toolName;
            const error = props.error || props.message;
            setMessages((prev) => {
              const updated = [...prev];
              for (let i = updated.length - 1; i >= 0; i--) {
                const m = updated[i];
                if (m.parts) {
                  const pIdx = m.parts.findIndex((p) => p.type === 'tool' && p.toolStatus === 'running' && (!toolName || p.toolName === toolName));
                  if (pIdx >= 0) {
                    const newParts = [...m.parts];
                    newParts[pIdx] = { ...newParts[pIdx], toolResult: error, toolStatus: 'error' };
                    updated[i] = { ...m, parts: newParts };
                    break;
                  }
                }
              }
              return updated;
            });
          }

          // Dynamic pipeline updates from server events (session.next.*)
          const identifier = String(props.agent || props.toolName || props.name || props.command || props.step || evType).toLowerCase();
          const matchPhaseId = (id: string) => {
            if (identifier.includes(id)) return true;
            if (id === 'discovery' && (identifier.includes('discover') || identifier.includes('scan'))) return true;
            if (id === 'planning' && identifier.includes('plan')) return true;
            if (id === 'architecture' && identifier.includes('architect')) return true;
            if (id === 'implementation' && (identifier.includes('implement') || identifier.includes('backend') || identifier.includes('frontend'))) return true;
            if (id === 'review' && identifier.includes('reviewer')) return true;
            if (id === 'question' && identifier.includes('question')) return true;
            if (id === 'audit' && identifier.includes('audit')) return true;
            if (id === 'delivery' && identifier.includes('deliver')) return true;
            return false;
          };

          if (evType.includes('agent.switched') || evType.includes('step.started') || evType.includes('tool.called')) {
            setPhases((prev) => {
              let foundIndex = prev.findIndex((p) => matchPhaseId(p.id));
              if (foundIndex < 0) {
                foundIndex = prev.findIndex((p) => p.status === 'pending');
              }
              if (foundIndex < 0) return prev;
              return prev.map((p, idx) => {
                if (idx < foundIndex && p.status === 'pending') {
                  return { ...p, status: 'completed' };
                }
                if (idx === foundIndex) {
                  return { ...p, status: 'current' };
                }
                return p;
              });
            });
          } else if (evType.includes('step.ended') || evType.includes('tool.success') || evType.includes('tool.complete')) {
            setPhases((prev) => {
              const foundIndex = prev.findIndex((p) => p.status === 'current' || matchPhaseId(p.id));
              if (foundIndex < 0) return prev;
              return prev.map((p, idx) => {
                if (idx === foundIndex) {
                  return { ...p, status: 'completed' };
                }
                return p;
              });
            });
          } else if (evType.includes('step.failed') || evType.includes('tool.failed') || evType.includes('tool.error')) {
            setPhases((prev) => {
              const foundIndex = prev.findIndex((p) => p.status === 'current' || matchPhaseId(p.id));
              if (foundIndex < 0) return prev;
              return prev.map((p, idx) => {
                if (idx === foundIndex) {
                  return { ...p, status: 'failed' };
                }
                return p;
              });
            });
          }

          break;
        }

        case 'pipeline_status':
          if (message.phase && message.status) {
            setPhases((prev) =>
              prev.map((p) => (p.id === message.phase ? { ...p, status: message.status as any } : p))
            );
          }
          break;

        case 'pipeline_update':
          if (message.phases) {
            setPhases(message.phases);
          }
          break;

        case 'chat_response_finish':
          setIsExecuting(false);
          setMessages((prev) => prev.map((m) => ({ ...m, isStreaming: false })));
          break;

        case 'chat_error':
          setIsExecuting(false);
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'system',
              content: `Error: ${message.message}`,
              timestamp: Date.now()
            }
          ]);
          break;

        case 'hitl_request':
          setApprovalRequest(message.request);
          break;

        case 'pipeline_update':
          if (message.phases) {
            setPhases(message.phases);
          }
          break;
      }
    };

    window.addEventListener('message', messageListener);
    vscode.postMessage({ type: 'webview_ready' });

    return () => {
      window.removeEventListener('message', messageListener);
    };
  }, []);

  const handleSendMessage = (text: string, persona: AgentPersona, provider: ProviderType, model: string) => {
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sessionID: activeSessionID,
      role: 'user',
      content: text,
      parts: [{ type: 'text', text }],
      timestamp: Date.now()
    };
    setMessages((prev) => [...prev, userMsg]);
    setIsExecuting(true);

    // Send to extension host
    vscode.postMessage({
      type: 'send_prompt',
      text,
      persona,
      provider,
      model,
      sessionID: activeSessionID
    });
  };

  const handleAbort = () => {
    setIsExecuting(false);
    vscode.postMessage({
      type: 'abort_session',
      sessionID: activeSessionID
    });
  };

  const handleApplyCode = (code: string, language: string, sessionID?: string, messageID?: string) => {
    vscode.postMessage({
      type: 'apply_patch',
      sessionID: sessionID || activeSessionID,
      messageID,
      code,
      language
    });
  };

  const handleApplyPatch = (sessionID: string, messageID: string) => {
    vscode.postMessage({
      type: 'apply_patch',
      sessionID,
      messageID
    });
  };

  const handleTriggerPhase = (phaseId: string) => {
    setPhases((prev) =>
      prev.map((p) => {
        if (p.id === phaseId) return { ...p, status: 'current' };
        return p;
      })
    );
    vscode.postMessage({
      type: 'trigger_pipeline_phase',
      phaseId
    });
  };

  const handleSaveSettings = (newSettings: ExtensionSettings) => {
    setSettings(newSettings);
    vscode.postMessage({
      type: 'save_settings',
      settings: newSettings
    });
  };

  const handleApprove = (id: string, always: boolean) => {
    vscode.postMessage({
      type: 'hitl_response',
      id,
      approved: true,
      always
    });
    setApprovalRequest(null);
  };

  const handleDeny = (id: string) => {
    vscode.postMessage({
      type: 'hitl_response',
      id,
      approved: false
    });
    setApprovalRequest(null);
  };

  return (
    <div className="flex flex-col h-screen bg-[#1e1e1e] text-zinc-100 overflow-hidden select-none">
      {/* Navigation Header Tabs */}
      <div className="flex items-center justify-between border-b border-[#3c3c3c] bg-[#252526] px-3 py-1.5 shrink-0">
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'chat'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#333333]'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat</span>
          </button>

          <button
            onClick={() => setActiveTab('pipeline')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'pipeline'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#333333]'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Pipeline</span>
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'settings'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-[#333333]'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
        </div>

        <div className="flex items-center space-x-2 text-[10px] text-zinc-400 font-mono">
          <span className={`w-2 h-2 rounded-full ${isExecuting ? 'bg-amber-500 animate-ping' : 'bg-emerald-500 animate-pulse'}`} />
          <span>{isExecuting ? 'Agent Executing...' : 'InnexarCode v1.18'}</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'chat' && (
          <ChatView
            messages={messages}
            onSendMessage={handleSendMessage}
            onAbort={handleAbort}
            isExecuting={isExecuting}
            activeSessionID={activeSessionID}
            settings={settings}
            onUpdateSettings={(upd) => setSettings({ ...settings, ...upd })}
            onApplyCode={handleApplyCode}
            onApplyPatch={handleApplyPatch}
          />
        )}

        {activeTab === 'pipeline' && (
          <PipelineView
            phases={phases}
            onTriggerPhase={handleTriggerPhase}
            serverStatus={serverStatus}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            settings={settings}
            onSaveSettings={handleSaveSettings}
          />
        )}
      </div>

      {/* HITL Approval Modal Dialog */}
      <ApprovalModal
        request={approvalRequest}
        onApprove={handleApprove}
        onDeny={handleDeny}
      />
    </div>
  );
};

