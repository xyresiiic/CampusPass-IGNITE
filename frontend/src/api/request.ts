import type { ApiErrorDetail } from "../types";

export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, "") ||
  "https://campuspass-ignite.onrender.com";

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
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { body, token, headers = {}, ...rest } = options;
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
  const response = await fetch(`${API_URL}${cleanPath}`, {
    ...rest,
    headers: reqHeaders,
    body: finalBody,
  });

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
