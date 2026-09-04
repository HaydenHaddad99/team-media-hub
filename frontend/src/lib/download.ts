import { isNativePlatform } from "./platform";

export type DownloadableFile = {
  url: string;
  filename: string;
};

/**
 * Save media to the user's device.
 *
 * Web: opens the presigned URL in a new tab and lets the browser handle the
 * download (unchanged behavior).
 *
 * Native (Capacitor): fetches the file(s), writes them to the app's cache,
 * and presents the system share sheet — which on iOS/Android includes
 * "Save Image"/"Save Video" to the photo library. window.open would bounce
 * the user out of the app into their browser instead.
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
  const { Share } = await import("@capacitor/share");

  const written: string[] = [];
  const paths: string[] = [];
  try {
    for (const f of files) {
      const resp = await fetch(f.url);
      if (!resp.ok) throw new Error(`Download failed (${resp.status})`);
      const blob = await resp.blob();
      const base64 = await blobToBase64(blob);
      // filenames come from user uploads; strip path separators defensively
      const safeName = f.filename.replace(/[/\\]/g, "_") || "media";
      const path = `tmh-download-${Date.now()}-${safeName}`;
      const result = await Filesystem.writeFile({
        path,
        data: base64,
        directory: Directory.Cache,
      });
      written.push(result.uri);
      paths.push(path);
    }

    await Share.share({ files: written });
  } catch (err: any) {
    // Dismissing the share sheet rejects with a cancellation message —
    // that's a normal user action, not a failure.
    const msg = String(err?.message || err);
    if (/cancel/i.test(msg)) return;
    throw err;
  } finally {
    for (const path of paths) {
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
