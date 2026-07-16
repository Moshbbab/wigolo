/**
 * OpenAPI 3.1 assembly + /v1/tools index. STUB — S-P2-OPENAPI (T3) fills the
 * bodies from the tool schemas, clamp bounds, and response type interfaces.
 * The router imports these seams up front so the route table is complete after
 * T1; T3 replaces the bodies without touching router.ts.
 */

/** Assemble the served OpenAPI 3.1 document. (T3 fills.) */
export function buildOpenApi(): object {
  return {
    openapi: '3.1.0',
    info: { title: 'wigolo REST API', version: '0.0.0' },
    paths: {},
  };
}

/** Build the `/v1/tools` discovery payload: `[{name, description, endpoint}]`. (T3 fills.) */
export function buildToolsIndex(): object[] {
  return [];
}
