import React from "react";

/** Public App Store listing for the iOS app. */
export const APP_STORE_URL = "https://apps.apple.com/us/app/team-media-hub/id6797296928";

type Props = {
  /** Extra class for layout/spacing at the call site. */
  className?: string;
};

/**
 * "Download on the App Store" badge linking to the iOS listing.
 *
 * Shown on every platform on purpose: a coach on a laptop or an Android
 * phone should still learn the iPhone app exists so they can tell parents
 * about it. The link just opens the App Store page, so it's never a dead end.
 */
export function AppStoreBadge({ className }: Props) {
  return (
    <a
      className={`app-store-badge${className ? ` ${className}` : ""}`}
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Download Team Media Hub on the App Store"
    >
      <img src="/app-store-badge.svg" alt="Download on the App Store" width={120} height={40} />
    </a>
  );
}
