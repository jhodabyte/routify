import * as vscode from "vscode";
import { RouteTreeProvider } from "./providers/route-tree-provider";
import { RouteCodeLensProvider } from "./providers/route-codelens-provider";
import { RequestPanel } from "./webview/request-panel";
import { WorkspaceScanner } from "./services/workspace-scanner";
import { RouteDefinition, HttpMethod } from "./models/route";

let treeProvider: RouteTreeProvider;
let codeLensProvider: RouteCodeLensProvider;
let scanner: WorkspaceScanner;
let fileWatcher: vscode.FileSystemWatcher | undefined;
let outputChannel: vscode.OutputChannel;
let statusBarItem: vscode.StatusBarItem;
let isScanning = false;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel("Routify");
  log("Routify extension is now active");

  // Initialize status bar item
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.command = "routify.showStats";
  statusBarItem.tooltip = "Click to view route statistics";
  context.subscriptions.push(statusBarItem);

  // Initialize providers
  treeProvider = new RouteTreeProvider();
  codeLensProvider = new RouteCodeLensProvider();
  scanner = new WorkspaceScanner();

  // Register tree view
  const treeView = vscode.window.createTreeView("routifyView", {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });

  context.subscriptions.push(treeView);

  // Register CodeLens provider for JS/TS files
  const codeLensDisposable = vscode.languages.registerCodeLensProvider(
    [
      { language: "javascript", scheme: "file" },
      { language: "typescript", scheme: "file" },
    ],
    codeLensProvider
  );
  context.subscriptions.push(codeLensDisposable);

  // Register commands
  registerCommands(context);

  // Initial scan
  scanWorkspace();

  // Setup file watcher
  setupFileWatcher(context);

  // Setup active editor listener
  setupActiveEditorListener(context);

  log("Routify is ready to scan routes");
}

