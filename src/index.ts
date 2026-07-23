// Programmatic entry point, so the client can be reused from a script:
//   import { PastesClient } from 'pastes';
export { ApiError, PastesClient } from './api.js';
export type { CreatePasteInput, PastesClientOptions } from './api.js';
export { DEFAULT_API_URL, resolveApiKey, resolveApiUrl, readConfig } from './config.js';
export type { StoredConfig } from './config.js';
export { DEFAULT_SYNTAX, deriveTitle, syntaxForFilename } from './syntax.js';
