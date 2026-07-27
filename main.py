import os
import shutil
import threading
import queue
from pathlib import Path

import tkinter as tk
from tkinter import filedialog, messagebox

try:
    import yt_dlp
except ImportError:
    yt_dlp = None

BG = "#ECE9D8"
FIELD_BG = "#FFFFFF"
FONT = ("Tahoma", 8)
FONT_BOLD = ("Tahoma", 8, "bold")
HEADER_FONT = ("Tahoma", 12, "bold")

TITLE_BLUE_DARK = (10, 36, 106)  
TITLE_BLUE_LIGHT = (59, 120, 206)


def draw_header_gradient(canvas, width, height, text):
    r1, g1, b1 = TITLE_BLUE_DARK
    r2, g2, b2 = TITLE_BLUE_LIGHT
    for x in range(width):
        t = x / max(width - 1, 1)
        r = int(r1 + (r2 - r1) * t)
        g = int(g1 + (g2 - g1) * t)
        b = int(b1 + (b2 - b1) * t)
        color = f"#{r:02x}{g:02x}{b:02x}"
        canvas.create_line(x, 0, x, height, fill=color)
    canvas.create_text(16, height // 2, text=text, fill="white",
                        font=HEADER_FONT, anchor="w")


class XPButton(tk.Button):

    def __init__(self, master, **kwargs):
        kwargs.setdefault("font", FONT)
        kwargs.setdefault("bg", BG)
        kwargs.setdefault("activebackground", "#E3E1D8")
        kwargs.setdefault("relief", "raised")
        kwargs.setdefault("bd", 2)
        kwargs.setdefault("padx", 10)
        kwargs.setdefault("pady", 3)
        super().__init__(master, **kwargs)


class XPProgressBar(tk.Frame):

    def __init__(self, master, width=300, height=20, **kwargs):
        super().__init__(master, bd=2, relief="sunken", bg="white", **kwargs)
        self.width = width
        self.height = height
        self.canvas = tk.Canvas(self, width=width, height=height,
                                 bg="white", highlightthickness=0)
        self.canvas.pack()
        self.pct = 0.0

    def set_progress(self, pct):
        self.pct = max(0.0, min(100.0, pct))
        self._redraw()

    def _redraw(self):
        self.canvas.delete("all")
        filled_w = int(self.width * (self.pct / 100.0))
        block_w, gap = 6, 2
        x = 2
        while x < filled_w - gap:
            self.canvas.create_rectangle(
                x, 2, x + block_w, self.height - 2,
                fill="#1E9C1E", outline="#146814"
            )
            x += block_w + gap


