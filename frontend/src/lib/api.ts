export type ApiError = {
  error?: { message?: string; code?: string };
};

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string || "").replace(/\/+$/, "");

function getStoredToken(): string | null {
  return localStorage.getItem("tmh_invite_token");
}

export function setStoredToken(token: string) {
  localStorage.setItem("tmh_invite_token", token);
}

export function clearStoredToken() {
  localStorage.removeItem("tmh_invite_token");
}

export function requireApiBaseUrl() {
  if (!API_BASE_URL) {
    throw new Error("Missing VITE_API_BASE_URL. Set it in frontend/.env");
  }
}

async function request<T>(
  path: string,
  opts: RequestInit & { token?: string } = {}
): Promise<T> {
  requireApiBaseUrl();

  const token = opts.token ?? getStoredToken() ?? undefined;

  const headers: Record<string, string> = {
    ...(opts.headers as Record<string, string> | undefined),
  };

  // Attach invite token if present
  if (token) headers["x-invite-token"] = token;

  // Default JSON content type for requests with body
  const hasBody = !!opts.body;
  if (hasBody && !headers["content-type"]) headers["content-type"] = "application/json";

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...opts,
    headers,
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg =
      (json as ApiError)?.error?.message ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }

  return json as T;
}

export type MediaItem = {
  team_id: string;
  media_id: string;
  object_key: string;
  filename: string;
  content_type: string;
  size_bytes: number;
  created_at: number;
};

export async function listMedia(params?: { limit?: number; cursor?: string | null }) {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.cursor) qs.set("cursor", params.cursor);
  const query = qs.toString() ? `?${qs.toString()}` : "";
  return request<{ items: MediaItem[]; next_cursor: string | null }>(`/media${query}`, {
    method: "GET",
  });
}

export async function presignUpload(input: {
  filename: string;
  content_type: string;
  size_bytes: number;
}) {
  return request<{
    media_id: string;
    object_key: string;
    upload_url: string;
    expires_in: number;
    required_headers: { "content-type": string };
  }>(`/media/upload-url`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function completeUpload(input: {
  media_id: string;
  object_key: string;
  filename: string;
  content_type: string;
  size_bytes: number;
}) {
  return request<{ ok: boolean; media_id: string }>(`/media/complete`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function presignDownload(media_id: string) {
  const qs = new URLSearchParams({ media_id });
  return request<{ download_url: string; expires_in: number }>(`/media/download-url?${qs.toString()}`, {
    method: "GET",
  });
}

export async function putFileToPresignedUrl(uploadUrl: string, file: File, contentType: string) {
  // IMPORTANT: must match the ContentType used during presign
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "content-type": contentType,
    },
    body: file,
  });

  if (!res.ok) {
    throw new Error(`Upload failed (${res.status})`);
  }
}

export function getTokenFromUrl(): string | null {
  const u = new URL(window.location.href);
  const token = u.searchParams.get("token");
  return token && token.trim().length > 10 ? token.trim() : null;
}

export function getCurrentToken(): string | null {
  return getStoredToken();
}

export type UserInfo = {
  team_id: string;
  role: string;
};

export async function getMe(): Promise<UserInfo> {
  return request<UserInfo>("/me", { method: "GET" });
}
