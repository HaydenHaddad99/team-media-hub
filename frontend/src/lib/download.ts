import { isNativePlatform } from "./platform";

export type DownloadableFile = {
  url: string;
  filename: string;
  contentType?: string;
};

const VIDEO_EXTENSIONS = /\.(mp4|mov|m4v|webm|avi|mkv)$/i;

function isVideo(file: DownloadableFile): boolean {
  if (file.contentType) return file.contentType.startsWith("video/");
  return VIDEO_EXTENSIONS.test(file.filename);
}

/**
 * Save media to the user's device.
 *
 * Web: opens the presigned URL in a new tab and lets the browser handle the
 * download (unchanged behavior).
 *
 * Native (Capacitor): hands the presigned URL straight to
 * @capacitor-community/media, whose iOS/Android implementations download it
 * natively (URLSession / SDWebImage) and write it into the photo library.
 *
 * Deliberately does NOT fetch the bytes in JS first: base64-encoding a video
 * inflates it ~33% inside the WebView's memory and was failing on real
 * devices. Downloading natively also sidesteps CORS entirely.
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

  const { Media } = await import("@capacitor-community/media");

  for (const f of files) {
    if (isVideo(f)) {
      await Media.saveVideo({ path: f.url });
    } else {
      await Media.savePhoto({ path: f.url });
    }
  }
}
