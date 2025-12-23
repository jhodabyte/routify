import * as t from "@babel/types";

export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "DELETE"
  | "PATCH"
  | "OPTIONS"
  | "HEAD"
  | "ALL";

export type Framework = "express" | "nestjs" | "fastify" | "unknown";

export interface RouteParam {
  name: string;
  type: "path" | "query" | "body" | "header";
  required: boolean;
  description?: string;
}

export interface RouteDefinition {
  method: HttpMethod;
  path: string;
  handler: string;
  filePath: string;
  line: number;
  column: number;
  framework: Framework;
  middleware?: string[];
  params?: RouteParam[];
  decorators?: string[];
  controller?: string;
}

export interface ParseResult {
  routes: RouteDefinition[];
  framework: Framework;
  errors: ParseError[];
}

export interface ParseError {
  message: string;
  line?: number;
  column?: number;
}

export interface DecoratorInfo {
  name: string;
  arguments: Array<any>;
  targetType: "class" | "method" | "property";
  targetName?: string;
  location?: t.SourceLocation;
  node: t.Decorator;
}
