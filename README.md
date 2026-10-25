# Local ScaleClip

A local-first video clipping starter inspired by common AI clipping workflows. No login, subscriptions, payments, cloud database, or required API keys.

## Requirements
- Windows 10/11
- Node.js 20+ (for the frontend)
- Python 3.11+ (for the backend)
- FFmpeg and FFprobe installed and available on PATH

## 1. Install FFmpeg
Install FFmpeg using the official Windows builds or a trusted package manager, then ensure `ffmpeg -version` and `ffprobe -version` work in a new PowerShell terminal.

## 2. Start the backend
Open PowerShell in `backend`:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

If PowerShell blocks activation, run `Set-ExecutionPolicy -Scope Process Bypass` in that terminal, then activate again.

## 3. Start the frontend
Open a second PowerShell terminal in `frontend`:

```powershell
npm install
npm run dev
```

Open http://localhost:3000

## Features in this starter
- Upload a local video
- Download a YouTube video you own or are authorized to process, using yt-dlp
- Preview imported videos
- Choose start/end timestamps and export a vertical 9:16, landscape 16:9, or square 1:1 clip
- All media stays in the local `backend/data` folder

## Important limitations
This is a working first MVP for importing and manually clipping video, not a complete AI auto-clipping system yet. Local transcription, automatic highlight detection, caption rendering, face tracking, project history, and background job queues are follow-on features. YouTube downloading may fail for some videos due to platform restrictions, age checks, or yt-dlp changes. Use only content you have permission to download and process.

No data is sent to a cloud service by this app. If you later configure an optional AI API, only the data you explicitly send to that provider will leave your computer.
