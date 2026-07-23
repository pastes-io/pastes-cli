// Maps a filename to a pastes.io syntax slug. The slugs mirror
// services/pastes-web/src/lib/utils/syntax.json; keep them in sync when a new
// language is activated there.

const EXTENSION_TO_SYNTAX: Record<string, string> = {
  as: 'actionscript',
  bash: 'bash',
  bas: 'basic',
  c: 'c',
  cc: 'cpp',
  cjs: 'javascript',
  cpp: 'cpp',
  cs: 'csharp',
  css: 'css',
  cxx: 'cpp',
  dart: 'dart',
  diff: 'diff',
  dockerfile: 'docker',
  go: 'go',
  h: 'c',
  hh: 'cpp',
  hpp: 'cpp',
  htm: 'html',
  html: 'html',
  java: 'java',
  js: 'javascript',
  json: 'json',
  jsx: 'jsx',
  kt: 'kotlin',
  kts: 'kotlin',
  log: 'logs',
  lua: 'lua',
  markdown: 'markdown',
  matlab: 'matlab',
  md: 'markdown',
  mjs: 'javascript',
  mmd: 'mermaid',
  mermaid: 'mermaid',
  php: 'php',
  ps1: 'powershell',
  psm1: 'powershell',
  patch: 'diff',
  py: 'python',
  pyw: 'python',
  rb: 'ruby',
  rs: 'rust',
  sh: 'bash',
  sql: 'sql',
  swift: 'swift',
  ts: 'typescript',
  tsx: 'typescript',
  txt: 'txt',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'bash'
};

// Files that carry their language in the name rather than an extension.
const FILENAME_TO_SYNTAX: Record<string, string> = {
  dockerfile: 'docker',
  makefile: 'bash',
  '.bashrc': 'bash',
  '.zshrc': 'bash'
};

export const DEFAULT_SYNTAX = 'txt';

export function syntaxForFilename(filename: string | undefined) {
  if (!filename) {
    return undefined;
  }
  const base = filename.replace(/\\/g, '/').split('/').pop() || '';
  const byName = FILENAME_TO_SYNTAX[base.toLowerCase()];
  if (byName) {
    return byName;
  }
  const dot = base.lastIndexOf('.');
  if (dot <= 0 || dot === base.length - 1) {
    return undefined;
  }
  return EXTENSION_TO_SYNTAX[base.slice(dot + 1).toLowerCase()];
}

/**
 * Titles the paste after the file it came from, or the first meaningful line of
 * whatever was piped in. The API requires a title, so this always returns one.
 */
export function deriveTitle({
  filename,
  content
}: {
  filename?: string;
  content: string;
}) {
  if (filename) {
    const base = filename.replace(/\\/g, '/').split('/').pop();
    if (base) {
      return base;
    }
  }
  for (const line of content.split('\n', 20)) {
    const trimmed = line.trim();
    if (trimmed) {
      return trimmed.length > 60 ? `${trimmed.slice(0, 57)}...` : trimmed;
    }
  }
  return 'Untitled paste';
}
