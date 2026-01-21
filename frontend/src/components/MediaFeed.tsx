import React, { useState, useEffect } from 'react';
import { listMedia, presignDownload } from '../lib/api';
import { formatFileSize } from '../lib/validation';
import '../styles/MediaFeed.css';

interface MediaItem {
  media_id: string;
  filename: string;
  size_bytes: number;
  created_at: number;
}

interface MediaFeedProps {
  token: string;
  refreshTrigger?: number;
}

export const MediaFeed: React.FC<MediaFeedProps> = ({ token, refreshTrigger = 0 }) => {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchMedia();
  }, [token, refreshTrigger]);

  const fetchMedia = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await listMedia();
      setItems(response.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load media');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (mediaId: string) => {
    try {
      const response = await presignDownload(mediaId);
      window.open(response.download_url, '_blank');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Download failed');
    }
  };

  if (loading) {
    return <div className="media-feed loading">Loading...</div>;
  }

  if (error) {
    return <div className="media-feed error">Error: {error}</div>;
  }

  if (items.length === 0) {
    return <div className="media-feed empty">No media yet. Upload something!</div>;
  }

  return (
    <div className="media-feed">
      <h2>Media Library ({items.length})</h2>
      <div className="media-grid">
        {items.map((item) => (
          <div key={item.media_id} className="media-item">
            <div className="media-info">
              <p className="filename">{item.filename}</p>
              <p className="size">{formatFileSize(item.size_bytes)}</p>
            </div>
            <button
              className="download-btn"
              onClick={() => handleDownload(item.media_id)}
            >
              Download
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
