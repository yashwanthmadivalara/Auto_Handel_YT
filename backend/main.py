from pathlib import Path
from uuid import uuid4
import json
import re
import shutil
import subprocess
from typing import Literal

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

BASE = Path(__file__).resolve().parent
DATA = BASE / "data"
UPLOADS = DATA / "uploads"
OUTPUTS = DATA / "outputs"
for folder in (UPLOADS, OUTPUTS):
    folder.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Local ScaleClip API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/media", StaticFiles(directory=str(DATA)), name="media")

VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"}


def require_tool(name: str):
    if shutil.which(name) is None:
        raise HTTPException(
            status_code=500,
            detail=f"{name} was not found. Install FFmpeg and make sure {name} is on PATH, then restart the backend."
        )


def safe_media_file(filename: str, allowed_dir: Path) -> Path:
    # Only accept a simple file name; never allow path traversal.
    if not filename or Path(filename).name != filename or filename in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid filename.")
    path = (allowed_dir / filename).resolve()
    if path.parent != allowed_dir.resolve() or not path.is_file():
        raise HTTPException(status_code=404, detail="Video file not found.")
    return path


def get_duration(path: Path) -> float:
    require_tool("ffprobe")
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(path)],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0:
        raise HTTPException(status_code=422, detail="Could not read this video. Check that it is a valid video file.")
    try:
        return max(0.0, float(result.stdout.strip()))
    except ValueError:
        raise HTTPException(status_code=422, detail="Could not determine video duration.")


def video_info(path: Path, filename: str, folder: Path) -> dict:
    duration = get_duration(path)
    return {
        "filename": filename,
        "duration": round(duration, 2),
        "size_bytes": path.stat().st_size,
        "url": f"http://127.0.0.1:8000/media/{folder.name}/{filename}",
    }


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "ffmpeg_available": shutil.which("ffmpeg") is not None,
        "ffprobe_available": shutil.which("ffprobe") is not None,
    }


@app.post("/api/upload")
async def upload_video(file: UploadFile = File(...)):
    original = Path(file.filename or "video.mp4")
    ext = original.suffix.lower()
    if ext not in VIDEO_EXTS:
        raise HTTPException(status_code=415, detail=f"Unsupported extension {ext or '(none)'}. Use a video file such as MP4, MOV, MKV, or WebM.")
    name = f"{uuid4().hex[:12]}{ext}"
    dest = UPLOADS / name
    total = 0
    max_bytes = 4 * 1024 * 1024 * 1024  # 4 GiB starter limit
    try:
        with dest.open("wb") as out:
            while chunk := await file.read(1024 * 1024):
                total += len(chunk)
                if total > max_bytes:
                    out.close()
                    dest.unlink(missing_ok=True)
                    raise HTTPException(status_code=413, detail="Video exceeds the 4 GiB starter upload limit.")
                out.write(chunk)
    finally:
        await file.close()
    try:
        return video_info(dest, name, UPLOADS)
    except Exception:
        dest.unlink(missing_ok=True)
        raise


class YouTubeRequest(BaseModel):
    url: str = Field(min_length=8, max_length=2000)


@app.post("/api/youtube")
def import_youtube(body: YouTubeRequest):
    # Require an actual YouTube URL; yt-dlp handles extraction details.
    if not re.match(r"^https?://(www\.)?(youtube\.com|youtu\.be)/", body.url.strip(), re.I):
        raise HTTPException(status_code=400, detail="Enter a valid youtube.com or youtu.be URL.")
    require_tool("ffmpeg")
    require_tool("ffprobe")
    out_template = str(UPLOADS / f"{uuid4().hex[:12]}.%(ext)s")
    cmd = [
        shutil.which("yt-dlp") or "yt-dlp",
        "--no-playlist", "--restrict-filenames",
        "-f", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b",
        "--merge-output-format", "mp4",
        "-o", out_template, body.url.strip()
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="yt-dlp was not found. Install backend requirements and restart the API.")
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Download timed out. Try a shorter video or check your connection.")
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "yt-dlp could not download this video.")[-1800:]
        raise HTTPException(status_code=422, detail=detail)
    candidates = sorted(UPLOADS.glob(Path(out_template).name.replace("%(ext)s", "*")), key=lambda p: p.stat().st_mtime, reverse=True)
    candidates = [p for p in candidates if p.is_file() and p.suffix.lower() in VIDEO_EXTS]
    if not candidates:
        raise HTTPException(status_code=500, detail="Download finished but no video file was found.")
    path = candidates[0]
    return video_info(path, path.name, UPLOADS)


class ClipRequest(BaseModel):
    filename: str
    start: float = Field(ge=0)
    end: float = Field(gt=0)
    aspect_ratio: Literal["9:16", "16:9", "1:1"] = "9:16"


@app.post("/api/clip")
def create_clip(body: ClipRequest):
    require_tool("ffmpeg")
    src = safe_media_file(body.filename, UPLOADS)
    duration = get_duration(src)
    if body.end <= body.start:
        raise HTTPException(status_code=400, detail="End time must be greater than start time.")
    if body.end > duration + 0.25:
        raise HTTPException(status_code=400, detail=f"End time exceeds video duration ({duration:.2f} seconds).")
    clip_duration = body.end - body.start
    if clip_duration > 600:
        raise HTTPException(status_code=400, detail="Clip length is limited to 10 minutes in this starter version.")

    dimensions = {
        "9:16": (1080, 1920),
        "16:9": (1920, 1080),
        "1:1": (1080, 1080),
    }
    width, height = dimensions[body.aspect_ratio]
    # Scale to fill the target aspect ratio and crop the excess.
    vf = f"scale={width}:{height}:force_original_aspect_ratio=increase,crop={width}:{height},setsar=1"
    out_name = f"clip_{uuid4().hex[:10]}.mp4"
    dest = OUTPUTS / out_name
    cmd = [
        shutil.which("ffmpeg") or "ffmpeg", "-hide_banner", "-y",
        "-ss", str(body.start), "-i", str(src), "-t", str(clip_duration),
        "-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", str(dest)
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    if result.returncode != 0 or not dest.exists():
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=(result.stderr or "FFmpeg could not create the clip.")[-1800:])
    return {
        "filename": out_name,
        "duration": round(clip_duration, 2),
        "aspect_ratio": body.aspect_ratio,
        "url": f"http://127.0.0.1:8000/media/outputs/{out_name}",
    }
