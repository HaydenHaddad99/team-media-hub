import React, { useState, useEffect } from 'react';
import './InstallPrompt.css';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const InstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      const beforeInstallEvent = e as BeforeInstallPromptEvent;
      // Prevent the mini-infobar from appearing
      beforeInstallEvent.preventDefault();
      // Store the event for later use
      setDeferredPrompt(beforeInstallEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    // Show the install prompt
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === 'accepted') {
      console.log('[PWA] App installed');
      setShowPrompt(false);
    }

    // Clear the deferred prompt
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  if (!showPrompt || !deferredPrompt) {
    return null;
  }

  return (
    <div className="install-prompt">
      <div className="install-prompt-content">
        <h3>📲 Install Team Media Hub</h3>
        <p>Get quick access to your photos and teams right from your home screen</p>
        <div className="install-prompt-buttons">
          <button className="install-btn" onClick={handleInstall}>
            Install
          </button>
          <button className="install-dismiss-btn" onClick={handleDismiss}>
            Not Now
          </button>
        </div>
      </div>
    </div>
  );
};
