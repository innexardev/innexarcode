export type TabType = 'chat' | 'pipeline' | 'settings';

export type ProviderType = 'OpenRouter' | 'OpenAI' | 'Anthropic' | 'Gemini' | 'Ollama';

export type AgentPersona = 'Auto' | 'Planner' | 'Architect' | 'Backend' | 'Frontend' | 'QA' | 'Security';

export type MessagePartType = 'text' | 'reasoning' | 'tool' | 'patch' | 'file';

export interface MessagePart {
  id?: string;
  type: MessagePartType;
  text?: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: unknown;
  toolStatus?: 'running' | 'completed' | 'error';
  patchContent?: string;
  filePath?: string;
  language?: string;
  code?: string;
}

export interface ChatMessage {
  id: string;
  sessionID?: string;
  role: 'user' | 'assistant' | 'system';
  content?: string;
  parts?: MessagePart[];
  timestamp: number;
  persona?: AgentPersona;
  provider?: ProviderType;
  model?: string;
  codeBlocks?: { language: string; code: string }[];
  isStreaming?: boolean;
}

export interface PipelinePhase {
  id: string;
  number: number;
  name: string;
  command: string;
  description: string;
  status: 'completed' | 'current' | 'pending' | 'failed';
}

export interface ExtensionSettings {
  provider: ProviderType;
  model: string;
  persona: AgentPersona;
  openrouterApiKey: string;
  openaiApiKey: string;
  anthropicApiKey: string;
  geminiApiKey: string;
  ollamaUrl: string;
  maxTokens: number;
  autoApproveReads: boolean;
  hitlFileWrites: boolean;
  hitlToolExecution: boolean;
  serverPort?: number;
  serverUsername?: string;
  serverPassword?: string;
  autoStartServer?: boolean;
}

export interface ApprovalRequest {
  id: string;
  type: 'file_write' | 'tool_execution';
  title: string;
  details: string;
  path?: string;
  sessionID?: string;
  messageID?: string;
}
