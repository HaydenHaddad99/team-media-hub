import React, { useState } from 'react';
import { validateFile, formatFileSize } from '../lib/validation';
import { presignUpload, putFileToPresignedUrl, completeUpload } from '../lib/api';
import '../styles/UploadForm.css';

interface UploadFormProps {
  token: string;
  onUploadComplete: () => void;
}

export const UploadForm: React.FC<UploadFormProps> = ({ token, onUploadComplete }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const validation = validateFile(selectedFile);
    if (!validation.valid) {
      setError(validation.error || 'Invalid file');
      setFile(null);
      return;
    }

    setError(null);
    setFile(selectedFile);
  };

  const handleUpload = async () => {
    if (!file) return;

    try {
      setLoading(true);
      setError(null);
      setProgress(0);

      // Step 1: Get presigned URL
      const uploadResponse = await presignUpload({
        filename: file.name,
        content_type: file.type,
        size_bytes: file.size,
      });

      const { upload_url: uploadUrl, media_id: mediaId, object_key: objectKey } = uploadResponse;

      // Step 2: Upload to S3
      setProgress(50);
      await putFileToPresignedUrl(uploadUrl, file, file.type);

      // Step 3: Mark as complete
      setProgress(75);
      await completeUpload({
        media_id: mediaId,
        object_key: objectKey,
        filename: file.name,
        content_type: file.type,
        size_bytes: file.size,
      });

      setProgress(100);
      setFile(null);
      setError(null);
      
      // Reset form
      setTimeout(() => {
        setProgress(0);
        onUploadComplete();
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setProgress(0);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="upload-form">
      <h2>Upload Media</h2>

      <div className="file-input-wrapper">
        <input
          type="file"
          id="file-input"
          onChange={handleFileSelect}
          disabled={loading}
          accept="image/jpeg,image/png,image/heic,video/mp4,video/quicktime"
        />
        <label htmlFor="file-input" className="file-label">
          {file ? file.name : 'Choose file or drag & drop'}
        </label>
      </div>

      {file && (
        <div className="file-info">
          <p>{formatFileSize(file.size)}</p>
          <p className="file-type">{file.type}</p>
        </div>
      )}

      {error && <div className="error">{error}</div>}

      {progress > 0 && (
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }}></div>
          <span className="progress-text">{progress}%</span>
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={!file || loading}
        className="upload-btn"
      >
        {loading ? 'Uploading...' : 'Upload'}
      </button>
    </div>
  );
};
