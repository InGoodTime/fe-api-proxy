import type { ServiceDefinition } from '../../../types.js';
import type { InvokeSourceConfig } from './contracts.js';
import { BaseInvokeSource } from './base.js';
import { isOpenApiDocument, parseOpenApiDocument } from './utils/parser/openapi.js';

export class OpenApiInvokeSource extends BaseInvokeSource {
  readonly type = 'openapi';

  parse(payload: unknown, source: InvokeSourceConfig): ServiceDefinition {
    if (!isOpenApiDocument(payload)) {
      const label = source.name ?? 'openapi';
      throw new Error('Payload for source "' + label + '" is not an OpenAPI 3.x document.');
    }
    return parseOpenApiDocument(payload);
  }
}