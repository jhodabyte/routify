// src/utils/constants.ts

import { HttpMethod } from "../models/route";

export const HTTP_METHODS: HttpMethod[] = [
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "OPTIONS",
  "HEAD",
];

export const EXPRESS_ROUTER_OBJECTS = ["app", "router"];

export const EXPRESS_METHOD_NAMES = [
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "options",
  "head",
  "all",
];

export const DEFAULT_EXCLUDE_PATTERNS = [
  "**/node_modules/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/coverage/**",
  "**/*.spec.{js,ts}",
  "**/*.test.{js,ts}",
];

export const DEFAULT_INCLUDE_PATTERNS = ["**/*.js", "**/*.ts"];

export const CACHE_TTL = 5 * 60 * 1000; // 5 minutos
export const MAX_CACHE_SIZE = 100;
