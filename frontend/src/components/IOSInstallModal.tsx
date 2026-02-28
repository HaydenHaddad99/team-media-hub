import React, { useState, useEffect } from 'react';
import './IOSInstallModal.css';

export const IOSInstallModal: React.FC = () => {
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    // Check if on iOS Safari
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent);
    
    if (!isIOS || !isSafari) {
      return;
    }

    // Check if already dismissed
    const dismissed = localStorage.getItem('tmh_ios_install_dismissed');
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
    localStorage.setItem('tmh_ios_install_dismissed', 'true');
    setShowModal(false);
  };

  if (!showModal) {
    return null;
  }

  return (
    <div className="ios-install-overlay">
      <div className="ios-install-modal">
        <div className="ios-install-header">
          <h2>📱 Install Team Media Hub</h2>
          <button className="ios-install-close" onClick={handleDismiss}>✕</button>
        </div>

        <div className="ios-install-content">
          <p className="ios-install-intro">
            Add Team Media Hub to your home screen for quick access
          </p>

          <div className="ios-install-steps">
            <div className="ios-install-step">
              <div className="step-number">1</div>
              <div className="step-content">
                <p className="step-title">Tap the Share button</p>
                <p className="step-description">Look for the arrow pointing up at the bottom of your screen</p>
              </div>
            </div>

            <div className="ios-install-step">
              <div className="step-number">2</div>
              <div className="step-content">
                <p className="step-title">Select "Add to Home Screen"</p>
                <p className="step-description">Scroll down in the menu to find this option</p>
              </div>
            </div>

            <div className="ios-install-step">
              <div className="step-number">3</div>
              <div className="step-content">
                <p className="step-title">Confirm and Add</p>
                <p className="step-description">Tap the "Add" button in the top right corner</p>
              </div>
            </div>
          </div>

          <div className="ios-install-benefits">
            <p className="benefits-title">✨ Benefits:</p>
            <ul>
              <li>No need to visit a website</li>
              <li>Icon on your home screen</li>
              <li>Full-screen experience</li>
              <li>Faster access to your photos</li>
            </ul>
          </div>
        </div>

        <div className="ios-install-footer">
          <button className="ios-install-later" onClick={handleDismiss}>
            Maybe Later
          </button>
          <button className="ios-install-got-it" onClick={handleDismiss}>
            Got It!
          </button>
        </div>
      </div>
    </div>
  );
};
