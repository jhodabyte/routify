// src/services/workspace-scanner.ts

import * as vscode from "vscode";
import * as fs from "fs/promises";
import { RouteDefinition } from "../models/route";
import { ExpressParser } from "../parsers/express-parser";
import {
  DEFAULT_EXCLUDE_PATTERNS,
  DEFAULT_INCLUDE_PATTERNS,
} from "../utils/constants";

export class WorkspaceScanner {
  private parser: ExpressParser;

  constructor() {
    this.parser = new ExpressParser();
  }

  /**
   * Escanea todo el workspace en busca de rutas
   */
  async scanWorkspace(): Promise<RouteDefinition[]> {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      return [];
    }

    const allRoutes: RouteDefinition[] = [];

    for (const folder of workspaceFolders) {
      const routes = await this.scanFolder(folder.uri);
      allRoutes.push(...routes);
    }

    return allRoutes;
  }

  /**
   * Escanea una carpeta específica
   */
  async scanFolder(folderUri: vscode.Uri): Promise<RouteDefinition[]> {
    // Obtener configuración
    const config = vscode.workspace.getConfiguration("routify");
    const includePatterns = config.get<string[]>(
      "includePatterns",
      DEFAULT_INCLUDE_PATTERNS
    );
    const excludePatterns = config.get<string[]>(
      "excludePatterns",
      DEFAULT_EXCLUDE_PATTERNS
    );

    // Buscar archivos que coincidan con los patrones
    const files = await this.findFiles(
      folderUri,
      includePatterns,
      excludePatterns
    );

    // Escanear archivos
    const routes: RouteDefinition[] = [];

    for (const file of files) {
      const fileRoutes = await this.scanFile(file);
      routes.push(...fileRoutes);
    }

    return routes;
  }

  /**
   * Escanea un archivo individual
   */
  async scanFile(fileUri: vscode.Uri): Promise<RouteDefinition[]> {
    const filePath = fileUri.fsPath;

    try {
      // Leer contenido del archivo
      const content = await fs.readFile(filePath, "utf-8");

      // Verificar si el parser puede manejar este archivo
      if (!this.parser.canParse(content, filePath)) {
        return [];
      }

      // Parsear el archivo
      const result = await this.parser.parse(content, filePath);

      if (result.errors.length > 0) {
        console.error(`Errors parsing ${filePath}:`, result.errors);
      }

      return result.routes;
    } catch (error) {
      console.error(`Error scanning file ${filePath}:`, error);
      return [];
    }
  }

  /**
   * Busca archivos que coincidan con los patrones
   */
  private async findFiles(
    folderUri: vscode.Uri,
    includePatterns: string[],
    excludePatterns: string[]
  ): Promise<vscode.Uri[]> {
    const allFiles: vscode.Uri[] = [];

    for (const pattern of includePatterns) {
      const relativePattern = new vscode.RelativePattern(folderUri, pattern);

      // Use the first exclude pattern or null
      // VS Code's findFiles doesn't support complex nested patterns well
      const excludePattern = excludePatterns.length > 0
        ? excludePatterns[0]
        : null;

      const files = await vscode.workspace.findFiles(
        relativePattern,
        excludePattern
      );
      allFiles.push(...files);
    }

    // Filter out files that match any exclude pattern
    const filtered = allFiles.filter(file => {
      const filePath = file.fsPath;
      return !excludePatterns.some(pattern => {
        // Simple pattern matching
        const regexPattern = pattern
          .replace(/\*\*/g, '.*')
          .replace(/\*/g, '[^/]*')
          .replace(/\./g, '\\.');
        const regex = new RegExp(regexPattern);
        return regex.test(filePath);
      });
    });

    // Eliminar duplicados
    const uniqueFiles = Array.from(
      new Map(filtered.map((f) => [f.fsPath, f])).values()
    );

    return uniqueFiles;
  }
}
