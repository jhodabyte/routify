import * as vscode from "vscode";
import { RouteDefinition } from "../models/route";

export class RouteCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  private routes: Map<string, RouteDefinition[]> = new Map();

  constructor() {}

  setRoutes(routes: RouteDefinition[]) {
    this.routes.clear();

    // Group routes by file
    routes.forEach((route) => {
      const fileRoutes = this.routes.get(route.filePath) || [];
      fileRoutes.push(route);
      this.routes.set(route.filePath, fileRoutes);
    });

    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken
  ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
    const filePath = document.uri.fsPath;
    const fileRoutes = this.routes.get(filePath);

    if (!fileRoutes || fileRoutes.length === 0) {
      return [];
    }

    const codeLenses: vscode.CodeLens[] = [];

    fileRoutes.forEach((route) => {
      const line = Math.max(0, route.line - 1);
      const range = new vscode.Range(line, 0, line, 0);

      // Test button
      const testLens = new vscode.CodeLens(range, {
        title: `▶ Test ${route.method}`,
        tooltip: `Test ${route.method} ${route.path}`,
        command: "routify.testRouteWithPanel",
        arguments: [route],
      });

      // Quick test button (no config)
      const quickTestLens = new vscode.CodeLens(range, {
        title: "⚡ Quick Test",
        tooltip: "Send request immediately",
        command: "routify.quickTestRoute",
        arguments: [route],
      });

      // cURL button
      const curlLens = new vscode.CodeLens(range, {
        title: "📋 cURL",
        tooltip: "Copy as cURL command",
        command: "routify.copyCurl",
        arguments: [{ route }],
      });

      codeLenses.push(testLens, quickTestLens, curlLens);
    });

    return codeLenses;
  }

  refresh() {
    this._onDidChangeCodeLenses.fire();
  }
}
