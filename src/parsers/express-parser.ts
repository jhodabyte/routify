// src/parsers/express-parser.ts

import { BaseParser } from "./base-parser";
import {
  RouteDefinition,
  Framework,
  ParseResult,
  HttpMethod,
} from "../models/route";
import { ASTAnalyzer, MethodCallInfo } from "../ast/ast-analyzer";
import {
  extractStringValue,
  extractRouteParams,
  extractMemberExpressionName,
} from "../ast/ast-utils";
import {
  EXPRESS_ROUTER_OBJECTS,
  EXPRESS_METHOD_NAMES,
} from "../utils/constants";
import * as t from "@babel/types";
import traverse from "@babel/traverse";

export class ExpressParser extends BaseParser {
  readonly framework: Framework = "express";
  private analyzer = new ASTAnalyzer();

  /**
   * Detecta si el archivo contiene código de Express
   */
  canParse(content: string, filePath: string): boolean {
    // Verificar imports/requires de Express
    const hasExpressImport =
      /require\s*\(\s*['"]express['"]\s*\)/.test(content) ||
      /from\s+['"]express['"]/.test(content) ||
      /import\s+.*\s+from\s+['"]express['"]/.test(content);

    // Verificar patrones típicos de Express
    const hasExpressPatterns =
      /\.(get|post|put|delete|patch|options|head)\s*\(/.test(content) &&
      /(app|router)\s*[=:]/.test(content);

    // Verificar Router()
    const hasRouter = /Router\s*\(\s*\)/.test(content);

    const canParse = hasExpressImport || hasExpressPatterns || hasRouter;

    return canParse;
  }

  /**
   * Parsea un archivo Express y extrae todas las rutas
   */
  async parse(content: string, filePath: string): Promise<ParseResult> {
    const routes: RouteDefinition[] = [];
    const errors: any[] = [];

    try {
      const ast = this.analyzer.parseToAST(content);

      // 1. Buscar variables de router
      const routers = this.findRouterVariables(ast);

      // 2. Construir lista de objetos de routing
      const routingObjects = [...EXPRESS_ROUTER_OBJECTS, ...routers];

      // 3. Buscar llamadas a métodos HTTP
      const methodCalls = this.analyzer.findMethodCalls(
        ast,
        routingObjects,
        EXPRESS_METHOD_NAMES
      );

      // 4. Parsear cada llamada
      for (const call of methodCalls) {
        const route = this.parseExpressRoute(call, filePath);
        if (route) {
          routes.push(route);
        }
      }

      // 5. Buscar app.use() con prefijos de ruta
      const prefixedRoutes = this.findPrefixedRoutes(ast, filePath);
      routes.push(...prefixedRoutes);
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
   * Encuentra variables que contienen routers
   */
  private findRouterVariables(ast: t.File): string[] {
    const routers: string[] = [];

    traverse(ast, {
      VariableDeclarator(path) {
        const { node } = path;

        if (
          t.isIdentifier(node.id) &&
          t.isCallExpression(node.init) &&
          t.isMemberExpression(node.init.callee) &&
          t.isIdentifier(node.init.callee.property) &&
          node.init.callee.property.name === "Router"
        ) {
          routers.push(node.id.name);
        }
      },
    });

    return routers;
  }

  /**
   * Parsea una llamada individual a un método HTTP
   */
  private parseExpressRoute(
    call: MethodCallInfo,
    filePath: string
  ): RouteDefinition | null {
    const { methodName, arguments: args, location } = call;

    // Validar que sea un método HTTP válido
    if (!this.isHttpMethod(methodName)) {
      return null;
    }

    // Debe tener al menos 1 argumento (el path)
    if (args.length === 0) {
      return null;
    }

    // Extraer el path
    const pathNode = args[0];
    const path = extractStringValue(pathNode);

    if (!path) {
      return null;
    }

    // Encontrar el handler (último argumento que sea función o identificador)
    const handlerNode = this.findHandlerNode(args);
    const handler = this.extractHandlerName(handlerNode);

    // Extraer middleware
    const middleware = this.extractMiddleware(args);

    // Extraer parámetros de la ruta
    const params = extractRouteParams(path);

    return {
      method: methodName.toUpperCase() as HttpMethod,
      path: this.normalizePath(path),
      handler,
      filePath,
      line: location?.start.line || 0,
      column: location?.start.column || 0,
      framework: this.framework,
      middleware: middleware.length > 0 ? middleware : undefined,
      params: params.length > 0 ? params : undefined,
    };
  }

  /**
   * Encuentra el nodo del handler en los argumentos
   */
  private findHandlerNode(args: any[]): any {
    // El handler típicamente es el último argumento
    // que sea una función o un identificador
    for (let i = args.length - 1; i >= 1; i--) {
      const arg = args[i];

      if (
        t.isFunctionExpression(arg) ||
        t.isArrowFunctionExpression(arg) ||
        t.isIdentifier(arg) ||
        t.isMemberExpression(arg)
      ) {
        return arg;
      }
    }

    // Si no encontramos nada, retornar el último argumento
    return args[args.length - 1];
  }

  /**
   * Extrae middleware de los argumentos
   */
  private extractMiddleware(args: any[]): string[] {
    const middleware: string[] = [];

    // El middleware está entre el path (args[0]) y el handler (último arg)
    for (let i = 1; i < args.length - 1; i++) {
      const arg = args[i];

      if (t.isIdentifier(arg)) {
        middleware.push(arg.name);
      } else if (t.isMemberExpression(arg)) {
        middleware.push(extractMemberExpressionName(arg));
      } else if (t.isArrayExpression(arg)) {
        // Middleware como array: [auth, validate]
        for (const element of arg.elements) {
          if (element && t.isIdentifier(element)) {
            middleware.push(element.name);
          } else if (element && t.isMemberExpression(element)) {
            middleware.push(extractMemberExpressionName(element));
          }
        }
      }
    }

    return middleware;
  }

  /**
   * Encuentra rutas con prefijos usando app.use('/prefix', router)
   */
  private findPrefixedRoutes(ast: t.File, filePath: string): RouteDefinition[] {
    const prefixedRoutes: RouteDefinition[] = [];

    // TODO: Implementación avanzada para detectar app.use() con prefijos
    // Esto requiere rastrear el flujo de variables y combinar prefijos con rutas

    return prefixedRoutes;
  }
}