function registerCommands(context: vscode.ExtensionContext) {
  // Refresh command
  context.subscriptions.push(
    vscode.commands.registerCommand("routify.refresh", async () => {
      log("Refreshing routes...");
      await scanWorkspace();
      vscode.window.showInformationMessage("Routes refreshed");
    })
  );

  // Navigate to route
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "routify.navigateToRoute",
      async (route: RouteDefinition) => {
        try {
          const uri = vscode.Uri.file(route.filePath);
          const document = await vscode.workspace.openTextDocument(uri);
          const editor = await vscode.window.showTextDocument(document);

          // Navigate to the line
          const position = new vscode.Position(
            Math.max(0, route.line - 1),
            route.column
          );
          const range = new vscode.Range(position, position);

          editor.selection = new vscode.Selection(position, position);
          editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

          // Highlight the line
          const decorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: new vscode.ThemeColor(
              "editor.findMatchHighlightBackground"
            ),
            isWholeLine: true,
          });

          editor.setDecorations(decorationType, [range]);

          // Remove highlight after 2 seconds
          setTimeout(() => {
            decorationType.dispose();
          }, 2000);

          log(
            `Navigated to route: ${route.method} ${route.path} at ${route.filePath}:${route.line}`
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Failed to navigate to route: ${error}`
          );
          log(`Error navigating to route: ${error}`);
        }
      }
    )
  );

  // Group by file
  context.subscriptions.push(
    vscode.commands.registerCommand("routify.groupByFile", () => {
      treeProvider.setGroupMode("file");
      vscode.window.showInformationMessage("Grouped by file");
      log("Grouping mode changed to: file");
    })
  );

  // Group by method
  context.subscriptions.push(
    vscode.commands.registerCommand("routify.groupByMethod", () => {
      treeProvider.setGroupMode("method");
      vscode.window.showInformationMessage("Grouped by HTTP method");
      log("Grouping mode changed to: method");
    })
  );

  // Group by path
  context.subscriptions.push(
    vscode.commands.registerCommand("routify.groupByPath", () => {
      treeProvider.setGroupMode("path");
      vscode.window.showInformationMessage("Grouped by path");
      log("Grouping mode changed to: path");
    })
  );

  // Filter by method
  context.subscriptions.push(
    vscode.commands.registerCommand("routify.filterByMethod", async () => {
      const methods: HttpMethod[] = [
        "GET",
        "POST",
        "PUT",
        "DELETE",
        "PATCH",
        "OPTIONS",
        "HEAD",
      ];

      const items = [
        { label: "Show All", method: undefined },
        ...methods.map((m) => ({ label: m, method: m })),
      ];

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: "Select HTTP method to filter",
      });

      if (selected) {
        if (selected.method) {
          treeProvider.setFilter(selected.method);
          vscode.window.showInformationMessage(`Filtering by ${selected.method}`);
          log(`Filtering by method: ${selected.method}`);
        } else {
          treeProvider.clearFilter();
          vscode.window.showInformationMessage("Filter cleared");
          log("Filter cleared");
        }
      }
    })
  );

  // Search routes
  context.subscriptions.push(
    vscode.commands.registerCommand("routify.searchRoutes", async () => {
      const routes = await scanner.scanWorkspace();

      if (routes.length === 0) {
        vscode.window.showInformationMessage("No routes found in workspace");
        return;
      }

      const items = routes.map((route) => ({
        label: `${route.method} ${route.path}`,
        description: route.handler,
        detail: route.filePath,
        route: route,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: "Search for a route...",
        matchOnDescription: true,
        matchOnDetail: true,
      });

      if (selected) {
        vscode.commands.executeCommand(
          "routify.navigateToRoute",
          selected.route
        );
      }
    })
  );

  // Show statistics
  context.subscriptions.push(
    vscode.commands.registerCommand("routify.showStats", async () => {
      const routes = await scanner.scanWorkspace();

      if (routes.length === 0) {
        vscode.window.showInformationMessage("No routes found in workspace");
        return;
      }

      const stats = {
        total: routes.length,
        byMethod: {} as Record<string, number>,
        byFramework: {} as Record<string, number>,
        files: new Set(routes.map((r) => r.filePath)).size,
      };

      routes.forEach((route) => {
        stats.byMethod[route.method] = (stats.byMethod[route.method] || 0) + 1;
        stats.byFramework[route.framework] =
          (stats.byFramework[route.framework] || 0) + 1;
      });

      const methodStats = Object.entries(stats.byMethod)
        .sort(([, a], [, b]) => b - a)
        .map(([method, count]) => `  ${method}: ${count}`)
        .join("\n");

      const frameworkStats = Object.entries(stats.byFramework)
        .map(([framework, count]) => `  ${framework}: ${count}`)
        .join("\n");

      const message = `
Route Statistics

Total Routes: ${stats.total}
Files: ${stats.files}

By Method:
${methodStats}

By Framework:
${frameworkStats}
      `.trim();

      vscode.window.showInformationMessage(message, { modal: true });
      log("Statistics displayed");
    })
  );

  // Copy path
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "routify.copyPath",
      async (node: any) => {
        if (node?.route?.path) {
          await vscode.env.clipboard.writeText(node.route.path);
          vscode.window.showInformationMessage(
            `Copied path: ${node.route.path}`
          );
          log(`Copied path: ${node.route.path}`);
        }
      }
    )
  );

  // Copy URL
  context.subscriptions.push(
    vscode.commands.registerCommand("routify.copyUrl", async (node: any) => {
      if (node?.route) {
        const config = vscode.workspace.getConfiguration("routify");
        const baseUrl = config.get<string>("baseUrl", "http://localhost:3000");
        const fullUrl = `${baseUrl}${node.route.path}`;

        await vscode.env.clipboard.writeText(fullUrl);
        vscode.window.showInformationMessage(`Copied URL: ${fullUrl}`);
        log(`Copied URL: ${fullUrl}`);
      }
    })
  );

  // Clear cache
  context.subscriptions.push(
    vscode.commands.registerCommand("routify.clearCache", async () => {
      log("Clearing cache...");
      await scanWorkspace();
      vscode.window.showInformationMessage("Cache cleared and routes refreshed");
    })
  );

  // Export routes to JSON
  context.subscriptions.push(
    vscode.commands.registerCommand("routify.exportToJson", async () => {
      const routes = await scanner.scanWorkspace();

      if (routes.length === 0) {
        vscode.window.showWarningMessage("No routes found to export");
        return;
      }

      const exportData = {
        generatedAt: new Date().toISOString(),
        totalRoutes: routes.length,
        routes: routes.map((r) => ({
          method: r.method,
          path: r.path,
          handler: r.handler,
          file: r.filePath,
          line: r.line,
          framework: r.framework,
          middleware: r.middleware || [],
          params: r.params || [],
        })),
      };

      const jsonContent = JSON.stringify(exportData, null, 2);

      const doc = await vscode.workspace.openTextDocument({
        content: jsonContent,
        language: "json",
      });

      await vscode.window.showTextDocument(doc);
      vscode.window.showInformationMessage(
        `Exported ${routes.length} routes to JSON`
      );
      log(`Exported ${routes.length} routes to JSON`);
    })
  );

  // Show routes in current file
  context.subscriptions.push(
    vscode.commands.registerCommand("routify.showRoutesInCurrentFile", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("No active editor");
        return;
      }

      const currentFile = editor.document.uri.fsPath;
      const allRoutes = await scanner.scanWorkspace();
      const fileRoutes = allRoutes.filter((r) => r.filePath === currentFile);

      if (fileRoutes.length === 0) {
        vscode.window.showInformationMessage(
          "No routes found in current file"
        );
        return;
      }

      const items = fileRoutes.map((route) => ({
        label: `${route.method} ${route.path}`,
        description: route.handler,
        detail: `Line ${route.line}`,
        route: route,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: `${fileRoutes.length} route(s) in current file`,
      });

      if (selected) {
        vscode.commands.executeCommand(
          "routify.navigateToRoute",
          selected.route
        );
      }
    })
  );

  // Generate route documentation
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "routify.generateDocumentation",
      async () => {
        const routes = await scanner.scanWorkspace();

        if (routes.length === 0) {
          vscode.window.showWarningMessage("No routes found");
          return;
        }

        // Group by path base
        const grouped = new Map<string, RouteDefinition[]>();
        routes.forEach((route) => {
          const basePath = route.path.split("/")[1] || "root";
          if (!grouped.has(basePath)) {
            grouped.set(basePath, []);
          }
          grouped.get(basePath)!.push(route);
        });

        let markdown = `# API Routes Documentation\n\n`;
        markdown += `Generated on: ${new Date().toLocaleString()}\n\n`;
        markdown += `Total Routes: ${routes.length}\n\n`;

        markdown += `## Table of Contents\n\n`;
        for (const [basePath] of grouped) {
          markdown += `- [/${basePath}](#${basePath})\n`;
        }
        markdown += `\n---\n\n`;

        for (const [basePath, pathRoutes] of grouped) {
          markdown += `## /${basePath}\n\n`;

          for (const route of pathRoutes) {
            markdown += `### \`${route.method}\` ${route.path}\n\n`;
            markdown += `- **Handler**: \`${route.handler}\`\n`;
            markdown += `- **File**: \`${route.filePath}:${route.line}\`\n`;

            if (route.middleware && route.middleware.length > 0) {
              markdown += `- **Middleware**: ${route.middleware.map((m) => `\`${m}\``).join(", ")}\n`;
            }

            if (route.params && route.params.length > 0) {
              markdown += `- **Parameters**:\n`;
              for (const param of route.params) {
                markdown += `  - \`${param.name}\` (${param.type})\n`;
              }
            }

            markdown += `\n`;
          }
        }

        const doc = await vscode.workspace.openTextDocument({
          content: markdown,
          language: "markdown",
        });

        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage("Documentation generated");
        log("Documentation generated");
      }
    )
  );

  // Test route - Make HTTP request
  context.subscriptions.push(
    vscode.commands.registerCommand("routify.testRoute", async (node: any) => {
      if (!node?.route) {
        return;
      }

      const route = node.route as RouteDefinition;
      const config = vscode.workspace.getConfiguration("routify");
      const baseUrl = config.get<string>("baseUrl", "http://localhost:3000");
      const fullUrl = `${baseUrl}${route.path}`;

      // Show quick pick for request configuration
      const bodyInput =
        route.method === "POST" ||
        route.method === "PUT" ||
        route.method === "PATCH"
          ? await vscode.window.showInputBox({
              prompt: "Request body (JSON)",
              placeHolder: '{"key": "value"}',
              value: "{}",
            })
          : undefined;

      try {
        const https = await import("https");
        const http = await import("http");
        const url = await import("url");

        const parsedUrl = new url.URL(fullUrl);
        const isHttps = parsedUrl.protocol === "https:";
        const client = isHttps ? https : http;

        const options = {
          method: route.method,
          headers: {
            "Content-Type": "application/json",
          },
        };

        vscode.window.showInformationMessage(
          `Testing ${route.method} ${fullUrl}...`
        );

        const req = client.request(fullUrl, options, (res) => {
          let data = "";

          res.on("data", (chunk) => {
            data += chunk;
          });

          res.on("end", async () => {
            const statusCode = res.statusCode || 0;
            const statusText =
              statusCode >= 200 && statusCode < 300 ? "SUCCESS" : "ERROR";

            let responseBody = data;
            try {
              const parsed = JSON.parse(data);
              responseBody = JSON.stringify(parsed, null, 2);
            } catch (e) {
              // Not JSON, use as is
            }

            const output = `
${route.method} ${fullUrl}
Status: ${statusCode} ${res.statusMessage}
${statusText}

Headers:
${JSON.stringify(res.headers, null, 2)}

Body:
${responseBody}
            `.trim();

            const doc = await vscode.workspace.openTextDocument({
              content: output,
              language: "http",
            });

            await vscode.window.showTextDocument(doc, {
              viewColumn: vscode.ViewColumn.Beside,
            });

            if (statusCode >= 200 && statusCode < 300) {
              vscode.window.showInformationMessage(
                `✅ ${route.method} ${route.path} - ${statusCode}`
              );
            } else {
              vscode.window.showWarningMessage(
                `⚠️ ${route.method} ${route.path} - ${statusCode}`
              );
            }

            log(`HTTP ${route.method} ${fullUrl} - ${statusCode}`);
          });
        });

        req.on("error", (error) => {
          vscode.window.showErrorMessage(
            `Request failed: ${error.message}`
          );
          log(`HTTP request error: ${error.message}`);
        });

        if (bodyInput) {
          req.write(bodyInput);
        }

        req.end();
      } catch (error) {
        vscode.window.showErrorMessage(`Error making request: ${error}`);
        log(`Error making HTTP request: ${error}`);
      }
    })
  );

  // Copy as cURL
  context.subscriptions.push(
    vscode.commands.registerCommand("routify.copyCurl", async (node: any) => {
      if (!node?.route) {
        return;
      }

      const route = node.route as RouteDefinition;
      const config = vscode.workspace.getConfiguration("routify");
      const baseUrl = config.get<string>("baseUrl", "http://localhost:3000");
      const fullUrl = `${baseUrl}${route.path}`;

      let curl = `curl -X ${route.method} "${fullUrl}"`;

      if (
        route.method === "POST" ||
        route.method === "PUT" ||
        route.method === "PATCH"
      ) {
        curl += ` \\\n  -H "Content-Type: application/json" \\\n  -d '{}'`;
      }

      await vscode.env.clipboard.writeText(curl);
      vscode.window.showInformationMessage(`Copied cURL command for ${route.path}`);
      log(`Copied cURL: ${curl}`);
    })
  );

  // Open in REST Client
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "routify.openInRestClient",
      async (node: any) => {
        if (!node?.route) {
          return;
        }

        const route = node.route as RouteDefinition;
        const config = vscode.workspace.getConfiguration("routify");
        const baseUrl = config.get<string>("baseUrl", "http://localhost:3000");
        const fullUrl = `${baseUrl}${route.path}`;

        let httpContent = `### ${route.path}\n`;
        httpContent += `${route.method} ${fullUrl}\n`;

        if (
          route.method === "POST" ||
          route.method === "PUT" ||
          route.method === "PATCH"
        ) {
          httpContent += `Content-Type: application/json\n\n`;
          httpContent += `{\n  \n}\n`;
        }

        const doc = await vscode.workspace.openTextDocument({
          content: httpContent,
          language: "http",
        });

        await vscode.window.showTextDocument(doc);
        vscode.window.showInformationMessage(
          `Opened ${route.path} in HTTP file`
        );
        log(`Opened in REST Client: ${route.path}`);
      }
    )
  );

  // Test route with panel (CodeLens command)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "routify.testRouteWithPanel",
      async (route: RouteDefinition) => {
        const config = vscode.workspace.getConfiguration("routify");
        const baseUrl = config.get<string>("baseUrl", "http://localhost:3000");

        RequestPanel.show(route, baseUrl);
        log(`Opened test panel for ${route.method} ${route.path}`);
      }
    )
  );

  // Quick test route (CodeLens command)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "routify.quickTestRoute",
      async (route: RouteDefinition) => {
        const config = vscode.workspace.getConfiguration("routify");
        const baseUrl = config.get<string>("baseUrl", "http://localhost:3000");
        const fullUrl = `${baseUrl}${route.path}`;

        try {
          const https = await import("https");
          const http = await import("http");
          const url = await import("url");

          const parsedUrl = new url.URL(fullUrl);
          const isHttps = parsedUrl.protocol === "https:";
          const client = isHttps ? https : http;

          const options = {
            method: route.method,
            headers: {
              "Content-Type": "application/json",
            },
          };

          vscode.window.showInformationMessage(
            `⚡ Testing ${route.method} ${route.path}...`
          );

          const req = client.request(fullUrl, options, (res) => {
            const statusCode = res.statusCode || 0;

            if (statusCode >= 200 && statusCode < 300) {
              vscode.window.showInformationMessage(
                `✅ ${route.method} ${route.path} - ${statusCode}`
              );
            } else {
              vscode.window.showWarningMessage(
                `⚠️ ${route.method} ${route.path} - ${statusCode}`
              );
            }

            log(`Quick test: ${route.method} ${fullUrl} - ${statusCode}`);
          });

          req.on("error", (error) => {
            vscode.window.showErrorMessage(`Request failed: ${error.message}`);
            log(`Quick test error: ${error.message}`);
          });

          req.end();
        } catch (error) {
          vscode.window.showErrorMessage(`Error: ${error}`);
          log(`Quick test error: ${error}`);
        }
      }
    )
  );
}

