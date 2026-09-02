// Central API Service Module with Dynamic API Base URL & Safe JSON Handling

const envApiBase = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL;

export const API_BASE = envApiBase
  ? envApiBase.replace(/\/+$/, '')
  : (import.meta.env.DEV || (typeof window !== 'undefined' && window.location.hostname === 'localhost')
      ? 'http://localhost:5050/api'
      : '/api');

/**
 * Perform a fetch request and safely parse JSON response.
 * Inspects response.ok and content-type header before calling .json() to avoid
 * "Unexpected token 'T', 'The page c'... is not valid JSON" errors when backend returns HTML 404/500/504 pages.
 */
export async function safeFetch(url, options = {}) {
  const res = await fetch(url, options);
  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (!res.ok) {
    if (isJson) {
      const errData = await res.json().catch(() => ({}));
      const message = errData.detail || errData.message || errData.error || `Server error (${res.status})`;
      throw new Error(message);
    } else {
      const textError = await res.text().catch(() => "");
      const snippet = textError.length > 120 ? textError.substring(0, 120) + "..." : textError;
      throw new Error(`Backend unavailable (${res.status}): ${snippet || 'Please check backend deployment status.'}`);
    }
  }

  if (isJson) {
    return await res.json();
  } else {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Unexpected content format: Received ${contentType || 'text'} instead of valid JSON.`);
    }
  }
}

/**
 * Perform a fetch request expecting binary data / stream / response object.
 * Validates status code and error messages safely before returning raw response.
 */
export async function safeFetchRaw(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.detail || errData.message || errData.error || `Server error (${res.status})`);
    } else {
      const textError = await res.text().catch(() => "");
      const snippet = textError.length > 120 ? textError.substring(0, 120) + "..." : textError;
      throw new Error(`Backend unavailable (${res.status}): ${snippet || 'Please check backend deployment status.'}`);
    }
  }
  return res;
}
