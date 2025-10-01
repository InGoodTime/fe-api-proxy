import test from 'node:test';
import assert from 'node:assert/strict';

import { DocSyncPipeline } from './src/pipeline/index.js';
import type { DocSyncPipelineRunOptions, InvokeStageResult } from './src/pipeline/types.js';
import swaggerExample from './test/swagger-example.json' with { type: 'json' };

function createPipelineOptions(): DocSyncPipelineRunOptions {
  return {
    invoke: {
      sources: [
        {
          type: 'swagger',
          name: 'swagger-example',
          document: swaggerExample,
          metadata: { primary: true },
        },
      ],
    },
    output: {
      outputDir: './client',
    },
    stageLogger: console,
  };
}

test('DocSyncPipeline processes swagger example', async () => {
  const pipeline = new DocSyncPipeline(undefined, undefined, false);
  const options = createPipelineOptions();

  let result;
  try {
    result = await pipeline.run(options);
  } catch (error) {
    console.error('Pipeline execution failed:', error);
    throw error;
  }

  assert.ok(result.serviceDefinition, 'pipeline should produce a service definition');
  assert.ok(
    result.serviceDefinition?.endpoints.length,
    'service definition should contain endpoints',
  );

  const invokeResult = result.stageResults.invoke as InvokeStageResult | undefined;
  assert.ok(invokeResult, 'invoke stage result should be captured');
  assert.strictEqual(invokeResult?.documents.length, 1, 'exactly one document should be processed');
  assert.strictEqual(invokeResult?.documents[0]?.adapter, 'swagger', 'swagger adapter should be used');

  const bundle = result.generatedBundle;
  assert.ok(bundle, 'generator stage should produce a bundle');
  assert.ok(bundle?.files.length, 'generated bundle should contain files');

  const endpointIds = new Set(result.serviceDefinition?.endpoints.map(endpoint => endpoint.id));
  assert.ok(endpointIds.has('getUsers'), 'expected endpoint getUsers to be present');
  assert.ok(endpointIds.has('createUser'), 'expected endpoint createUser to be present');
});