function setupFileWatcher(context: vscode.ExtensionContext) {
  const config = vscode.workspace.getConfiguration("routify");
  const autoRefresh = config.get<boolean>("autoRefresh", true);

  if (!autoRefresh) {
    log("Auto-refresh is disabled");
    return;
  }

  // Watch for file changes
  fileWatcher = vscode.workspace.createFileSystemWatcher(
    "**/*.{js,ts}",
    false,
    false,
    false
  );

  // Debounce to avoid too many scans
  let debounceTimer: NodeJS.Timeout | undefined;
  const debouncedScan = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      scanWorkspace();
    }, 500);
  };

  fileWatcher.onDidChange((uri) => {
    log(`File changed: ${uri.fsPath}`);
    debouncedScan();
  });

  fileWatcher.onDidCreate((uri) => {
    log(`File created: ${uri.fsPath}`);
    debouncedScan();
  });

  fileWatcher.onDidDelete((uri) => {
    log(`File deleted: ${uri.fsPath}`);
    debouncedScan();
  });

  context.subscriptions.push(fileWatcher);

  // Also watch for workspace folder changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      log("Workspace folders changed");
      await scanWorkspace();
    })
  );

  // Watch for configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("routify")) {
        log("Configuration changed");
        await scanWorkspace();
      }
    })
  );

  log("File watcher configured");
}

