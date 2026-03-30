"""Tests for thumbs/thumbnail_handler.py – thumbnail and preview generation."""
import os
import io

# thumbnail_handler reads os.environ at module level—set before import
os.environ.setdefault("TABLE_MEDIA", "Media")
os.environ.setdefault("MEDIA_BUCKET", "test-media-bucket")
os.environ.setdefault("MEDIA_GSI_NAME", "gsi1")

from PIL import Image
from thumbs.thumbnail_handler import _make_thumb, _parse_key, _is_image, _is_video, KEY_RE, MAX_SIZE


def _make_test_image(width=800, height=600, mode="RGB") -> bytes:
    """Create a simple test image in memory."""
    im = Image.new(mode, (width, height), color=(255, 0, 0))
    buf = io.BytesIO()
    im.save(buf, format="JPEG")
    return buf.getvalue()


class TestParseKey:
    def test_valid_key(self):
        result = _parse_key("media/team-1/media-abc/photo.jpg")
        assert result == {"team_id": "team-1", "media_id": "media-abc", "filename": "photo.jpg"}

    def test_invalid_key(self):
        assert _parse_key("invalid/path") is None

    def test_key_with_nested_filename(self):
        result = _parse_key("media/t1/m1/sub/folder/photo.jpg")
        assert result is not None
        assert result["filename"] == "sub/folder/photo.jpg"


class TestIsImage:
    def test_jpeg(self):
        assert _is_image("image/jpeg") is True

    def test_png(self):
        assert _is_image("image/png") is True

    def test_video(self):
        assert _is_image("video/mp4") is False

    def test_empty(self):
        assert _is_image("") is False


class TestMakeThumb:
    def test_produces_jpeg(self):
        src = _make_test_image(800, 600)
        thumb_bytes = _make_thumb(src)
        im = Image.open(io.BytesIO(thumb_bytes))
        assert im.format == "JPEG"

    def test_thumbnail_within_bounds(self):
        src = _make_test_image(2000, 1500)
        thumb_bytes = _make_thumb(src)
        im = Image.open(io.BytesIO(thumb_bytes))
        assert im.width <= MAX_SIZE
        assert im.height <= MAX_SIZE

    def test_small_image_not_upscaled(self):
        src = _make_test_image(100, 80)
        thumb_bytes = _make_thumb(src)
        im = Image.open(io.BytesIO(thumb_bytes))
        # Should stay at original size (not upscaled to MAX_SIZE)
        assert im.width <= 100
        assert im.height <= 80

    def test_rgba_converted_to_rgb(self):
        # Create RGBA image (e.g. PNG with transparency)
        rgba_img = Image.new("RGBA", (200, 200), color=(255, 0, 0, 128))
        buf = io.BytesIO()
        rgba_img.save(buf, format="PNG")
        src = buf.getvalue()

        thumb_bytes = _make_thumb(src)
        im = Image.open(io.BytesIO(thumb_bytes))
        assert im.mode == "RGB"

    def test_landscape_ratio_preserved(self):
        src = _make_test_image(1600, 800)
        thumb_bytes = _make_thumb(src)
        im = Image.open(io.BytesIO(thumb_bytes))
        # Width should be larger than height for landscape
        assert im.width > im.height

    def test_portrait_ratio_preserved(self):
        src = _make_test_image(600, 1200)
        thumb_bytes = _make_thumb(src)
        im = Image.open(io.BytesIO(thumb_bytes))
        assert im.height > im.width

    def test_square_image(self):
        src = _make_test_image(1000, 1000)
        thumb_bytes = _make_thumb(src)
        im = Image.open(io.BytesIO(thumb_bytes))
        assert im.width == im.height
        assert im.width <= MAX_SIZE


class TestIsVideo:
    def test_mp4(self):
        assert _is_video("video/mp4") is True

    def test_quicktime(self):
        assert _is_video("video/quicktime") is True

    def test_webm(self):
        assert _is_video("video/webm") is True

    def test_image(self):
        assert _is_video("image/jpeg") is False

    def test_empty(self):
        assert _is_video("") is False


class TestMakeVideoThumb:
    """Tests for _make_video_thumb using a mocked subprocess.run."""

    def test_calls_ffmpeg_and_returns_jpeg(self, tmp_path, monkeypatch):
        """_make_video_thumb should call ffmpeg and return the output JPEG bytes."""
        import subprocess
        from thumbs import thumbnail_handler

        # Create a fake JPEG to act as the ffmpeg output
        fake_jpeg = Image.new("RGB", (300, 200), color=(0, 128, 0))
        fake_jpeg_buf = io.BytesIO()
        fake_jpeg.save(fake_jpeg_buf, format="JPEG")
        fake_jpeg_bytes = fake_jpeg_buf.getvalue()

        def fake_run(cmd, **kwargs):
            # Write a valid JPEG to the output path (last positional arg)
            out_path = cmd[-1]
            with open(out_path, "wb") as f:
                f.write(fake_jpeg_bytes)

        monkeypatch.setattr(subprocess, "run", fake_run)

        result = thumbnail_handler._make_video_thumb(b"fake-video-bytes")

        im = Image.open(io.BytesIO(result))
        assert im.format == "JPEG"
        assert im.size == (300, 200)

    def test_raises_on_ffmpeg_failure(self, monkeypatch):
        """_make_video_thumb should propagate ffmpeg errors."""
        import subprocess
        from thumbs import thumbnail_handler

        def fake_run(cmd, **kwargs):
            raise subprocess.CalledProcessError(1, cmd)

        monkeypatch.setattr(subprocess, "run", fake_run)

        import pytest
        with pytest.raises(subprocess.CalledProcessError):
            thumbnail_handler._make_video_thumb(b"bad-video")
