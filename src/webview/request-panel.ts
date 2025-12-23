import * as vscode from "vscode";
import { RouteDefinition } from "../models/route";

export class RequestPanel {
  public static currentPanel: RequestPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private route: RouteDefinition,
    private baseUrl: string
  ) {
    this._panel = panel;
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.html = this._getHtmlContent();

    // Handle messages from webview
    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "sendRequest":
            await this.sendRequest(message.data);
            break;
        }
      },
      null,
      this._disposables
    );
  }

  public static show(route: RouteDefinition, baseUrl: string) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (RequestPanel.currentPanel) {
      RequestPanel.currentPanel._panel.reveal(column);
      RequestPanel.currentPanel.route = route;
      RequestPanel.currentPanel.baseUrl = baseUrl;
      RequestPanel.currentPanel._panel.webview.html =
        RequestPanel.currentPanel._getHtmlContent();
    } else {
      const panel = vscode.window.createWebviewPanel(
        "routifyRequest",
        `🚀 Test: ${route.method} ${route.path}`,
        column || vscode.ViewColumn.Beside,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
        }
      );

      RequestPanel.currentPanel = new RequestPanel(panel, route, baseUrl);
    }
  }

  private async sendRequest(data: {
    url: string;
    body: string;
    headers: { key: string; value: string }[];
    queryParams: { key: string; value: string }[];
  }) {
    const https = await import("https");
    const http = await import("http");
    const url = await import("url");

    // Use the URL from the webview (user can edit it)
    let fullUrl = data.url;

    // Add query params if they are not already in the URL
    if (data.queryParams.length > 0 && !fullUrl.includes('?')) {
      const params = new URLSearchParams();
      data.queryParams.forEach((p) => {
        if (p.key) {
          params.append(p.key, p.value);
        }
      });
      const queryString = params.toString();
      if (queryString) {
        fullUrl += `?${queryString}`;
      }
    }

    const parsedUrl = new url.URL(fullUrl);
    const isHttps = parsedUrl.protocol === "https:";
    const client = isHttps ? https : http;

    // Build headers
    const headers: Record<string, string> = {};

    // Add custom headers first
    data.headers.forEach((h) => {
      if (h.key && h.value) {
        headers[h.key] = h.value;
      }
    });

    // Add Content-Type if there's a body and it wasn't already set
    if (data.body && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }

    // Add Content-Length if there's a body
    if (data.body) {
      const bodyBuffer = Buffer.from(data.body, 'utf-8');
      headers["Content-Length"] = bodyBuffer.length.toString();
    }

    const options = {
      method: this.route.method,
      headers,
      timeout: 30000, // 30 second timeout
    };

    const startTime = Date.now();

    const req = client.request(fullUrl, options, (res) => {
      let responseData = "";

      res.on("data", (chunk) => {
        responseData += chunk;
      });

      res.on("end", () => {
        const duration = Date.now() - startTime;
        const statusCode = res.statusCode || 0;

        let formattedBody = responseData;
        try {
          const parsed = JSON.parse(responseData);
          formattedBody = JSON.stringify(parsed, null, 2);
        } catch (e) {
          // Not JSON, keep as is
        }

        // Send response back to webview
        this._panel.webview.postMessage({
          command: "response",
          data: {
            status: statusCode,
            statusText: res.statusMessage || `${statusCode}`,
            headers: res.headers,
            body: formattedBody || '(empty response)',
            duration,
            success: statusCode >= 200 && statusCode < 300,
          },
        });
      });

      res.on("error", (error) => {
        this._panel.webview.postMessage({
          command: "error",
          data: {
            message: `Response error: ${error.message}`,
          },
        });
      });
    });

    req.on("error", (error) => {
      this._panel.webview.postMessage({
        command: "error",
        data: {
          message: `Request error: ${error.message}. Make sure your server is running and the URL is correct.`,
        },
      });
    });

    req.on("timeout", () => {
      req.destroy();
      this._panel.webview.postMessage({
        command: "error",
        data: {
          message: "Request timeout - server took too long to respond (30s)",
        },
      });
    });

    if (data.body) {
      req.write(data.body);
    }

    req.end();
  }

  private _getHtmlContent(): string {
    const needsBody =
      this.route.method === "POST" ||
      this.route.method === "PUT" ||
      this.route.method === "PATCH";

    const fullUrl = `${this.baseUrl}${this.route.path}`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Test ${this.route.method} ${this.route.path}</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            color: var(--vscode-foreground);
            background: var(--vscode-sideBar-background);
            padding: 0;
            overflow-x: hidden;
        }

        .container {
            max-width: 1400px;
            margin: 0 auto;
        }

        .header {
            background: linear-gradient(135deg, var(--vscode-editor-background) 0%, var(--vscode-sideBar-background) 100%);
            border-bottom: 2px solid var(--vscode-panel-border);
            padding: 24px;
            position: sticky;
            top: 0;
            z-index: 100;
            backdrop-filter: blur(10px);
        }

        .header-content {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 16px;
        }

        .method {
            padding: 8px 16px;
            border-radius: 6px;
            font-weight: 700;
            font-size: 13px;
            letter-spacing: 0.5px;
            text-transform: uppercase;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
            transition: transform 0.2s;
        }

        .method:hover {
            transform: translateY(-1px);
        }

        .method.GET { background: linear-gradient(135deg, #61affe 0%, #4a9ce8 100%); color: white; }
        .method.POST { background: linear-gradient(135deg, #49cc90 0%, #3ab57a 100%); color: white; }
        .method.PUT { background: linear-gradient(135deg, #fca130 0%, #e88f1e 100%); color: white; }
        .method.DELETE { background: linear-gradient(135deg, #f93e3e 0%, #e02a2a 100%); color: white; }
        .method.PATCH { background: linear-gradient(135deg, #50e3c2 0%, #3dc9ac 100%); color: white; }

        .url-container {
            flex: 1;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border);
            border-radius: 8px;
            padding: 12px 16px;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: border-color 0.2s;
        }

        .url-container:hover {
            border-color: var(--vscode-focusBorder);
        }

        .url-icon {
            color: var(--vscode-descriptionForeground);
            font-size: 16px;
        }

        .url {
            flex: 1;
            font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Courier New', monospace;
            font-size: 13px;
            color: var(--vscode-textLink-foreground);
            font-weight: 500;
        }

        .url-input {
            flex: 1;
            font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Courier New', monospace;
            font-size: 13px;
            color: var(--vscode-input-foreground);
            background: transparent;
            border: none;
            outline: none;
            font-weight: 500;
            padding: 0;
        }

        .url-input:focus {
            color: var(--vscode-textLink-foreground);
        }

        .send-btn {
            background: linear-gradient(135deg, var(--vscode-button-background) 0%, var(--vscode-button-hoverBackground) 100%);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 12px 32px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            transition: all 0.2s;
        }

        .send-btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3);
        }

        .send-btn:active {
            transform: translateY(0);
        }

        .tabs {
            display: flex;
            gap: 4px;
            padding: 0 24px;
            background: var(--vscode-editor-background);
        }

        .tab {
            padding: 12px 20px;
            background: transparent;
            border: none;
            color: var(--vscode-descriptionForeground);
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            border-bottom: 2px solid transparent;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .tab:hover {
            color: var(--vscode-foreground);
            background: var(--vscode-list-hoverBackground);
        }

        .tab.active {
            color: var(--vscode-textLink-foreground);
            border-bottom-color: var(--vscode-textLink-foreground);
        }

        .content {
            padding: 24px;
        }

        .section {
            margin-bottom: 24px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            transition: box-shadow 0.2s;
        }

        .section:hover {
            box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
        }

        .section-header {
            padding: 16px 20px;
            background: var(--vscode-sideBarSectionHeader-background);
            font-weight: 600;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 10px;
            color: var(--vscode-sideBarSectionHeader-foreground);
            letter-spacing: 0.3px;
        }

        .section-content {
            padding: 20px;
        }

        .param-row {
            display: grid;
            grid-template-columns: 1fr 1fr 48px;
            gap: 12px;
            margin-bottom: 12px;
            align-items: center;
        }

        input, textarea {
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            padding: 10px 14px;
            border-radius: 6px;
            font-family: inherit;
            font-size: 13px;
            transition: all 0.2s;
        }

        input:focus, textarea:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
            box-shadow: 0 0 0 3px rgba(14, 99, 156, 0.1);
        }

        input::placeholder, textarea::placeholder {
            color: var(--vscode-input-placeholderForeground);
        }

        textarea {
            width: 100%;
            min-height: 250px;
            font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Courier New', monospace;
            resize: vertical;
            line-height: 1.6;
        }

        #body {
            width: 100%;
        }

        .add-btn {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            border: 1px dashed var(--vscode-panel-border);
            padding: 10px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            margin-top: 8px;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
        }

        .add-btn:hover {
            background: var(--vscode-button-secondaryHoverBackground);
            border-style: solid;
        }

        .remove-btn {
            background: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            color: var(--vscode-errorForeground);
            cursor: pointer;
            font-size: 18px;
            width: 36px;
            height: 36px;
            border-radius: 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s;
        }

        .remove-btn:hover {
            background: var(--vscode-errorForeground);
            color: white;
            transform: rotate(90deg);
        }

        .response {
            margin-top: 24px;
        }

        .response-header {
            padding: 20px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 12px 12px 0 0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }

        .response-status {
            display: flex;
            gap: 20px;
            align-items: center;
        }

        .status-badge {
            padding: 6px 14px;
            border-radius: 20px;
            font-weight: 700;
            font-size: 12px;
            letter-spacing: 0.5px;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }

        .status-badge.success {
            background: linear-gradient(135deg, #49cc90 0%, #3ab57a 100%);
            color: white;
        }

        .status-badge.error {
            background: linear-gradient(135deg, #f93e3e 0%, #e02a2a 100%);
            color: white;
        }

        .response-body {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-top: none;
            border-radius: 0 0 12px 12px;
            padding: 20px;
            max-height: 600px;
            overflow: auto;
        }

        pre {
            margin: 0;
            font-family: 'SF Mono', 'Monaco', 'Cascadia Code', 'Courier New', monospace;
            font-size: 12px;
            line-height: 1.6;
            white-space: pre-wrap;
            word-wrap: break-word;
            color: var(--vscode-editor-foreground);
        }

        .hidden {
            display: none;
        }

        .loading {
            text-align: center;
            padding: 40px 20px;
        }

        .loading-spinner {
            width: 48px;
            height: 48px;
            border: 4px solid var(--vscode-panel-border);
            border-top-color: var(--vscode-button-background);
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 16px;
        }

        @keyframes spin {
            to { transform: rotate(360deg); }
        }

        .loading-text {
            color: var(--vscode-descriptionForeground);
            font-size: 14px;
            font-weight: 500;
        }

        .error-message {
            padding: 16px 20px;
            background: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            border-radius: 8px;
            color: var(--vscode-errorForeground);
            display: none;
            align-items: center;
            gap: 12px;
            font-size: 13px;
        }

        .error-message:not(.hidden) {
            display: flex;
        }

        .error-icon {
            font-size: 20px;
            flex-shrink: 0;
        }

        .tab-content {
            display: none;
        }

        .tab-content.active {
            display: block;
        }

        ::-webkit-scrollbar {
            width: 12px;
            height: 12px;
        }

        ::-webkit-scrollbar-track {
            background: var(--vscode-editor-background);
        }

        ::-webkit-scrollbar-thumb {
            background: var(--vscode-scrollbarSlider-background);
            border-radius: 6px;
        }

        ::-webkit-scrollbar-thumb:hover {
            background: var(--vscode-scrollbarSlider-hoverBackground);
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="header-content">
                <span class="method ${this.route.method}">${this.route.method}</span>
                <div class="url-container">
                    <span class="url-icon">🔗</span>
                    <input type="text" id="url-input" class="url-input" value="${fullUrl}">
                </div>
                <button class="send-btn" onclick="sendRequest()">
                    <span>▶</span>
                    <span>Send Request</span>
                </button>
            </div>
        </div>

        <div class="tabs">
            ${
              needsBody
                ? `<button class="tab active" onclick="switchTab('body')">
                <span>📄</span>
                <span>Body</span>
            </button>`
                : ""
            }
            <button class="tab ${!needsBody ? 'active' : ''}" onclick="switchTab('headers')">
                <span>🔑</span>
                <span>Headers</span>
            </button>
            <button class="tab" onclick="switchTab('params')">
                <span>🔍</span>
                <span>Query Params</span>
            </button>
        </div>

        <div class="content">
            ${
              needsBody
                ? `
            <div class="tab-content active" id="tab-body">
                <div class="section">
                    <div class="section-header">
                        <span>📝</span>
                        <span>Request Body</span>
                    </div>
                    <div class="section-content">
                        <textarea id="body" placeholder='{\n  "key": "value"\n}'></textarea>
                    </div>
                </div>
            </div>
            `
                : ""
            }

            <div class="tab-content ${!needsBody ? 'active' : ''}" id="tab-headers">
                <div class="section">
                    <div class="section-header">
                        <span>🔐</span>
                        <span>Request Headers</span>
                    </div>
                    <div class="section-content">
                        <div id="headers-container">
                            <div class="param-row">
                                <input type="text" placeholder="Header name (e.g., Authorization)" class="header-key">
                                <input type="text" placeholder="Header value" class="header-value">
                                <button class="remove-btn" onclick="this.parentElement.remove()">✕</button>
                            </div>
                        </div>
                        <button class="add-btn" onclick="addHeader()">
                            <span>+</span>
                            <span>Add Header</span>
                        </button>
                    </div>
                </div>
            </div>

            <div class="tab-content" id="tab-params">
                <div class="section">
                    <div class="section-header">
                        <span>🎯</span>
                        <span>Query Parameters</span>
                    </div>
                    <div class="section-content">
                        <div id="params-container">
                            <div class="param-row">
                                <input type="text" placeholder="Parameter name (e.g., page)" class="param-key">
                                <input type="text" placeholder="Parameter value" class="param-value">
                                <button class="remove-btn" onclick="this.parentElement.remove()">✕</button>
                            </div>
                        </div>
                        <button class="add-btn" onclick="addParam()">
                            <span>+</span>
                            <span>Add Parameter</span>
                        </button>
                    </div>
                </div>
            </div>

            <div id="loading" class="loading hidden">
                <div class="loading-spinner"></div>
                <p class="loading-text">Sending request...</p>
            </div>

            <div id="error" class="error-message hidden">
                <span class="error-icon">⚠️</span>
                <span id="error-text"></span>
            </div>

            <div id="response-section" class="response hidden">
                <div class="response-header">
                    <div class="response-status">
                        <span class="status-badge" id="status-badge"></span>
                        <span id="status-text"></span>
                        <span id="duration"></span>
                    </div>
                </div>
                <div class="response-body">
                    <pre id="response-body"></pre>
                </div>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();

        function switchTab(tabName) {
            // Remove active class from all tabs and contents
            document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

            // Add active class to clicked tab
            event.target.closest('.tab').classList.add('active');

            // Show corresponding content
            const content = document.getElementById('tab-' + tabName);
            if (content) {
                content.classList.add('active');
            }
        }

        function addHeader() {
            const container = document.getElementById('headers-container');
            const row = document.createElement('div');
            row.className = 'param-row';
            row.innerHTML = \`
                <input type="text" placeholder="Header name (e.g., Authorization)" class="header-key">
                <input type="text" placeholder="Header value" class="header-value">
                <button class="remove-btn" onclick="this.parentElement.remove()">✕</button>
            \`;
            container.appendChild(row);
        }

        function addParam() {
            const container = document.getElementById('params-container');
            const row = document.createElement('div');
            row.className = 'param-row';
            row.innerHTML = \`
                <input type="text" placeholder="Parameter name (e.g., page)" class="param-key">
                <input type="text" placeholder="Parameter value" class="param-value">
                <button class="remove-btn" onclick="this.parentElement.remove()">✕</button>
            \`;
            container.appendChild(row);
        }

        function sendRequest() {
            const urlInput = document.getElementById('url-input');
            const url = urlInput ? urlInput.value : '';
            const bodyEl = document.getElementById('body');
            const body = bodyEl ? bodyEl.value : '';

            const headers = Array.from(document.querySelectorAll('.header-key')).map((el, i) => ({
                key: el.value,
                value: document.querySelectorAll('.header-value')[i].value
            }));

            const queryParams = Array.from(document.querySelectorAll('.param-key')).map((el, i) => ({
                key: el.value,
                value: document.querySelectorAll('.param-value')[i].value
            }));

            document.getElementById('loading').classList.remove('hidden');
            document.getElementById('response-section').classList.add('hidden');
            document.getElementById('error').classList.add('hidden');

            vscode.postMessage({
                command: 'sendRequest',
                data: { url, body, headers, queryParams }
            });
        }

        window.addEventListener('message', event => {
            const message = event.data;

            document.getElementById('loading').classList.add('hidden');

            if (message.command === 'response') {
                const data = message.data;
                const responseSection = document.getElementById('response-section');
                const statusBadge = document.getElementById('status-badge');
                const statusText = document.getElementById('status-text');
                const duration = document.getElementById('duration');
                const responseBody = document.getElementById('response-body');

                statusBadge.textContent = data.status;
                statusBadge.className = 'status-badge ' + (data.success ? 'success' : 'error');
                statusText.textContent = data.statusText;
                duration.textContent = \`⏱ \${data.duration}ms\`;
                responseBody.textContent = data.body;

                responseSection.classList.remove('hidden');
            } else if (message.command === 'error') {
                const errorEl = document.getElementById('error');
                const errorText = document.getElementById('error-text');
                errorText.textContent = message.data.message;
                errorEl.classList.remove('hidden');
            }
        });
    </script>
</body>
</html>`;
  }

  public dispose() {
    RequestPanel.currentPanel = undefined;
    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
