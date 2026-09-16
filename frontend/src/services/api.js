import { apiHeaders } from '../config';

export function imageSource(value, mime = 'image/png') {
  if (typeof value !== 'string' || !value) throw new Error('The backend returned no image.');
  return value.startsWith('data:image/') ? value : `data:${mime};base64,${value}`;
}

// One request path for all tools. No automatic retries of expensive operations.
export async function apiRequest(base, path, body, { signal } = {}) {
  if (!base) throw new Error('Connect your notebook first.');
  const multipart = body instanceof FormData;
  const response = await fetch(`${base.replace(/\/+$/, '')}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: apiHeaders(multipart || body === undefined ? {} : { 'Content-Type': 'application/json' }),
    body: body === undefined ? undefined : multipart ? body : JSON.stringify(body), signal,
  });
  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await response.json() : null;
  if (!response.ok || !data || data.error) {
    throw new Error(data?.error || `Request failed (${response.status}). Check the notebook connection.`);
  }
  if (['/upload','/generate','/furnish-room','/edit-object','/delete-object','/add-object','/recolor-object'].includes(path)) imageSource(data.image, data.mime_type);
  return data;
}
