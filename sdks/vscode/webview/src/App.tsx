import React, { useState, useEffect } from 'react';
import { TabType, ChatMessage, PipelinePhase, ExtensionSettings, ApprovalRequest, ProviderType, AgentPersona } from './types';
import { ChatView } from './components/ChatView';
import { PipelineView } from './components/PipelineView';
import { SettingsView } from './components/SettingsView';
import { ApprovalModal } from './components/ApprovalModal';
import { MessageSquare, ShieldCheck, Sliders, Terminal } from 'lucide-react';

// Declare VS Code API function provided by webview environment
declare function acquireVsCodeApi(): {
  postMessage: (message: any) => void;
  getState: () => any;
  setState: (state: any) => void;
};

const vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : { postMessage: () => {} };

const INITIAL_PHASES: PipelinePhase[] = [
  { id: 'discovery', number: 1, name: 'Discovery', command: 'discover', description: 'Scan README, AGENTS.md, config, and structure', status: 'completed' },
  { id: 'research', number: 2, name: 'Research', command: 'research', description: 'Verify official docs and breaking changes', status: 'completed' },
  { id: 'planning', number: 3, name: 'Planning', command: 'plan-create', description: 'Markdown plan in .innexarcode/plans/', status: 'completed' },
  { id: 'architecture', number: 4, name: 'Architecture', command: 'architect', description: 'ADRs, interfaces, and schema decisions', status: 'completed' },
  { id: 'debate', number: 5, name: 'Debate', command: 'debate', description: 'Multi-agent cross critique (Backend, QA, Security)', status: 'current' },
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
  hitlToolExecution: true
};

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phases, setPhases] = useState<PipelinePhase[]>(INITIAL_PHASES);
  const [settings, setSettings] = useState<ExtensionSettings>(INITIAL_SETTINGS);
  const [approvalRequest, setApprovalRequest] = useState<ApprovalRequest | null>(null);

  useEffect(() => {
    // Listen for messages from extension host
    const messageListener = (event: MessageEvent) => {
      const message = event.data;
      if (!message) return;

      switch (message.type) {
        case 'init':
          if (message.settings) setSettings(message.settings);
          break;
        case 'chat_response':
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              role: 'assistant',
              content: message.content,
              timestamp: Date.now(),
              persona: message.persona,
              model: message.model,
              codeBlocks: message.codeBlocks
            }
          ]);
          break;
        case 'hitl_request':
          setApprovalRequest(message.request);
          break;
        case 'pipeline_update':
          setPhases(message.phases);
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
      role: 'user',
      content: text,
      timestamp: Date.now()
    };
    setMessages((prev) => [...prev, userMsg]);

    // Send to extension host
    vscode.postMessage({
      type: 'send_prompt',
      text,
      persona,
      provider,
      model
    });
  };

  const handleApplyCode = (code: string, language: string) => {
    vscode.postMessage({
      type: 'apply_code',
      code,
      language
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
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>InnexarCode v1.18</span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'chat' && (
          <ChatView
            messages={messages}
            onSendMessage={handleSendMessage}
            settings={settings}
            onUpdateSettings={(upd) => setSettings({ ...settings, ...upd })}
            onApplyCode={handleApplyCode}
          />
        )}

        {activeTab === 'pipeline' && (
          <PipelineView
            phases={phases}
            onTriggerPhase={handleTriggerPhase}
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
