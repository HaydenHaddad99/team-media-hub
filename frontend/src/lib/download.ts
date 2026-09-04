import { isNativePlatform } from "./platform";

export type DownloadableFile = {
  url: string;
  filename: string;
};

const VIDEO_EXTENSIONS = /\.(mp4|mov|m4v|webm|avi|mkv)$/i;

/**
 * Save media to the user's device.
 *
 * Web: opens the presigned URL in a new tab and lets the browser handle the
 * download (unchanged behavior).
 *
 * Native (Capacitor): fetches the file, writes it to the app cache, and saves
 * it directly into the photo library via @capacitor-community/media (iOS asks
 * once for add-to-Photos permission). The share-sheet approach was abandoned:
 * on iOS 26 UIActivityViewController failed to load cache-file items and
 * self-dismissed as "Share canceled" without ever presenting.
 */
export async function saveMediaToDevice(files: DownloadableFile[]): Promise<void> {
  if (files.length === 0) return;

  if (!isNativePlatform()) {
    for (const f of files) {
      window.open(f.url, "_blank");
      // stagger so popup blocking doesn't swallow all but the first tab
      if (files.length > 1) await new Promise((r) => setTimeout(r, 200));
    }
    return;
  }

  const { Filesystem, Directory } = await import("@capacitor/filesystem");
  const { Media } = await import("@capacitor-community/media");

  for (const f of files) {
    const resp = await fetch(f.url);
    if (!resp.ok) throw new Error(`Download failed (${resp.status})`);
    const blob = await resp.blob();
    const base64 = await blobToBase64(blob);
    // filenames come from user uploads; strip path separators defensively
    const safeName = f.filename.replace(/[/\\]/g, "_") || "media";
    const path = `tmh-download-${Date.now()}-${safeName}`;
    const { uri } = await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Cache,
    });
    try {
      const isVideo = blob.type.startsWith("video/") || VIDEO_EXTENSIONS.test(safeName);
      if (isVideo) {
        await Media.saveVideo({ path: uri });
      } else {
        await Media.savePhoto({ path: uri });
      }
    } finally {
      Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => {});
    }
  }
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onloadend = () => {
      // result is "data:<mime>;base64,<data>" — Filesystem wants just <data>
      const dataUrl = reader.result as string;
      resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}
