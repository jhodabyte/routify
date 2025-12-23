// src/parsers/base-parser.ts

import {
  RouteDefinition,
  Framework,
  ParseResult,
  HttpMethod,
} from "../models/route";
import { extractName, normalizePath } from "../ast/ast-utils";
import * as t from "@babel/types";
import { HTTP_METHODS } from "../utils/constants";

export interface IParser {
  readonly framework: Framework;
  canParse(content: string, filePath: string): boolean;
  parse(content: string, filePath: string): Promise<ParseResult>;
}

export abstract class BaseParser implements IParser {
  abstract readonly framework: Framework;
  abstract canParse(content: string, filePath: string): boolean;
  abstract parse(content: string, filePath: string): Promise<ParseResult>;

  protected readonly HTTP_METHODS = HTTP_METHODS;

  /**
   * Valida si un string es un método HTTP válido
   */
  protected isHttpMethod(method: string): method is HttpMethod {
    return this.HTTP_METHODS.includes(method.toUpperCase() as HttpMethod);
  }

  /**
   * Normaliza un path de ruta
   */
  protected normalizePath(path: string): string {
    return normalizePath(path);
  }

  /**
   * Extrae el nombre del handler
   */
  protected extractHandlerName(node: any): string {
    return extractName(node);
  }
}
