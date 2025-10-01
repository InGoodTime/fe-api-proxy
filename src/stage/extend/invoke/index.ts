import type { IStage } from '../../index.js';
import type { DocSyncContext } from '../../../pipeline/types.js';
import {
  type InvokeSourceAdapter,
  type InvokeSourceConfig,
  type InvokeStageConfig,
  type InvokeStageResult,
  type InvokeSourceError,
  type UnifiedInvokeDocument,
} from './contracts.js';
import { ApifoxInvokeSource } from './apifox.js';
import { SwaggerInvokeSource } from './swagger.js';
import { OpenApiInvokeSource } from './openapi.js';
import { PostmanInvokeSource } from './postman.js';

const DEFAULT_ADAPTERS: InvokeSourceAdapter[] = [
  new ApifoxInvokeSource(),
  new SwaggerInvokeSource(),
  new OpenApiInvokeSource(),
  new PostmanInvokeSource(),
];

function cloneAdapters(adapters: InvokeSourceAdapter[]): InvokeSourceAdapter[] {
  return adapters.slice();
}

export class InvokeStage implements IStage<DocSyncContext, InvokeStageConfig | undefined, InvokeStageResult | undefined> {
  readonly name = 'invoke';
  private readonly defaultAdapters: InvokeSourceAdapter[];

  constructor(adapters?: InvokeSourceAdapter[]) {
    this.defaultAdapters = adapters && adapters.length ? cloneAdapters(adapters) : cloneAdapters(DEFAULT_ADAPTERS);
  }

  async execute(
    context: DocSyncContext,
    config?: InvokeStageConfig
  ): Promise<InvokeStageResult | undefined> {
    if (!config || config.skip) {
      return undefined;
    }
    if (!Array.isArray(config.sources) || !config.sources.length) {
      throw new Error('[InvokeStage] At least one source must be provided.');
    }

    const adapters = this.resolveAdapters(config.adapters);
    const continueOnError = config.continueOnError ?? true;
    const documents: UnifiedInvokeDocument[] = [];
    const errors: InvokeSourceError[] = [];

    for (const source of config.sources) {
      const adapter = this.findAdapter(adapters, source);
      if (!adapter) {
        const message = 'No adapter registered for source type "' + source.type + '".';
        const err: InvokeSourceError = { type: source.type, name: source.name, message };
        errors.push(err);
        if (!continueOnError) {
          throw this.wrapError(source.type, message, undefined);
        }
        continue;
      }

      try {
        const raw = await adapter.fetch(source as InvokeSourceConfig);
        const serviceDefinition = await Promise.resolve(adapter.parse(raw, source as InvokeSourceConfig));
        documents.push({
          type: adapter.type,
          name: source.name ?? adapter.type,
          rawDocument: raw,
          serviceDefinition,
          metadata: source.metadata,
          adapter: adapter.type,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const err: InvokeSourceError = {
          type: source.type,
          name: source.name,
          message,
          cause: error instanceof Error ? error : undefined,
        };
        errors.push(err);
        if (!continueOnError) {
          throw this.wrapError(adapter.type, message, error);
        }
      }
    }

    const result: InvokeStageResult = {
      documents,
      errors: errors.length ? errors : undefined,
    };
    (context as Record<string, unknown>).invokeResults = result;
    return result;
  }

  private resolveAdapters(custom?: InvokeSourceAdapter[]): InvokeSourceAdapter[] {
    if (!custom || !custom.length) {
      return cloneAdapters(this.defaultAdapters);
    }
    const map = new Map<string, InvokeSourceAdapter>();
    for (const adapter of this.defaultAdapters) {
      map.set(adapter.type, adapter);
    }
    for (const adapter of custom) {
      map.set(adapter.type, adapter);
    }
    return Array.from(map.values());
  }

  private findAdapter(adapters: InvokeSourceAdapter[], source: InvokeSourceConfig): InvokeSourceAdapter | undefined {
    for (const adapter of adapters) {
      if (adapter.canHandle(source)) {
        return adapter;
      }
    }
    return undefined;
  }

  private wrapError(type: string, message: string, cause: unknown): Error {
    const error = new Error('[InvokeStage] Adapter "' + type + '" failed: ' + message);
    (error as Error & { cause?: unknown }).cause = cause;
    return error;
  }
}

export function createInvokeStage(adapters?: InvokeSourceAdapter[]) {
  return new InvokeStage(adapters);
}

export { ApifoxInvokeSource, SwaggerInvokeSource, OpenApiInvokeSource, PostmanInvokeSource };
export * from './contracts.js';