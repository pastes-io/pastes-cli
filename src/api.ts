export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface CreatePasteInput {
  title: string;
  content: string;
  syntax: string;
  expire?: string;
  password?: string;
}

export interface PastesClientOptions {
  apiUrl: string;
  apiKey?: string;
}

/** Pulls the human-readable message out of SvelteKit's error shape. */
async function readError(response: Response) {
  const text = await response.text().catch(() => '');
  if (text) {
    try {
      const parsed = JSON.parse(text);
      const message = parsed?.message || parsed?.error?.message || parsed?.error;
      if (typeof message === 'string' && message) {
        return message;
      }
    } catch {
      // Not JSON — fall through to the raw body, which is usually an HTML page.
    }
    if (!text.trimStart().startsWith('<') && text.length < 300) {
      return text.trim();
    }
  }
  return `Request failed with status ${response.status}`;
}

export class PastesClient {
  private apiUrl: string;
  private apiKey?: string;

  constructor({ apiUrl, apiKey }: PastesClientOptions) {
    this.apiUrl = apiUrl;
    this.apiKey = apiKey;
  }

  private async request<T>(
    path: string,
    { method = 'GET', body }: { method?: string; body?: unknown } = {}
  ): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json' };
    if (this.apiKey) {
      headers.authorization = `Bearer ${this.apiKey}`;
    }
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
    }

    let response: Response;
    try {
      response = await fetch(`${this.apiUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch (cause) {
      throw new ApiError(0, `Could not reach ${this.apiUrl} (${(cause as Error).message})`);
    }

    if (!response.ok) {
      throw new ApiError(response.status, await readError(response));
    }
    return (await response.json()) as T;
  }

  createPaste(input: CreatePasteInput) {
    return this.request<{ success: { slug: string; paste_url: string; messages?: string } }>(
      '/api/paste',
      { method: 'POST', body: input }
    );
  }

  getPaste(slug: string, password?: string) {
    if (password) {
      return this.request<{ success: Record<string, unknown> }>(
        `/api/pastes/${encodeURIComponent(slug)}`,
        { method: 'POST', body: { password } }
      );
    }
    return this.request<{ success: Record<string, unknown> }>(
      `/api/pastes/${encodeURIComponent(slug)}`
    );
  }

  listPastes({ query = '', page = 1 }: { query?: string; page?: number } = {}) {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (page > 1) params.set('page', String(page));
    const suffix = params.toString() ? `?${params}` : '';
    return this.request<{ data: unknown; page: number }>(`/api/pastes${suffix}`);
  }

  deletePaste(slug: string) {
    return this.request<{ success: string }>(`/api/pastes/${encodeURIComponent(slug)}`, {
      method: 'DELETE'
    });
  }

  whoami() {
    return this.request<{ success: { email: string; plan: string } }>('/api/cli/whoami');
  }

  startDeviceAuth() {
    return this.request<{
      deviceCode: string;
      userCode: string;
      verificationUri: string;
      verificationUriComplete: string;
      expiresInSec: number;
      intervalSec: number;
    }>('/api/cli/auth/start', { method: 'POST', body: {} });
  }

  pollDeviceAuth(deviceCode: string) {
    return this.request<{
      status: 'pending' | 'approved' | 'expired' | 'slow_down';
      apiKey?: string;
      email?: string;
      intervalSec?: number;
    }>('/api/cli/auth/token', { method: 'POST', body: { deviceCode } });
  }
}
