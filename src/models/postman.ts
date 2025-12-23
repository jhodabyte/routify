// src/models/postman.ts

/**
 * Postman Collection Format v2.1
 * Specification: https://schema.postman.com/json/collection/v2.1.0/collection.json
 */

export interface PostmanCollection {
  info: PostmanInfo;
  item: PostmanItem[];
  variable?: PostmanVariable[];
}

export interface PostmanInfo {
  name: string;
  description?: string;
  schema: string;
  version?: string;
}

export interface PostmanItem {
  name: string;
  description?: string;
  item?: PostmanItem[]; // Para carpetas/grupos
  request?: PostmanRequest; // Para requests individuales
}

export interface PostmanRequest {
  method: string;
  header: PostmanHeader[];
  body?: PostmanBody;
  url: PostmanUrl | string;
  description?: string;
}

export interface PostmanHeader {
  key: string;
  value: string;
  type?: string;
  disabled?: boolean;
}

export interface PostmanBody {
  mode: "raw" | "urlencoded" | "formdata" | "file" | "graphql";
  raw?: string;
  options?: {
    raw?: {
      language?: string;
    };
  };
}

export interface PostmanUrl {
  raw: string;
  protocol?: string;
  host?: string[];
  path?: string[];
  query?: PostmanQueryParam[];
  variable?: PostmanPathVariable[];
}

export interface PostmanQueryParam {
  key: string;
  value: string;
  disabled?: boolean;
  description?: string;
}

export interface PostmanPathVariable {
  key: string;
  value: string;
  description?: string;
}

export interface PostmanVariable {
  key: string;
  value: string;
  type?: string;
}

/**
 * Postman Environment Format
 */
export interface PostmanEnvironment {
  name: string;
  values: PostmanEnvironmentValue[];
}

export interface PostmanEnvironmentValue {
  key: string;
  value: string;
  enabled: boolean;
  type?: string;
}
