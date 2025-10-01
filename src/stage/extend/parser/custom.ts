// File: src/stage/extend/parser/custom.ts
// Entry point for supplying a pre-built ServiceDefinition to the pipeline.
import type { ServiceDefinition } from '../../../types.js';

/** Payload accepted by the custom parser helper. */
export interface CustomInput {
  service: ServiceDefinition | (() => ServiceDefinition);
}

export const CustomSource = {
  name: 'custom',
  canParse(_: any) {
    return false; // Not used for detection; `from` is called explicitly.
  },
  from(input: CustomInput): ServiceDefinition {
    return typeof input.service === 'function' ? input.service() : input.service;
  },
};
