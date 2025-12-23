// src/exporters/postman-exporter.ts

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { RouteDefinition } from "../models/route";
import {
  PostmanCollection,
  PostmanItem,
  PostmanRequest,
  PostmanUrl,
  PostmanEnvironment,
  PostmanVariable,
  PostmanBody,
} from "../models/postman";

export class PostmanExporter {
  /**
   * Exporta rutas como colección de Postman v2.1
   */
  async exportCollection(
    routes: RouteDefinition[],
    collectionName: string,
    workspaceName?: string
  ): Promise<void> {
    if (routes.length === 0) {
      vscode.window.showWarningMessage("No hay rutas para exportar");
      return;
    }

    const collection = this.generateCollection(routes, collectionName);

    // Pedir al usuario dónde guardar
    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(
        path.join(
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "",
          `${collectionName}.postman_collection.json`
        )
      ),
      filters: {
        "Postman Collection": ["json"],
      },
    });

    if (uri) {
      const content = JSON.stringify(collection, null, 2);
      fs.writeFileSync(uri.fsPath, content, "utf-8");
      vscode.window.showInformationMessage(
        `Colección Postman exportada: ${path.basename(uri.fsPath)}`
      );

      // Preguntar si quiere exportar también el environment
      const exportEnv = await vscode.window.showQuickPick(["Sí", "No"], {
        placeHolder: "¿Deseas exportar también las variables de entorno?",
      });

      if (exportEnv === "Sí") {
        await this.exportEnvironment(workspaceName || collectionName);
      }
    }
  }

  /**
   * Exporta variables de entorno de Postman
   */
  async exportEnvironment(environmentName: string): Promise<void> {
    const config = vscode.workspace.getConfiguration("routify");
    const baseUrl = config.get<string>("baseUrl") || "http://localhost:3000";

    const environment = this.generateEnvironment(environmentName, baseUrl);

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(
        path.join(
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "",
          `${environmentName}.postman_environment.json`
        )
      ),
      filters: {
        "Postman Environment": ["json"],
      },
    });

    if (uri) {
      const content = JSON.stringify(environment, null, 2);
      fs.writeFileSync(uri.fsPath, content, "utf-8");
      vscode.window.showInformationMessage(
        `Environment Postman exportado: ${path.basename(uri.fsPath)}`
      );
    }
  }

  /**
   * Genera la colección de Postman desde las rutas
   */
  private generateCollection(
    routes: RouteDefinition[],
    collectionName: string
  ): PostmanCollection {
    // Agrupar por controlador/archivo
    const grouped = this.groupRoutesByController(routes);

    const items: PostmanItem[] = [];

    for (const [groupName, groupRoutes] of Object.entries(grouped)) {
      // Crear una carpeta por cada controlador
      const folderItem: PostmanItem = {
        name: groupName,
        description: `Endpoints del controlador ${groupName}`,
        item: groupRoutes.map((route) => this.routeToPostmanItem(route)),
      };

      items.push(folderItem);
    }

    return {
      info: {
        name: collectionName,
        description: `API Collection generada automáticamente por Routify`,
        schema:
          "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        version: "1.0.0",
      },
      item: items,
      variable: [
        {
          key: "baseUrl",
          value:
            vscode.workspace.getConfiguration("routify").get<string>("baseUrl") ||
            "http://localhost:3000",
          type: "string",
        },
      ],
    };
  }

  /**
   * Convierte una ruta a un item de Postman
   */
  private routeToPostmanItem(route: RouteDefinition): PostmanItem {
    const url = this.buildPostmanUrl(route);
    const body = this.buildPostmanBody(route);

    const request: PostmanRequest = {
      method: route.method,
      header: this.getDefaultHeaders(route),
      url,
      description: `Handler: ${route.handler}\nFile: ${route.filePath}:${route.line}`,
    };

    if (body) {
      request.body = body;
    }

    return {
      name: `${route.method} ${route.path}`,
      request,
    };
  }

  /**
   * Construye la URL de Postman con variables
   */
  private buildPostmanUrl(route: RouteDefinition): PostmanUrl {
    // Extraer parámetros de path (:id, :userId, etc.)
    const pathParts = route.path.split("/").filter((p) => p);
    const pathVariables: Array<{ key: string; value: string }> = [];

    const processedPath = pathParts.map((part) => {
      if (part.startsWith(":")) {
        const paramName = part.substring(1).replace("?", "");
        pathVariables.push({
          key: paramName,
          value: `{{${paramName}}}`,
        });
        return `:${paramName}`;
      }
      return part;
    });

    return {
      raw: `{{baseUrl}}/${processedPath.join("/")}`,
      protocol: "http",
      host: ["{{baseUrl}}"],
      path: processedPath,
      variable: pathVariables,
    };
  }

  /**
   * Construye el body de la petición con ejemplo
   */
  private buildPostmanBody(route: RouteDefinition): PostmanBody | undefined {
    // Solo agregar body para métodos que lo permiten
    if (!["POST", "PUT", "PATCH"].includes(route.method)) {
      return undefined;
    }

    // Generar un body de ejemplo basado en el tipo de endpoint
    const exampleBody = this.generateExampleBody(route);

    return {
      mode: "raw",
      raw: JSON.stringify(exampleBody, null, 2),
      options: {
        raw: {
          language: "json",
        },
      },
    };
  }

  /**
   * Genera un body de ejemplo inteligente basado en la ruta
   */
  private generateExampleBody(route: RouteDefinition): any {
    const routePath = route.path.toLowerCase();

    // Ejemplos comunes según el tipo de endpoint
    if (routePath.includes("login")) {
      return {
        email: "user@example.com",
        password: "password123",
      };
    }

    if (routePath.includes("register") || routePath.includes("signup")) {
      return {
        email: "user@example.com",
        password: "password123",
        name: "John Doe",
      };
    }

    if (routePath.includes("user")) {
      return {
        name: "John Doe",
        email: "john@example.com",
        role: "user",
      };
    }

    if (routePath.includes("product")) {
      return {
        name: "Product Name",
        price: 99.99,
        description: "Product description",
      };
    }

    // Body genérico
    return {
      // Campos vacíos para que el usuario complete
    };
  }

  /**
   * Obtiene headers por defecto según el método
   */
  private getDefaultHeaders(route: RouteDefinition): Array<{
    key: string;
    value: string;
  }> {
    const headers: Array<{ key: string; value: string }> = [];

    // Agregar Content-Type para métodos con body
    if (["POST", "PUT", "PATCH"].includes(route.method)) {
      headers.push({
        key: "Content-Type",
        value: "application/json",
      });
    }

    // Si tiene decoradores de autenticación, agregar header de Authorization
    if (
      route.decorators?.some(
        (d) => d.includes("UseGuards") || d.includes("Auth")
      )
    ) {
      headers.push({
        key: "Authorization",
        value: "Bearer {{token}}",
      });
    }

    return headers;
  }

  /**
   * Agrupa rutas por controlador o archivo
   */
  private groupRoutesByController(
    routes: RouteDefinition[]
  ): Record<string, RouteDefinition[]> {
    const grouped: Record<string, RouteDefinition[]> = {};

    for (const route of routes) {
      const groupName =
        route.controller || path.basename(route.filePath, path.extname(route.filePath));

      if (!grouped[groupName]) {
        grouped[groupName] = [];
      }

      grouped[groupName].push(route);
    }

    return grouped;
  }

  /**
   * Genera el archivo de environment de Postman
   */
  private generateEnvironment(
    name: string,
    baseUrl: string
  ): PostmanEnvironment {
    return {
      name: `${name} Environment`,
      values: [
        {
          key: "baseUrl",
          value: baseUrl,
          enabled: true,
          type: "default",
        },
        {
          key: "token",
          value: "",
          enabled: true,
          type: "secret",
        },
      ],
    };
  }
}
