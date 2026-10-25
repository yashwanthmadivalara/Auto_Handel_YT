"use client";

import { useEffect, useState } from "react";
import { Upload, Link2, Scissors, Download, Film, CheckCircle2, AlertCircle, HardDrive, Sparkles } from "lucide-react";

const API = "http://127.0.0.1:8000";

type Video = { filename: string; duration: number; size_bytes: number; url: string };
type Clip = { filename: string; duration: number; aspect_ratio: string; url: string };

function timeLabel(seconds: number) {
  if (!Number.isFinite(seconds)) return "0:00";
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export default function Home() {
  const [video, setVideo] = useState<Video | null>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [start, setStart] = useState("0");
  const [end, setEnd] = useState("30");
  const [aspect, setAspect] = useState("9:16");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [health, setHealth] = useState<{ ffmpeg_available: boolean; ffprobe_available: boolean } | null>(null);

  useEffect(() => {
    fetch(`${API}/api/health`).then(r => r.json()).then(setHealth).catch(() => setHealth(null));
  }, []);

  async function handleUpload(file?: File) {
    if (!file) return;
    setBusy(true); setError(""); setStatus("Importing video…"); setClip(null);
    try {
      const form = new FormData(); form.append("file", file);
      const res = await fetch(`${API}/api/upload`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed.");
      setVideo(data); setStart("0"); setEnd(String(Math.min(30, Math.floor(data.duration))));
      setStatus("Video ready to clip.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not upload video."); setStatus(""); }
    finally { setBusy(false); }
  }

  async function handleYouTube() {
    if (!youtubeUrl.trim()) { setError("Paste a YouTube URL first."); return; }
    setBusy(true); setError(""); setStatus("Downloading video locally. Longer videos can take a while…"); setClip(null);
    try {
      const res = await fetch(`${API}/api/youtube`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: youtubeUrl.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "YouTube import failed.");
      setVideo(data); setStart("0"); setEnd(String(Math.min(30, Math.floor(data.duration))));
      setStatus("Video imported and stored locally.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not import URL."); setStatus(""); }
    finally { setBusy(false); }
  }

  async function makeClip() {
    if (!video) return;
    setBusy(true); setError(""); setStatus("Rendering clip with FFmpeg…"); setClip(null);
    try {
      const res = await fetch(`${API}/api/clip`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: video.filename, start: Number(start), end: Number(end), aspect_ratio: aspect })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Clip creation failed.");
      setClip(data); setStatus("Clip exported successfully.");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create clip."); setStatus(""); }
    finally { setBusy(false); }
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-icon"><Film size={21}/></div><div><strong>ScaleClip</strong><span>LOCAL STUDIO</span></div></div>
        <div className="nav-label">WORKSPACE</div>
        <div className="nav-item active"><Scissors size={17}/> Clip studio</div>
        <div className="nav-item muted"><HardDrive size={17}/> Local library</div>
        <div className="side-bottom"><div className="local-pill"><span className="green-dot"/> Runs on this computer</div><p>No account. No subscription. Your files stay local.</p></div>
      </aside>

      <section className="main">
        <header className="topbar"><div><span className="eyebrow">VIDEO WORKSPACE</span><h1>Turn long videos into shorts.</h1><p>Import a video, choose a moment, and export a social-ready clip.</p></div><div className="local-badge"><span className="green-dot"/> Local mode</div></header>

        {health && (!health.ffmpeg_available || !health.ffprobe_available) && <div className="warning"><AlertCircle size={18}/><div><strong>FFmpeg setup required</strong><p>Install FFmpeg and FFprobe, add them to PATH, then restart the backend.</p></div></div>}
        {!health && <div className="warning"><AlertCircle size={18}/><div><strong>Backend not connected</strong><p>Start the FastAPI server at 127.0.0.1:8000, then refresh this page.</p></div></div>}

        <div className="content-grid">
          <div className="left-column">
            <section className="panel import-panel">
              <div className="panel-title"><div className="step">01</div><div><h2>Import a video</h2><p>Choose a file or use a YouTube URL.</p></div></div>
              <label className="dropzone">
                <input type="file" accept="video/*,.mkv,.avi,.mov,.webm" onChange={e => handleUpload(e.target.files?.[0])} disabled={busy}/>
                <div className="upload-icon"><Upload size={22}/></div><strong>Choose video from your computer</strong><span>MP4, MOV, MKV, WebM · up to 4 GB</span><em>Browse files</em>
              </label>
              <div className="or"><span/>OR<span/></div>
              <div className="url-row"><div className="url-input"><Link2 size={17}/><input value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)} placeholder="Paste a YouTube URL" disabled={busy}/></div><button onClick={handleYouTube} disabled={busy} className="secondary-btn">Import URL</button></div>
              <p className="fineprint">Only download content you own or have permission to use. YouTube import requires an internet connection.</p>
            </section>

            {video && <section className="panel">
              <div className="panel-title"><div className="step">02</div><div><h2>Choose your clip</h2><p>Set the start and end of the segment.</p></div></div>
              <div className="video-meta"><div className="file-icon"><Film size={20}/></div><div className="file-text"><strong>{video.filename}</strong><span>{timeLabel(video.duration)} total · {(video.size_bytes / (1024 * 1024)).toFixed(1)} MB</span></div><CheckCircle2 className="success-icon" size={19}/></div>
              <video className="source-video" src={video.url} controls preload="metadata"/>
              <div className="field-grid">
                <label>Start time (seconds)<input type="number" min="0" step="0.5" value={start} onChange={e => setStart(e.target.value)}/></label>
                <label>End time (seconds)<input type="number" min="0.5" step="0.5" value={end} onChange={e => setEnd(e.target.value)}/></label>
              </div>
              <div className="range-hint">Clip length: {Math.max(0, Number(end) - Number(start)).toFixed(1)} seconds</div>
              <label className="select-label">Output format</label>
              <div className="aspect-options">
                {["9:16", "16:9", "1:1"].map(a => <button key={a} onClick={() => setAspect(a)} className={`aspect-option ${aspect === a ? "selected" : ""}`}><span className={`aspect-shape shape-${a.replace(":", "-")}`}/><strong>{a}</strong><small>{a === "9:16" ? "Shorts / Reels" : a === "16:9" ? "YouTube" : "Square"}</small></button>)}
              </div>
              <button className="primary-btn full" onClick={makeClip} disabled={busy || !video || !Number.isFinite(Number(start)) || !Number.isFinite(Number(end)) || Number(start) < 0 || Number(end) <= Number(start) || Number(end) > video.duration}><Scissors size={17}/>{busy ? "Processing…" : "Create clip"}</button>
            </section>}

            {clip && <section className="panel result-panel">
              <div className="result-heading"><div className="result-check"><CheckCircle2 size={20}/></div><div><h2>Your clip is ready</h2><p>{clip.duration.toFixed(1)} seconds · {clip.aspect_ratio}</p></div></div>
              <video className="result-video" src={clip.url} controls/>
              <a className="primary-btn full download-btn" href={clip.url} download={clip.filename}><Download size={17}/> Download MP4</a>
              <p className="fineprint">Saved locally in backend/data/outputs.</p>
            </section>}
          </div>

          <aside className="right-column">
            <section className="panel preview-panel"><div className="panel-head"><h2>Studio preview</h2><span className="live-dot">READY</span></div>
              {clip ? <video className="preview-video" src={clip.url} controls/> : video ? <video className="preview-video" src={video.url} controls/> : <div className="empty-preview"><div className="preview-symbol"><Film size={30}/></div><strong>Your preview appears here</strong><span>Import a video to get started.</span></div>}
              <div className="preview-footer"><span><span className="green-dot"/> Local processing</span><span>MP4 export</span></div>
            </section>
            <section className="panel steps-panel"><div className="panel-head"><h2>Workflow</h2><Sparkles size={17} className="sparkle"/></div>
              <div className="workflow-step"><div className="workflow-icon"><Upload size={16}/></div><div><strong>Import</strong><p>Load a video from disk or URL.</p></div></div>
              <div className="workflow-line"/>
              <div className={`workflow-step ${video ? "complete" : ""}`}><div className="workflow-icon">{video ? <CheckCircle2 size={16}/> : <Scissors size={16}/>}</div><div><strong>Select a moment</strong><p>Choose clip boundaries and format.</p></div></div>
              <div className="workflow-line"/>
              <div className={`workflow-step ${clip ? "complete" : ""}`}><div className="workflow-icon">{clip ? <CheckCircle2 size={16}/> : <Download size={16}/>}</div><div><strong>Export</strong><p>Render and save your MP4 clip.</p></div></div>
            </section>
            <section className="privacy-note"><HardDrive size={18}/><div><strong>Private by design</strong><p>Files are saved on your computer. No account or cloud storage is involved.</p></div></section>
          </aside>
        </div>
        {(status || error) && <div className={error ? "toast error-toast" : "toast"}>{error ? <AlertCircle size={17}/> : <CheckCircle2 size={17}/>}<span>{error || status}</span><button onClick={() => {setError("");setStatus("")}} aria-label="Dismiss">×</button></div>}
        <footer>ScaleClip Local <span>·</span> Local-first video tools <span>·</span> No account required</footer>
      </section>
    </main>
  );
}
