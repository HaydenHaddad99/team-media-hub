import React, { useRef, useState } from "react";
import { completeUpload, presignUpload, putFileToPresignedUrl } from "../lib/api";

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/heic",
  "video/mp4",
  "video/quicktime",
]);

export function UploadButton({ onUploaded }: { onUploaded: () => void }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setErr(null);

    if (!ALLOWED.has(file.type)) {
      setErr(`Unsupported file type: ${file.type || "unknown"}`);
      e.target.value = "";
      return;
    }

    try {
      setBusy(true);

      const presign = await presignUpload({
        filename: file.name,
        content_type: file.type,
        size_bytes: file.size,
      });

      await putFileToPresignedUrl(presign.upload_url, file, presign.required_headers["content-type"]);

      await completeUpload({
        media_id: presign.media_id,
        object_key: presign.object_key,
        filename: file.name,
        content_type: file.type,
        size_bytes: file.size,
      });

      onUploaded();
    } catch (ex: any) {
      setErr(ex?.message || "Upload failed");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div className="uploadRow">
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/mp4,video/quicktime"
        onChange={handlePick}
        hidden
      />
      <button
        className="btn primary"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? "Uploading..." : "Upload"}
      </button>
      {err ? <div className="error">{err}</div> : null}
    </div>
  );
}
