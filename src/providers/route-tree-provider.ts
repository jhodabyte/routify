import * as vscode from "vscode";
import { RouteDefinition, HttpMethod } from "../models/route";
import * as path from "path";

type GroupMode = "file" | "method" | "path";

export class RouteTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    TreeNode | undefined | null
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private routes: RouteDefinition[] = [];
  private groupMode: GroupMode = "file";
  private filterMethod?: HttpMethod;

  constructor() {
    const config = vscode.workspace.getConfiguration("routify");
    this.groupMode = config.get<GroupMode>("defaultGrouping", "file");
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  setRoutes(routes: RouteDefinition[]): void {
    this.routes = routes;
    this.refresh();
  }

  setGroupMode(mode: GroupMode): void {
    this.groupMode = mode;
    this.refresh();
  }

  setFilter(method?: HttpMethod): void {
    this.filterMethod = method;
    this.refresh();
  }

  clearFilter(): void {
    this.filterMethod = undefined;
    this.refresh();
  }

  getTreeItem(element: TreeNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeNode): vscode.ProviderResult<TreeNode[]> {
    if (!element) {
      // Root level - return grouped nodes
      return this.getRootNodes();
    }

    if (element instanceof GroupNode) {
      return this.getRoutesForGroup(element);
    }

    return [];
  }

  getParent(element: TreeNode): vscode.ProviderResult<TreeNode> {
    return element.parent;
  }

  private getRootNodes(): TreeNode[] {
    const filteredRoutes = this.filterMethod
      ? this.routes.filter((r) => r.method === this.filterMethod)
      : this.routes;

    if (filteredRoutes.length === 0) {
      return [];
    }

    switch (this.groupMode) {
      case "file":
        return this.groupByFile(filteredRoutes);
      case "method":
        return this.groupByMethod(filteredRoutes);
      case "path":
        return this.groupByPath(filteredRoutes);
      default:
        return this.groupByFile(filteredRoutes);
    }
  }

  private groupByFile(routes: RouteDefinition[]): GroupNode[] {
    const groups = new Map<string, RouteDefinition[]>();

    for (const route of routes) {
      const fileName = path.basename(route.filePath);
      if (!groups.has(fileName)) {
        groups.set(fileName, []);
      }
      groups.get(fileName)!.push(route);
    }

    return Array.from(groups.entries()).map(([fileName, routes]) => {
      const node = new GroupNode(
        fileName,
        routes,
        vscode.TreeItemCollapsibleState.Expanded
      );
      node.description = `${routes.length} route${routes.length > 1 ? "s" : ""}`;
      node.tooltip = routes[0].filePath;
      node.iconPath = new vscode.ThemeIcon("file");
      return node;
    });
  }

  private groupByMethod(routes: RouteDefinition[]): GroupNode[] {
    const groups = new Map<HttpMethod, RouteDefinition[]>();

    for (const route of routes) {
      if (!groups.has(route.method)) {
        groups.set(route.method, []);
      }
      groups.get(route.method)!.push(route);
    }

    return Array.from(groups.entries()).map(([method, routes]) => {
      const node = new GroupNode(
        method,
        routes,
        vscode.TreeItemCollapsibleState.Expanded
      );
      node.description = `${routes.length} route${routes.length > 1 ? "s" : ""}`;
      node.iconPath = this.getMethodIcon(method);
      return node;
    });
  }

  private groupByPath(routes: RouteDefinition[]): GroupNode[] {
    const groups = new Map<string, RouteDefinition[]>();

    for (const route of routes) {
      const basePath = this.extractBasePath(route.path);
      if (!groups.has(basePath)) {
        groups.set(basePath, []);
      }
      groups.get(basePath)!.push(route);
    }

    return Array.from(groups.entries()).map(([basePath, routes]) => {
      const node = new GroupNode(
        basePath,
        routes,
        vscode.TreeItemCollapsibleState.Expanded
      );
      node.description = `${routes.length} route${routes.length > 1 ? "s" : ""}`;
      node.iconPath = new vscode.ThemeIcon("folder");
      return node;
    });
  }

  private extractBasePath(fullPath: string): string {
    const parts = fullPath.split("/").filter((p) => p && !p.startsWith(":"));
    return parts.length > 0 ? `/${parts[0]}` : "/";
  }

  private getRoutesForGroup(group: GroupNode): RouteNode[] {
    return group.routes.map((route) => {
      const node = new RouteNode(route);
      node.parent = group;
      return node;
    });
  }

  private getMethodIcon(method: HttpMethod): vscode.ThemeIcon {
    const iconMap: Record<HttpMethod, string> = {
      GET: "arrow-down",
      POST: "add",
      PUT: "edit",
      DELETE: "trash",
      PATCH: "wrench",
      OPTIONS: "question",
      HEAD: "info",
    };

    return new vscode.ThemeIcon(iconMap[method] || "symbol-method");
  }
}

export abstract class TreeNode extends vscode.TreeItem {
  parent?: TreeNode;
}

export class GroupNode extends TreeNode {
  constructor(
    public readonly label: string,
    public readonly routes: RouteDefinition[],
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
    this.contextValue = "group";
  }
}

export class RouteNode extends TreeNode {
  constructor(public readonly route: RouteDefinition) {
    super(`${route.method} ${route.path}`, vscode.TreeItemCollapsibleState.None);

    this.description = route.handler;
    this.contextValue = "route";

    // Command to navigate to route
    this.command = {
      command: "routify.navigateToRoute",
      title: "Go to Route",
      arguments: [route],
    };

    // Icon based on HTTP method
    this.iconPath = this.getMethodIcon(route.method);

    // Tooltip with details
    this.tooltip = this.buildTooltip();
  }

  private getMethodIcon(method: HttpMethod): vscode.ThemeIcon {
    const colorMap: Record<HttpMethod, string> = {
      GET: "testing-passed-icon", // blue
      POST: "testing-run-icon", // green
      PUT: "warning", // yellow
      DELETE: "error", // red
      PATCH: "info", // blue
      OPTIONS: "question",
      HEAD: "info",
    };

    return new vscode.ThemeIcon(colorMap[method] || "symbol-method");
  }

  private buildTooltip(): vscode.MarkdownString {
    const md = new vscode.MarkdownString();
    md.appendMarkdown(`### ${this.route.method} ${this.route.path}\n\n`);
    md.appendMarkdown(`**Handler:** \`${this.route.handler}\`\n\n`);
    md.appendMarkdown(
      `**File:** ${path.basename(this.route.filePath)}:${this.route.line}\n\n`
    );

    if (this.route.middleware && this.route.middleware.length > 0) {
      md.appendMarkdown(`**Middleware:** ${this.route.middleware.join(", ")}\n\n`);
    }

    if (this.route.params && this.route.params.length > 0) {
      md.appendMarkdown(`**Parameters:**\n\n`);
      for (const param of this.route.params) {
        md.appendMarkdown(`- \`:${param.name}\` (${param.type})\n`);
      }
    }

    md.appendMarkdown(`\n**Framework:** ${this.route.framework}`);

    return md;
  }
}