class XPApp:
    def __init__(self, root):
        self.root = root
        self.root.title("YouTube Playlist WAV Ripper")
        self.root.configure(bg=BG)
        self.root.geometry("580x560")
        self.root.resizable(False, False)

        self.videos = []
        self.msg_queue = queue.Queue()
        self.stop_event = threading.Event()

        self._build_ui()
        self._check_dependencies()
        self.root.after(100, self._poll_queue)

    def _build_ui(self):
        header = tk.Canvas(self.root, height=50, highlightthickness=0)
        header.pack(fill="x")
        self.root.update_idletasks()
        draw_header_gradient(header, 580, 50, "\u266A YouTube Playlist Audio Extractor")

        url_frame = tk.LabelFrame(self.root, text="Playlist or Video URL",
                                   font=FONT, bg=BG, relief="groove", bd=2)
        url_frame.pack(fill="x", padx=8, pady=6)

        self.url_var = tk.StringVar()
        url_entry = tk.Entry(url_frame, textvariable=self.url_var, font=FONT,
                              relief="sunken", bd=2)
        url_entry.pack(side="left", fill="x", expand=True, padx=6, pady=6)

        self.fetch_btn = XPButton(url_frame, text="Fetch", command=self.on_fetch)
        self.fetch_btn.pack(side="left", padx=6)

        list_frame = tk.LabelFrame(self.root, text="Videos in Playlist",
                                    font=FONT, bg=BG, relief="groove", bd=2)
        list_frame.pack(fill="both", expand=True, padx=8, pady=6)

        list_inner = tk.Frame(list_frame, bg=BG)
        list_inner.pack(fill="both", expand=True, padx=6, pady=6)

        scrollbar = tk.Scrollbar(list_inner)
        scrollbar.pack(side="right", fill="y")

        self.listbox = tk.Listbox(list_inner, selectmode="extended", font=FONT,
                                   yscrollcommand=scrollbar.set, relief="sunken",
                                   bd=2, bg=FIELD_BG, activestyle="dotbox")
        self.listbox.pack(side="left", fill="both", expand=True)
        scrollbar.config(command=self.listbox.yview)

        select_frame = tk.Frame(list_frame, bg=BG)
        select_frame.pack(fill="x", padx=6, pady=(0, 6))
        XPButton(select_frame, text="Select All",
                 command=self.on_select_all).pack(side="left")
        XPButton(select_frame, text="Select None",
                 command=self.on_select_none).pack(side="left", padx=6)

        out_frame = tk.LabelFrame(self.root, text="Save WAV Files To",
                                   font=FONT, bg=BG, relief="groove", bd=2)
        out_frame.pack(fill="x", padx=8, pady=6)

        default_out = str(Path.home() / "Music" / "YT_WAV")
        self.out_var = tk.StringVar(value=default_out)
        out_entry = tk.Entry(out_frame, textvariable=self.out_var, font=FONT,
                              relief="sunken", bd=2)
        out_entry.pack(side="left", fill="x", expand=True, padx=6, pady=6)

        XPButton(out_frame, text="Browse...",
                 command=self.on_browse).pack(side="left", padx=6)

        ctrl_frame = tk.Frame(self.root, bg=BG)
        ctrl_frame.pack(fill="x", padx=8, pady=8)

        self.progress = XPProgressBar(ctrl_frame, width=300, height=20)
        self.progress.pack(side="left", padx=(0, 8))

        self.start_btn = XPButton(ctrl_frame, text="Start Download",
                                   command=self.on_start)
        self.start_btn.pack(side="left", padx=4)

        self.cancel_btn = XPButton(ctrl_frame, text="Cancel",
                                    command=self.on_cancel, state="disabled")
        self.cancel_btn.pack(side="left", padx=4)

        self.status_var = tk.StringVar(value="Ready")
        status_bar = tk.Label(self.root, textvariable=self.status_var, bd=1,
                               relief="sunken", anchor="w", bg=BG, font=FONT)
        status_bar.pack(side="bottom", fill="x")

    def _check_dependencies(self):
        if yt_dlp is None:
            self.status_var.set("yt-dlp not found \u2014 run: pip install yt-dlp")
        elif shutil.which("ffmpeg") is None:
            self.status_var.set("ffmpeg not found \u2014 install it and add it to PATH")
        else:
            self.status_var.set("Ready")

    def on_select_all(self):
        self.listbox.select_set(0, "end")

    def on_select_none(self):
        self.listbox.select_clear(0, "end")

    def on_browse(self):
        chosen = filedialog.askdirectory()
        if chosen:
            self.out_var.set(chosen)

    def on_fetch(self):
        url = self.url_var.get().strip()
        if not url:
            messagebox.showwarning("No URL", "Paste a YouTube playlist or video URL first.")
            return
        if yt_dlp is None:
            messagebox.showerror("Missing dependency",
                                  "yt-dlp is not installed.\nRun: pip install yt-dlp")
            return

        self.status_var.set("Fetching playlist info...")
        self.fetch_btn.config(state="disabled")
        self.listbox.delete(0, "end")
        self.videos = []

        threading.Thread(target=self._fetch_worker, args=(url,), daemon=True).start()

    def on_start(self):
        if not self.videos:
            messagebox.showwarning("No videos", "Fetch a playlist first.")
            return
        selected = self.listbox.curselection()
        if not selected:
            messagebox.showwarning("Nothing selected", "Select at least one video to download.")
            return
        if shutil.which("ffmpeg") is None:
            messagebox.showerror("ffmpeg not found",
                                  "ffmpeg must be installed and on your PATH for WAV conversion.")
            return

        out_dir = self.out_var.get().strip()
        if not out_dir:
            messagebox.showwarning("No folder", "Choose an output folder first.")
            return
        os.makedirs(out_dir, exist_ok=True)

        chosen = [self.videos[i] for i in selected]

        self.stop_event = threading.Event()
        self.start_btn.config(state="disabled")
        self.cancel_btn.config(state="normal")
        self.progress.set_progress(0)

        threading.Thread(target=self._download_worker,
                          args=(chosen, out_dir), daemon=True).start()

    def on_cancel(self):
        self.stop_event.set()
        self.status_var.set("Cancelling...")

    def _fetch_worker(self, url):
        ydl_opts = {
            "extract_flat": "in_playlist",
            "quiet": True,
            "skip_download": True,
        }
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=False)

            entries = info.get("entries")
            if entries is None:
                entries = [info]

            videos = []
            for e in entries:
                if not e:
                    continue
                vid = e.get("id")
                title = e.get("title") or vid or "Unknown title"
                if vid:
                    vurl = f"https://www.youtube.com/watch?v={vid}"
                else:
                    vurl = e.get("url")
                if not vurl:
                    continue
                videos.append({"id": vid, "title": title, "url": vurl})

            self.msg_queue.put(("fetch_ok", videos))
        except Exception as ex:
            self.msg_queue.put(("fetch_error", str(ex)))

    def _download_worker(self, videos, out_dir):
        total = len(videos)
        for idx, v in enumerate(videos, start=1):
            if self.stop_event.is_set():
                self.msg_queue.put(("cancelled", None))
                return

            self.msg_queue.put(("status", f"Downloading {idx}/{total}: {v['title']}"))

            def hook(d, idx=idx, total=total):
                if self.stop_event.is_set():
                    raise yt_dlp.utils.DownloadError("Cancelled by user")
                if d.get("status") == "downloading":
                    pct_str = d.get("_percent_str", "0%").strip().replace("%", "")
                    try:
                        pct = float(pct_str)
                    except ValueError:
                        pct = 0.0
                    overall = ((idx - 1) + pct / 100.0) / total * 100.0
                    self.msg_queue.put(("progress", overall))
                elif d.get("status") == "finished":
                    overall = idx / total * 100.0
                    self.msg_queue.put(("progress", overall))

            ydl_opts = {
                "format": "bestaudio/best",
                "outtmpl": os.path.join(out_dir, "%(title)s.%(ext)s"),
                "windowsfilenames": True,
                "postprocessors": [{
                    "key": "FFmpegExtractAudio",
                    "preferredcodec": "wav",
                    "preferredquality": "0",
                }],
                "quiet": True,
                "noplaylist": True,
                "progress_hooks": [hook],
            }
            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.download([v["url"]])
            except Exception as ex:
                self.msg_queue.put(("file_error", f"{v['title']}: {ex}"))

        self.msg_queue.put(("done", None))
    def _poll_queue(self):
        try:
            while True:
                kind, payload = self.msg_queue.get_nowait()

                if kind == "fetch_ok":
                    self.videos = payload
                    self.listbox.delete(0, "end")
                    for v in self.videos:
                        self.listbox.insert("end", v["title"])
                    self.listbox.select_set(0, "end")
                    self.status_var.set(f"Found {len(self.videos)} video(s). Select which to download.")
                    self.fetch_btn.config(state="normal")

                elif kind == "fetch_error":
                    messagebox.showerror("Fetch failed", payload)
                    self.status_var.set("Ready")
                    self.fetch_btn.config(state="normal")

                elif kind == "status":
                    self.status_var.set(payload)

                elif kind == "progress":
                    self.progress.set_progress(payload)

                elif kind == "file_error":
                    self.status_var.set(f"Error: {payload}")

                elif kind == "done":
                    self.progress.set_progress(100)
                    self.status_var.set("All downloads complete.")
                    self.start_btn.config(state="normal")
                    self.cancel_btn.config(state="disabled")
                    messagebox.showinfo("Done", "Finished downloading selected videos as WAV.")

                elif kind == "cancelled":
                    self.status_var.set("Cancelled.")
                    self.start_btn.config(state="normal")
                    self.cancel_btn.config(state="disabled")

        except queue.Empty:
            pass

        self.root.after(100, self._poll_queue)


if __name__ == "__main__":
    root = tk.Tk()
    app = XPApp(root)
    root.mainloop()