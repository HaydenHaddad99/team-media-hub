import React, { useState, useEffect } from 'react';
import { AppStoreBadge } from './AppStoreBadge';
import './IOSInstallModal.css';

/**
 * Invites iPhone users to the native App Store app.
 *
 * Previously this walked them through "Add to Home Screen" to install the
 * PWA; now that a real iOS app ships, the native app is the better
 * destination (push notifications, save-to-Photos, full-screen viewer).
 * Android is untouched — InstallPrompt still offers the PWA install there,
 * which remains the best option until a Play Store app exists.
 */
export const IOSInstallModal: React.FC = () => {
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);

    if (!isIOS || !isSafari) {
      return;
    }

    // Already running as an installed app (home-screen PWA or the native
    // shell) — nothing to advertise.
    const isStandalone =
      window.matchMedia?.('(display-mode: standalone)').matches ||
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (isStandalone) {
      return;
    }

    const dismissed = localStorage.getItem('tmh_ios_appstore_dismissed');
    if (dismissed) {
      return;
    }

    // Show once authenticated (check multiple token keys)
    const hasInviteToken = localStorage.getItem('tmh_invite_token');
    const hasTeamId = localStorage.getItem('team_id');
    const hasUserToken = localStorage.getItem('tmh_user_token');

    if (hasInviteToken || (hasUserToken && hasTeamId)) {
      // Show after short delay to avoid overwhelming user
      setTimeout(() => {
        setShowModal(true);
      }, 2000);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('tmh_ios_appstore_dismissed', 'true');
    setShowModal(false);
  };

  if (!showModal) {
    return null;
  }

  return (
    <div className="ios-install-overlay">
      <div className="ios-install-modal">
        <div className="ios-install-header">
          <h2>📱 Get the iPhone app</h2>
          <button className="ios-install-close" onClick={handleDismiss} aria-label="Close">✕</button>
        </div>

        <div className="ios-install-content">
          <p className="ios-install-intro">
            Team Media Hub is on the App Store — free, and built for your phone.
          </p>

          <div className="ios-install-benefits">
            <ul>
              <li>Get notified when new photos are added</li>
              <li>Save photos and videos straight to your camera roll</li>
              <li>Full-screen photo viewing</li>
              <li>Opens right from your home screen</li>
            </ul>
          </div>

          <div className="ios-install-badge-row">
            <AppStoreBadge />
          </div>
        </div>

        <div className="ios-install-footer">
          <button className="ios-install-later" onClick={handleDismiss}>
            Maybe Later
          </button>
        </div>
      </div>
    </div>
  );
};
