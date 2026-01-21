import React, { useState, useEffect } from "react";
import { clearStoredToken, getMe, UserInfo } from "../lib/api";
import { UploadButton } from "../components/UploadButton";
import { MediaGallery } from "../components/MediaGallery";

export function AppPage({ onLogout }: { onLogout: () => void }) {
  const [refresh, setRefresh] = useState(0);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  useEffect(() => {
    getMe()
      .then(setUserInfo)
      .catch((err) => {
        console.error("Failed to fetch user info:", err);
      });
  }, []);

  function handleLogout() {
    clearStoredToken();
    onLogout();
  }

  function handleUploaded() {
    setRefresh((r) => r + 1);
  }

  const canUpload = userInfo?.role === "uploader" || userInfo?.role === "admin";

  return (
    <div className="appPage">
      <header className="appHeader">
        <h1>Team Media Hub</h1>
        <button className="btn secondary" onClick={handleLogout}>
          Logout
        </button>
      </header>

      <main className="appMain">
        <div className="appContainer">
          <div className="sidebar">
            {canUpload && <UploadButton onUploaded={handleUploaded} />}
          </div>
          <div className="content">
            <MediaGallery refresh={refresh} />
          </div>
        </div>
      </main>
    </div>
  );
}
