// src/ast/ast-utils.ts

import * as t from "@babel/types";

/**
 * Extrae el valor de un nodo si es un string literal o template literal
 */
export function extractStringValue(node: any): string | null {
  if (t.isStringLiteral(node)) {
    return node.value;
  }

  if (t.isTemplateLiteral(node)) {
    return reconstructTemplateLiteral(node);
  }

  return null;
}

/**
 * Reconstruye un template literal a string con parámetros
 */
export function reconstructTemplateLiteral(node: t.TemplateLiteral): string {
  let result = "";

  for (let i = 0; i < node.quasis.length; i++) {
    result += node.quasis[i].value.raw;

    if (i < node.expressions.length) {
      const expr = node.expressions[i];

      if (t.isIdentifier(expr)) {
        result += `:${expr.name}`;
      } else if (t.isMemberExpression(expr)) {
        result += ":param";
      } else {
        result += ":param";
      }
    }
  }

  return result;
}

/**
 * Extrae el nombre de un identificador o member expression
 */
export function extractName(node: any): string {
  if (t.isIdentifier(node)) {
    return node.name;
  }

  if (t.isMemberExpression(node)) {
    return extractMemberExpressionName(node);
  }

  if (t.isFunctionExpression(node)) {
    return node.id?.name || "anonymous";
  }

  if (t.isArrowFunctionExpression(node)) {
    return "anonymous";
  }

  return "unknown";
}

/**
 * Extrae el nombre completo de una member expression
 */
export function extractMemberExpressionName(node: t.MemberExpression): string {
  const parts: string[] = [];

  let current: any = node;
  while (current) {
    if (t.isIdentifier(current)) {
      parts.unshift(current.name);
      break;
    } else if (t.isMemberExpression(current)) {
      if (t.isIdentifier(current.property)) {
        parts.unshift(current.property.name);
      }
      current = current.object;
    } else {
      break;
    }
  }

  return parts.join(".");
}

/**
 * Verifica si un nodo es una función (cualquier tipo)
 */
export function isFunction(node: any): boolean {
  return (
    t.isFunctionExpression(node) ||
    t.isArrowFunctionExpression(node) ||
    t.isFunctionDeclaration(node) ||
    t.isObjectMethod(node) ||
    t.isClassMethod(node)
  );
}

/**
 * Extrae parámetros de una ruta Express
 */
export function extractRouteParams(
  path: string
): Array<{ name: string; type: "path"; required: boolean }> {
  const params: Array<{ name: string; type: "path"; required: boolean }> = [];

  // Buscar parámetros tipo :id o :userId
  const regex = /:([a-zA-Z_][a-zA-Z0-9_]*)/g;
  let match;

  while ((match = regex.exec(path)) !== null) {
    params.push({
      name: match[1],
      type: "path",
      required: true,
    });
  }

  return params;
}

/**
 * Normaliza un path de ruta
 */
export function normalizePath(path: string): string {
  // Eliminar comillas
  path = path.replace(/['"]/g, "");

  // Asegurar que empiece con /
  if (!path.startsWith("/")) {
    path = "/" + path;
  }

  // Eliminar / duplicados
  path = path.replace(/\/+/g, "/");

  // Eliminar / al final (excepto si es solo /)
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }

  return path;
}
