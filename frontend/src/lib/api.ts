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

export async function request<T>(
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
  album_name?: string;
  thumb_key?: string | null;
  thumb_url?: string | null;
  preview_key?: string | null;
  preview_url?: string | null;
  uploader_user_id?: string | null;
  uploader_email?: string | null;
};

export async function listMedia(params?: { limit?: number; cursor?: string | null }) {
  const qs = new URLSearchParams();
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.cursor) qs.set("cursor", params.cursor);
  const query = qs.toString() ? `?${qs.toString()}` : "";
  const data = await request<{ items: MediaItem[]; next_cursor: string | null }>(`/media${query}`, {
    method: "GET",
  });
  
  // Convert relative thumbnail URLs to absolute URLs with auth token
  const token = getStoredToken();
  data.items.forEach(item => {
    if (item.thumb_url && item.thumb_url.startsWith("/")) {
      const sep = item.thumb_url.includes("?") ? "&" : "?";
      const tokenParam = token ? `${sep}token=${encodeURIComponent(token)}` : "";
      item.thumb_url = `${API_BASE_URL}${item.thumb_url}${tokenParam}`;
    }
  });
  
  return data;
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
  album_name?: string;
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

export type MeResponse = {
  team: { team_id: string; team_name: string; team_code?: string | null };
  invite: { role: "viewer" | "uploader" | "admin"; expires_at?: number };
  user_id?: string | null; // Present for coach/parent auth, absent for invite-only auth
};

export async function getMe(): Promise<MeResponse> {
  return request<MeResponse>("/me", { method: "GET" });
}

export async function createInvite(input: { role: "viewer" | "uploader"; expires_in_days?: number; team_id?: string }) {
  return request<{
    team_id: string;
    role: "viewer" | "uploader" | "admin";
    expires_in_days: number;
    invite_token: string;
    invite_url: string;
  }>(`/invites`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function getDemoInvite() {
  return request<{
    team_id: string;
    role: "uploader";
    expires_in_days: number;
    invite_token: string;
    invite_url: string;
  }>(`/demo`, {
    method: "GET",
  });
}

export async function deleteMedia(media_id: string) {
  const qs = new URLSearchParams({ media_id }).toString();
  return request<{ deleted: boolean; media_id: string }>(`/media?${qs}`, { method: "DELETE" });
}
