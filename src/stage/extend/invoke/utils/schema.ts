import type { Schema, ObjectSchema, ArraySchema, PrimitiveSchema } from '../../../../types.js';


export function jsonSchemaToSchema(input: any | undefined): Schema | undefined {
  if (!input || typeof input !== 'object') return undefined;

  const type = input.type as string | string[] | undefined;
  const nullable = !!input.nullable;
  const description = input.description as string | undefined;
  const title = input.title as string | undefined;
  const example = input.example ?? input.examples?.[0];

  const base = { nullable, description, title, example };

  const typeStr = Array.isArray(type)
    ? type.includes('null')
      ? type.find(t => t !== 'null') || type[0]
      : type[0]
    : type;

  // 如果没有类型信息，处理特殊结构
  if (!typeStr) {
    if (input.oneOf) {
      return {
        kind: 'oneOf',
        variants: input.oneOf.map((v: any) => jsonSchemaToSchema(v)!).filter(Boolean),
        ...base,
      } as any;
    }
    if (input.anyOf) {
      return {
        kind: 'oneOf',
        variants: input.anyOf.map((v: any) => jsonSchemaToSchema(v)!).filter(Boolean),
        ...base,
      } as any;
    }
    if (input.enum) {
      return { kind: 'enum', values: input.enum, ...base } as any;
    }
    return { kind: 'unknown', ...base } as PrimitiveSchema;
  }

  switch (typeStr) {
    case 'object': {
      const properties: Record<string, Schema> = {};
      const props = input.properties || {};
      for (const key of Object.keys(props)) {
        const child = jsonSchemaToSchema(props[key]);
        if (child) properties[key] = child;
      }
      const additional = input.additionalProperties;
      let additionalProperties: boolean | Schema | undefined = undefined;
      if (typeof additional === 'boolean') additionalProperties = additional;
      else if (additional && typeof additional === 'object') additionalProperties = jsonSchemaToSchema(additional);
      const required = Array.isArray(input.required) ? input.required : undefined;
      return { kind: 'object', properties, required, additionalProperties, ...base } as ObjectSchema;
    }

    case 'array': {
      const element = jsonSchemaToSchema(input.items);
      const minItems = typeof input.minItems === 'number' ? input.minItems : undefined;
      const maxItems = typeof input.maxItems === 'number' ? input.maxItems : undefined;
      return { kind: 'array', element, minItems, maxItems, ...base } as ArraySchema;
    }

    case 'string':
    case 'number':
    case 'integer':
    case 'boolean':
    case 'null': {
      const format = input.format as string | undefined;
      return { kind: typeStr, format, ...base } as PrimitiveSchema;
    }

    default:
      return { kind: 'unknown', ...base } as PrimitiveSchema;
  }
}