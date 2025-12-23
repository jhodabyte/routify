// src/parsers/nestjs-parser.ts

import { BaseParser } from "./base-parser";
import {
  RouteDefinition,
  RouteParam,
  Framework,
  ParseResult,
  HttpMethod,
} from "../models/route";
import { ASTAnalyzer } from "../ast/ast-analyzer";
import { extractStringValue } from "../ast/ast-utils";
import * as t from "@babel/types";
import traverse from "@babel/traverse";

// Decoradores de NestJS para rutas
const NESTJS_METHOD_DECORATORS = [
  "Get",
  "Post",
  "Put",
  "Delete",
  "Patch",
  "Options",
  "Head",
  "All",
];

const NESTJS_CONTROLLER_DECORATOR = "Controller";

export class NestJSParser extends BaseParser {
  readonly framework: Framework = "nestjs";
  private analyzer = new ASTAnalyzer();

  /**
   * Detecta si el archivo contiene código de NestJS
   */
  canParse(content: string, filePath: string): boolean {
    // Verificar imports de NestJS (más flexible con espacios y saltos de línea)
    const hasNestImport =
      /@nestjs\/common/.test(content) ||
      /@nestjs\//.test(content);

    // Verificar decoradores típicos de NestJS (con o sin paréntesis)
    const hasNestDecorators =
      /@Controller/.test(content) ||
      /@Get/.test(content) ||
      /@Post/.test(content) ||
      /@Put/.test(content) ||
      /@Delete/.test(content) ||
      /@Patch/.test(content);

    return hasNestImport && hasNestDecorators;
  }

  /**
   * Parsea un archivo NestJS y extrae todas las rutas
   */
  async parse(content: string, filePath: string): Promise<ParseResult> {
    const routes: RouteDefinition[] = [];
    const errors: any[] = [];

    try {
      const ast = this.analyzer.parseToAST(content);

      // Buscar clases con decorador @Controller
      traverse(ast, {
        ClassDeclaration: (path) => {
          const controllerRoutes = this.parseController(path, filePath);
          if (controllerRoutes.length > 0) {
            routes.push(...controllerRoutes);
          }
        },
      });
    } catch (error) {
      errors.push({
        message: `Parse error: ${error}`,
        line: 0,
        column: 0,
      });
    }


    return {
      routes,
      framework: this.framework,
      errors,
    };
  }

  /**
   * Parsea una clase Controller de NestJS
   */
  private parseController(
    classPath: any,
    filePath: string
  ): RouteDefinition[] {
    const routes: RouteDefinition[] = [];
    const decorators = classPath.node.decorators || [];

    // Verificar si la clase tiene el decorador @Controller
    let hasControllerDecorator = false;
    let controllerPrefix = "";

    for (const decorator of decorators) {
      if (t.isDecorator(decorator)) {
        // Manejar @Controller() con paréntesis
        if (t.isCallExpression(decorator.expression)) {
          const callee = decorator.expression.callee;
          if (t.isIdentifier(callee) && callee.name === "Controller") {
            hasControllerDecorator = true;
            // Extraer el argumento del decorador @Controller('prefix')
            const args = decorator.expression.arguments;
            if (args.length > 0) {
              const prefixValue = extractStringValue(args[0]);
              if (prefixValue) {
                controllerPrefix = this.normalizePath(prefixValue);
              }
            }
            break;
          }
        }
        // Manejar @Controller sin paréntesis
        else if (t.isIdentifier(decorator.expression)) {
          if (decorator.expression.name === "Controller") {
            hasControllerDecorator = true;
            break;
          }
        }
      }
    }

    // Si no tiene el decorador @Controller, no es un controller de NestJS
    if (!hasControllerDecorator) {
      return routes;
    }

    // Extraer el nombre de la clase del controller
    const controllerName = t.isIdentifier(classPath.node.id)
      ? classPath.node.id.name
      : "UnknownController";

    // Buscar métodos con decoradores de ruta
    const classBody = classPath.node.body.body;

    for (const member of classBody) {
      if (t.isClassMethod(member) && member.decorators) {
        const methodRoutes = this.parseMethodDecorators(
          member,
          controllerPrefix,
          controllerName,
          filePath
        );
        routes.push(...methodRoutes);
      }
    }

    return routes;
  }

  /**
   * Parsea los decoradores de un método de clase
   */
  private parseMethodDecorators(
    method: t.ClassMethod,
    controllerPrefix: string,
    controllerName: string,
    filePath: string
  ): RouteDefinition[] {
    const routes: RouteDefinition[] = [];
    const decorators = method.decorators || [];

    for (const decorator of decorators) {
      if (
        t.isDecorator(decorator) &&
        t.isCallExpression(decorator.expression)
      ) {
        const callee = decorator.expression.callee;

        if (t.isIdentifier(callee)) {
          const decoratorName = callee.name;

          // Verificar si es un decorador de método HTTP
          if (NESTJS_METHOD_DECORATORS.includes(decoratorName)) {
            const httpMethod = this.mapDecoratorToHttpMethod(decoratorName);
            const args = decorator.expression.arguments;

            // Extraer el path del decorador
            let routePath = "";
            if (args.length > 0) {
              const pathValue = extractStringValue(args[0]);
              if (pathValue) {
                routePath = this.normalizePath(pathValue);
              }
            }

            // Combinar prefijo del controlador con el path del método
            const fullPath = this.combinePaths(controllerPrefix, routePath);

            // Extraer nombre del método
            const handlerName = t.isIdentifier(method.key)
              ? method.key.name
              : "anonymous";

            // Obtener línea y columna
            const line = method.loc?.start.line || 0;
            const column = method.loc?.start.column || 0;

            const route: RouteDefinition = {
              path: fullPath,
              method: httpMethod,
              handler: handlerName,
              line,
              column,
              filePath: filePath,
              framework: this.framework,
              params: this.extractRouteParams(fullPath),
              controller: controllerName,
            };

            routes.push(route);
          }
        }
      }
    }

    return routes;
  }

  /**
   * Mapea el nombre del decorador al método HTTP
   */
  private mapDecoratorToHttpMethod(decoratorName: string): HttpMethod {
    const methodMap: Record<string, HttpMethod> = {
      Get: "GET",
      Post: "POST",
      Put: "PUT",
      Delete: "DELETE",
      Patch: "PATCH",
      Options: "OPTIONS",
      Head: "HEAD",
      All: "ALL",
    };

    return methodMap[decoratorName] || "GET";
  }

  /**
   * Combina el prefijo del controlador con el path del método
   */
  private combinePaths(prefix: string, path: string): string {
    // Normalizar paths
    prefix = prefix.replace(/^\/|\/$/g, "");
    path = path.replace(/^\/|\/$/g, "");

    // Combinar
    if (!prefix) {
      return `/${path}` || "/";
    }
    if (!path) {
      return `/${prefix}`;
    }
    return `/${prefix}/${path}`;
  }

  /**
   * Extrae parámetros de la ruta
   */
  private extractRouteParams(path: string): RouteParam[] {
    const params: RouteParam[] = [];
    // Capturar :param y :param?
    const regex = /:([a-zA-Z_][a-zA-Z0-9_]*)(\?)?/g;
    let match;

    while ((match = regex.exec(path)) !== null) {
      params.push({
        name: match[1],
        type: "path",
        required: !match[2], // Si no tiene ?, es requerido
      });
    }

    return params;
  }
}
