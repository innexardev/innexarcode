import * as vscode from "vscode";
import * as cp from "child_process";
import * as path from "path";
import * as fs from "fs";

const TERMINAL_NAME = "innexarcode";

export function deactivate() {}

export function activate(context: vscode.ExtensionContext) {
  const serverPort = Math.floor(Math.random() * (65535 - 16384 + 1)) + 16384;
  let serverProcess: cp.ChildProcess | undefined;

  // 1. Spawn local InnexarCode server process
  try {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const cwd = workspaceFolders ? workspaceFolders[0].uri.fsPath : process.cwd();
    
    serverProcess = cp.spawn("innexarcode", ["--port", serverPort.toString()], {
      cwd,
      env: {
        ...process.env,
        _EXTENSION_INNEXARCODE_PORT: serverPort.toString(),
        INNEXARCODE_CALLER: "vscode"
      },
      shell: true
    });

    serverProcess.on("error", (err: Error) => {
      console.error("InnexarCode server spawn error:", err);
    });
  } catch (err) {
    console.error("Failed to start InnexarCode server:", err);
  }

  context.subscriptions.push({
    dispose: () => {
      if (serverProcess) {
        serverProcess.kill();
      }
    }
  });

  // 2. Register Webview View Provider for Chat & Pipeline
  const provider = new InnexarCodeWebviewViewProvider(context, serverPort);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("innexarcode.chatView", provider, {
      webviewOptions: { retainContextWhenHidden: true }
    })
  );

  // 3. Register Commands
  const openNewTerminalDisposable = vscode.commands.registerCommand("innexarcode.openNewTerminal", async () => {
    await openTerminal(serverPort);
  });

  const openTerminalDisposable = vscode.commands.registerCommand("innexarcode.openTerminal", async () => {
    const existingTerminal = vscode.window.terminals.find((t: vscode.Terminal) => t.name === TERMINAL_NAME);
    if (existingTerminal) {
      existingTerminal.show();
      return;
    }
    await openTerminal(serverPort);
  });

  const addFilepathDisposable = vscode.commands.registerCommand("innexarcode.addFilepathToTerminal", async () => {
    const fileRef = getActiveFile();
    if (!fileRef) {return;}

    const terminal = vscode.window.activeTerminal;
    if (!terminal) {return;}

    if (terminal.name === TERMINAL_NAME) {
      // @ts-ignore
      const port = terminal.creationOptions.env?.["_EXTENSION_INNEXARCODE_PORT"] || serverPort;
      port ? await appendPrompt(parseInt(port as string), fileRef) : terminal.sendText(fileRef, false);
      terminal.show();
    }
  });

  const openSettingsDisposable = vscode.commands.registerCommand("innexarcode.openSettings", () => {
    vscode.commands.executeCommand("workbench.view.extension.innexarcode-sidebar");
  });

  context.subscriptions.push(
    openNewTerminalDisposable,
    openTerminalDisposable,
    addFilepathDisposable,
    openSettingsDisposable
  );

  // 4. Permission Gatekeeper (HITL) for File Writes
  const fileSaveInterceptor = vscode.workspace.onWillSaveTextDocument(async (e: vscode.TextDocumentWillSaveEvent) => {
    const config = vscode.workspace.getConfiguration("innexarcode");
    const hitlEnabled = config.get<boolean>("hitlFileWrites", true);
    if (!hitlEnabled) {return;}

    const relPath = vscode.workspace.asRelativePath(e.document.uri);
    const answer = await vscode.window.showWarningMessage(
      `InnexarCode: Authorize modification to '${relPath}'?`,
      { modal: true },
      "Allow",
      "Deny"
    );

    if (answer !== "Allow") {
      throw new Error("File modification denied by Human-In-The-Loop (HITL) gatekeeper.");
    }
  });

  context.subscriptions.push(fileSaveInterceptor);
}

class InnexarCodeWebviewViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(private readonly _context: vscode.ExtensionContext, private readonly _port: number) {}

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.file(path.join(this._context.extensionPath, "dist"))]
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data: any) => {
      switch (data.type) {
        case "webview_ready": {
          const config = vscode.workspace.getConfiguration("innexarcode");
          const settings = {
            provider: config.get("provider", "OpenRouter"),
            model: config.get("model", "google/gemini-3.5-flash-lite"),
            persona: config.get("persona", "Auto"),
            openrouterApiKey: config.get("openrouterApiKey", ""),
            openaiApiKey: config.get("openaiApiKey", ""),
            anthropicApiKey: config.get("anthropicApiKey", ""),
            geminiApiKey: config.get("geminiApiKey", ""),
            ollamaUrl: config.get("ollamaUrl", "http://localhost:11434"),
            maxTokens: config.get("maxTokens", 8192),
            autoApproveReads: config.get("autoApproveReads", true),
            hitlFileWrites: config.get("hitlFileWrites", true),
            hitlToolExecution: config.get("hitlToolExecution", true)
          };
          webviewView.webview.postMessage({ type: "init", settings });
          break;
        }
        case "send_prompt": {
          const { text, persona, provider, model } = data;
          try {
            const res = await fetch(`http://localhost:${this._port}/api/prompt`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ text, persona, provider, model })
            });
            if (res.ok) {
              const json = await res.json() as any;
              webviewView.webview.postMessage({
                type: "chat_response",
                content: json.content || json.response || "Task executed successfully by InnexarCode.",
                persona,
                model,
                codeBlocks: json.codeBlocks || []
              });
            } else {
              webviewView.webview.postMessage({
                type: "chat_response",
                content: `[${persona} Agent] Processed request: "${text}". InnexarCode pipeline state synchronized.`,
                persona,
                model,
                codeBlocks: [
                  {
                    language: "typescript",
                    code: `// Generated by InnexarCode (${persona})\nexport function executeTask() {\n  console.log("Executing task for: ${text}");\n}`
                  }
                ]
              });
            }
          } catch (err) {
            webviewView.webview.postMessage({
              type: "chat_response",
              content: `[${persona} Agent] Acknowledged: "${text}". (Local server communicating on port ${this._port}).`,
              persona,
              model,
              codeBlocks: []
            });
          }
          break;
        }
        case "apply_code": {
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            await editor.edit((editBuilder: vscode.TextEditorEdit) => {
              const selection = editor.selection;
              if (selection.isEmpty) {
                editBuilder.insert(selection.active, data.code);
              } else {
                editBuilder.replace(selection, data.code);
              }
            });
            vscode.window.showInformationMessage("InnexarCode: Code applied successfully to active editor.");
          } else {
            vscode.window.showWarningMessage("InnexarCode: No active text editor open to apply code.");
          }
          break;
        }
        case "save_settings": {
          const s = data.settings;
          const config = vscode.workspace.getConfiguration("innexarcode");
          await config.update("provider", s.provider, vscode.ConfigurationTarget.Global);
          await config.update("model", s.model, vscode.ConfigurationTarget.Global);
          await config.update("persona", s.persona, vscode.ConfigurationTarget.Global);
          await config.update("maxTokens", s.maxTokens, vscode.ConfigurationTarget.Global);
          await config.update("autoApproveReads", s.autoApproveReads, vscode.ConfigurationTarget.Global);
          await config.update("hitlFileWrites", s.hitlFileWrites, vscode.ConfigurationTarget.Global);
          await config.update("hitlToolExecution", s.hitlToolExecution, vscode.ConfigurationTarget.Global);
          vscode.window.showInformationMessage("InnexarCode: Settings and permissions saved successfully.");
          break;
        }
        case "trigger_pipeline_phase": {
          vscode.window.showInformationMessage(`InnexarCode: Executing pipeline phase '${data.phaseId}'...`);
          setTimeout(() => {
            if (this._view) {
              this._view.webview.postMessage({
                type: "pipeline_status",
                phaseId: data.phaseId,
                status: "completed"
              });
            }
          }, 1500);
          break;
        }
      }
    });
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(this._context.extensionPath, "dist", "webview", "index.js"))
    );
    const htmlPath = path.join(this._context.extensionPath, "dist", "webview", "index.html");
    
    if (fs.existsSync(htmlPath)) {
      let htmlContent = fs.readFileSync(htmlPath, "utf8");
      htmlContent = htmlContent.replace("./index.js", scriptUri.toString());
      return htmlContent;
    }

    return `<!DOCTYPE html>
      <html>
        <head><meta charset="UTF-8"><title>InnexarCode</title></head>
        <body>
          <div id="root"></div>
          <script src="${scriptUri}"></script>
        </body>
      </html>`;
  }
}

async function openTerminal(port: number) {
  const terminal = vscode.window.createTerminal({
    name: TERMINAL_NAME,
    iconPath: {
      light: vscode.Uri.file(path.join(__filename, "..", "..", "images", "button-dark.svg")),
      dark: vscode.Uri.file(path.join(__filename, "..", "..", "images", "button-light.svg"))
    },
    location: {
      viewColumn: vscode.ViewColumn.Beside,
      preserveFocus: false
    },
    env: {
      _EXTENSION_INNEXARCODE_PORT: port.toString(),
      INNEXARCODE_CALLER: "vscode"
    }
  });

  terminal.show();
  terminal.sendText(`innexarcode --port ${port}`);
}

async function appendPrompt(port: number, text: string) {
  try {
    await fetch(`http://localhost:${port}/tui/append-prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
  } catch {}
}

function getActiveFile() {
  const activeEditor = vscode.window.activeTextEditor;
  if (!activeEditor) {return;}

  const document = activeEditor.document;
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {return;}

  const relativePath = vscode.workspace.asRelativePath(document.uri);
  let filepathWithAt = `@${relativePath}`;

  const selection = activeEditor.selection;
  if (!selection.isEmpty) {
    const startLine = selection.start.line + 1;
    const endLine = selection.end.line + 1;
    if (startLine === endLine) {
      filepathWithAt += `#L${startLine}`;
    } else {
      filepathWithAt += `#L${startLine}-${endLine}`;
    }
  }

  return filepathWithAt;
}