function setupActiveEditorListener(context: vscode.ExtensionContext) {
  // Optional: Highlight routes in the current file
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        log(`Active editor changed: ${editor.document.fileName}`);
      }
    })
  );
}

async function scanWorkspace() {
  // Prevent concurrent scans
  if (isScanning) {
    log("Scan already in progress, skipping...");
    return;
  }

  isScanning = true;
  const startTime = Date.now();

  try {
    log("Scanning workspace for routes...");
    statusBarItem.text = "$(sync~spin) Scanning routes...";
    statusBarItem.show();

    const routes = await scanner.scanWorkspace();
    treeProvider.setRoutes(routes);
    codeLensProvider.setRoutes(routes);

    const duration = Date.now() - startTime;
    const statusText = routes.length === 0
      ? "$(warning) No routes found"
      : `$(pulse) ${routes.length} route${routes.length !== 1 ? "s" : ""}`;

    statusBarItem.text = statusText;
    statusBarItem.show();

    log(`Found ${routes.length} routes in ${duration}ms`);

    // Log summary by method
    if (routes.length > 0) {
      const methodCounts = routes.reduce((acc, r) => {
        acc[r.method] = (acc[r.method] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      log(
        `Route breakdown: ${Object.entries(methodCounts)
          .map(([m, c]) => `${m}:${c}`)
          .join(", ")}`
      );
    }
  } catch (error) {
    log(`Error scanning workspace: ${error}`);
    vscode.window.showErrorMessage(
      `Routify: Error scanning workspace - ${error}`
    );
    statusBarItem.text = "$(error) Scan failed";
    statusBarItem.show();
  } finally {
    isScanning = false;
  }
}

function log(message: string) {
  const config = vscode.workspace.getConfiguration("routify");
  const debugMode = config.get<boolean>("debugMode", false);

  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;

  if (debugMode) {
    outputChannel.appendLine(logMessage);
  }

}

export function deactivate() {
  log("Deactivating Routify extension...");

  if (fileWatcher) {
    fileWatcher.dispose();
  }
  if (outputChannel) {
    outputChannel.dispose();
  }
  if (statusBarItem) {
    statusBarItem.dispose();
  }

  log("Routify extension deactivated");
}
