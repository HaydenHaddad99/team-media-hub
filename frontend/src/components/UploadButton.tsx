import React, { useRef, useState, useEffect } from "react";
import heic2any from "heic2any";
import { completeUpload, presignUpload, putFileToPresignedUrl } from "../lib/api";

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
]);

function isHeic(file: File) {
  const t = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  return t === "image/heic" || t === "image/heif" || name.endsWith(".heic") || name.endsWith(".heif");
}

function replaceExt(name: string, newExt: string) {
  const idx = name.lastIndexOf(".");
  if (idx === -1) return `${name}.${newExt}`;
  return `${name.slice(0, idx)}.${newExt}`;
}

async function convertHeicToJpeg(file: File): Promise<File> {
  // Normalize type if missing
  const buffer = await file.arrayBuffer();
  const normalizedType = file.type || (isHeic(file) ? "image/heic" : "image/heif");
  const normalized = new Blob([buffer], { type: normalizedType });

  // Primary: heic2any (libheif). Fallback: native decode via createImageBitmap (Safari supports HEIC natively).
  const tryHeic2Any = async () => {
    const result = await heic2any({
      blob: normalized,
      toType: "image/jpeg",
      quality: 0.85,
    });
    return Array.isArray(result) ? result[0] : result;
  };

  const tryNativeCanvas = async () => {
    if (typeof createImageBitmap !== "function") throw new Error("Native decode unavailable");
    const bitmap = await createImageBitmap(normalized);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unsupported");
    ctx.drawImage(bitmap, 0, 0);
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85)
    );
    if (!blob) throw new Error("JPEG encode failed");
    return blob;
  };

  let out: Blob;
  try {
    out = await tryHeic2Any();
  } catch (err) {
    console.warn("heic2any failed, attempting native decode", err);
    out = await tryNativeCanvas();
  }

  const jpegName = replaceExt(file.name || "photo.heic", "jpg");
  return new File([out], jpegName, { type: "image/jpeg" });
}

export function UploadButton({ onUploaded, defaultAlbum }: { onUploaded: () => void; defaultAlbum?: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [album, setAlbum] = useState<string>(defaultAlbum || "");

  useEffect(() => {
    setAlbum(defaultAlbum || "");
  }, [defaultAlbum]);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;

    const files = Array.from(fileList);
    setErr(null);

    // Validate all files first
    for (const file of files) {
      const type = file.type || "";
      const allowedByTypeOrExt = ALLOWED.has(type) || isHeic(file);
      if (!allowedByTypeOrExt) {
        setErr(`Unsupported file type: ${type || "unknown"} (${file.name})`);
        e.target.value = "";
        return;
      }
    }

    try {
      setBusy(true);
      let anyUploaded = false;

      // Upload files sequentially
      for (let i = 0; i < files.length; i++) {
        const picked = files[i];
        setStatus(`Processing ${i + 1} of ${files.length}…`);

        // Convert HEIC -> JPEG for compatibility + thumbnail generation
        let file = picked;
        if (isHeic(picked)) {
          setStatus(`Converting ${i + 1} of ${files.length} (HEIC to JPEG)…`);
          try {
            file = await convertHeicToJpeg(picked);
          } catch (convErr: any) {
            console.error("HEIC conversion failed", convErr);
            throw new Error(`Could not parse HEIC file: ${picked.name}`);
          }
        }

        setStatus(`Uploading ${i + 1} of ${files.length}…`);
        const presign = await presignUpload({
          filename: file.name,
          content_type: file.type,
          size_bytes: file.size,
        });

        await putFileToPresignedUrl(
          presign.upload_url,
          file,
          presign.required_headers["content-type"]
        );

        setStatus(`Finalizing ${i + 1} of ${files.length}…`);
        await completeUpload({
          media_id: presign.media_id,
          object_key: presign.object_key,
          filename: file.name,
          content_type: file.type,
          size_bytes: file.size,
          album_name: (album.trim() || (defaultAlbum || "").trim()) || undefined,
        });

        anyUploaded = true;
      }

      setStatus(null);
      if (anyUploaded) {
        onUploaded();
      }
    } catch (ex: any) {
      console.error("Upload error:", ex);
      setErr(ex?.message || "Upload failed");
    } finally {
      setBusy(false);
      setStatus(null);
      e.target.value = "";
      // Preserve defaultAlbum; clear manual entry if present
      setAlbum(defaultAlbum || "");
    }
  }

  return (
    <div className="uploadRow">
      {defaultAlbum && defaultAlbum.trim().length > 0 ? (
        <div className="muted" style={{ minWidth: 200 }}>
          Uploading to album: <b>{defaultAlbum}</b>
        </div>
      ) : (
        <input
          type="text"
          placeholder="Album (optional)"
          value={album}
          onChange={(e) => setAlbum(e.target.value)}
          className="input"
          disabled={busy}
          style={{ minWidth: 200, marginRight: 8 }}
        />
      )}
      <input
        ref={inputRef}
        type="file"
        multiple
        // include .heic explicitly because some browsers don't set image/heic reliably
        accept="image/*,.heic,video/mp4,video/quicktime"
        onChange={handlePick}
        hidden
      />
      <button
        className="btn primary"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? status || "Uploading..." : "Upload"}
      </button>
      {busy && status?.startsWith("Converting") ? (
        <div className="muted" style={{ marginTop: 8 }}>
          Conversion happens locally in your browser.
        </div>
      ) : null}
      {err ? <div className="error">{err}</div> : null}
    </div>
  );
}
