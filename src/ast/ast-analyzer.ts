// src/ast/ast-analyzer.ts

import { parse, ParserOptions } from "@babel/parser";
import traverse, { NodePath } from "@babel/traverse";
import * as t from "@babel/types";

export interface ASTAnalyzerOptions {
  sourceType?: "module" | "script" | "unambiguous";
  plugins?: ParserOptions["plugins"];
}

export class ASTAnalyzer {
  private defaultOptions: ParserOptions = {
    sourceType: "module",
    plugins: [
      "typescript",
      "jsx",
      "decorators-legacy",
      "classProperties",
      "objectRestSpread",
      "asyncGenerators",
      "dynamicImport",
      "optionalChaining",
      "nullishCoalescingOperator",
    ],
    errorRecovery: true,
  };

  /**
   * Parsea código fuente a AST
   */
  parseToAST(code: string, options?: ASTAnalyzerOptions): t.File {
    const parserOptions: ParserOptions = {
      ...this.defaultOptions,
      ...options,
    };

    try {
      return parse(code, parserOptions);
    } catch (error) {
      throw new Error(`Failed to parse code: ${error}`);
    }
  }

  /**
   * Encuentra todas las llamadas a métodos de un objeto específico
   * Útil para encontrar app.get(), router.post(), etc.
   */
  findMethodCalls(
    ast: t.File,
    objectNames: string[],
    methodNames: string[]
  ): MethodCallInfo[] {
    const calls: MethodCallInfo[] = [];

    traverse(ast, {
      CallExpression(path: NodePath<t.CallExpression>) {
        const { node } = path;

        // Verificar que sea una member expression (objeto.método)
        if (!t.isMemberExpression(node.callee)) {
          return;
        }

        const callee = node.callee;

        // Verificar el nombre del método
        if (!t.isIdentifier(callee.property)) {
          return;
        }

        const methodName = callee.property.name;
        if (!methodNames.includes(methodName)) {
          return;
        }

        // Verificar el objeto
        const objectName = extractObjectName(callee.object);
        if (!objectName || !objectNames.includes(objectName)) {
          return;
        }

        calls.push({
          objectName,
          methodName,
          arguments: node.arguments,
          location: node.loc || undefined,
          node: node,
        });
      },
    });

    return calls;
  }
}

export interface MethodCallInfo {
  objectName: string;
  methodName: string;
  arguments: Array<any>;
  location?: t.SourceLocation;
  node: t.CallExpression;
}

/**
 * Extrae el nombre del objeto de una expression
 */
function extractObjectName(
  node: t.Expression | t.V8IntrinsicIdentifier | t.PrivateName
): string | null {
  if (t.isIdentifier(node)) {
    return node.name;
  }

  if (t.isMemberExpression(node)) {
    return extractObjectName(node.object);
  }

  return null;
}
