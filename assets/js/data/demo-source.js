/**
 * The single demo source descriptor, shared by the dataset and the registry.
 *
 * Demo records must never carry an original-source URL or a verification
 * timestamp — that is asserted both in the schema validator and in the tests.
 */
export const DEMO_SOURCE = Object.freeze({
  id: 'forkspace-demo',
  name: 'FORKSPACE sample dataset',
  kind: 'demo',
  url: null,
  attribution: 'Written by the FORKSPACE prototype authors. Fictional records.',
  licence: 'Demo content — no rights claimed, no third-party data',
  termsUrl: null
});
