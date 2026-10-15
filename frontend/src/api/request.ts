import type { ApiErrorDetail } from "../types";

export function getApiBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "");

  if (typeof window !== "undefined" && window.location) {
    const currentHost = window.location.hostname;
    // If accessing from another device (e.g. phone on local Wi-Fi) while
    // VITE_API_URL is configured for loopback (localhost or 127.0.0.1),
    // automatically rewrite the host to point to the current machine.
    if (envUrl) {
      try {
        const parsed = new URL(envUrl);
        if (
          (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") &&
          currentHost &&
          currentHost !== "localhost" &&
          currentHost !== "127.0.0.1"
        ) {
          parsed.hostname = currentHost;
          return parsed.origin;
        }
      } catch {
        // Fall back to envUrl
      }
      return envUrl;
    }

    if (currentHost && currentHost !== "localhost" && currentHost !== "127.0.0.1") {
      return `http://${currentHost}:8100`;
    }
  }

  return envUrl || "https://campuspass-ignite.onrender.com";
}

export const API_URL: string = getApiBaseUrl();

let authToken: string | null = null;
let unauthorizedListener: (() => void) | null = null;

export function setApiAuthToken(token: string | null): void {
  authToken = token;
}

export function setUnauthorizedListener(listener: (() => void) | null): void {
  unauthorizedListener = listener;
}

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

export function parseErrorDetail(data: unknown, status: number): string {
  if (data && typeof data === "object" && "detail" in data) {
    const detail = (data as { detail: unknown }).detail;
    if (typeof detail === "string") {
      return detail;
    }
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item: ApiErrorDetail) => (typeof item === "object" && item?.msg ? item.msg : String(item)))
        .filter(Boolean);
      if (messages.length > 0) {
        return messages.join("; ");
      }
    }
  }

  if (status === 401) return "Your session has expired. Please log in again.";
  if (status === 403) return "Access denied. You do not have permission for this action.";
  if (status === 404) return "Requested resource was not found.";
  if (status === 503) return "Server is temporarily unavailable. Please retry in a few moments.";
  if (status >= 500) return `Internal server error (${status}). Please try again later.`;

  return `Request failed with status ${status}.`;
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { body, token, headers = {}, timeoutMs = 35000, signal, ...rest } = options;
  const activeToken = token !== undefined ? token : authToken;

  const reqHeaders: Record<string, string> = {
    Accept: "application/json",
    ...((headers as Record<string, string>) || {}),
  };

  if (activeToken) {
    reqHeaders.Authorization = `Bearer ${activeToken}`;
  }

  let finalBody: BodyInit | undefined;
  if (body !== undefined && body !== null) {
    if (typeof body === "string" || body instanceof FormData || body instanceof Blob) {
      finalBody = body as BodyInit;
    } else {
      reqHeaders["Content-Type"] = "application/json";
      finalBody = JSON.stringify(body);
    }
  }

  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const baseUrl = getApiBaseUrl();

  // Setup abort controller for timeout if caller hasn't passed one
  let activeSignal = signal;
  let timerId: ReturnType<typeof setTimeout> | undefined;

  if (!activeSignal && timeoutMs > 0) {
    const controller = new AbortController();
    activeSignal = controller.signal;
    timerId = setTimeout(() => controller.abort(), timeoutMs);
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${cleanPath}`, {
      ...rest,
      headers: reqHeaders,
      body: finalBody,
      signal: activeSignal,
    });
  } catch (fetchErr) {
    if (timerId) clearTimeout(timerId);
    if (fetchErr instanceof Error && fetchErr.name === "AbortError") {
      throw new ApiError(
        "Request timed out. The server is taking longer than usual to respond.",
        504
      );
    }
    const isNetworkError =
      fetchErr instanceof TypeError ||
      (fetchErr instanceof Error &&
        (fetchErr.message.includes("Failed to fetch") ||
          fetchErr.message.includes("NetworkError")));

    if (isNetworkError) {
      throw new ApiError(
        `Unable to reach backend server at ${baseUrl}. Please check that the server is running and reachable from your device.`,
        0
      );
    }
    throw fetchErr;
  } finally {
    if (timerId) clearTimeout(timerId);
  }

  if (response.status === 401) {
    if (unauthorizedListener) {
      unauthorizedListener();
    }
  }

  const contentType = response.headers.get("content-type") || "";
  let responseData: unknown = null;
  if (contentType.includes("application/json")) {
    try {
      responseData = await response.json();
    } catch {
      responseData = null;
    }
  } else {
    try {
      responseData = await response.text();
    } catch {
      responseData = null;
    }
  }

  if (!response.ok) {
    const errorMsg = parseErrorDetail(responseData, response.status);
    throw new ApiError(errorMsg, response.status, responseData);
  }

  return responseData as T;
}

export async function downloadCsvBlob(path: string, defaultFilename: string): Promise<void> {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const headers: Record<string, string> = {};
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_URL}${cleanPath}`, { headers });
  if (!response.ok) {
    let errorDetail = "Failed to export CSV.";
    try {
      const err = await response.json();
      errorDetail = parseErrorDetail(err, response.status);
    } catch {
      // ignore
    }
    throw new ApiError(errorDetail, response.status);
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = defaultFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(url);
}
