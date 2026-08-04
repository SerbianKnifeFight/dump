local iup = require("iuplua")


local YTDLP_PATH = "yt-dlp.exe"   -- e.g. [[C:\Tools\yt-dlp.exe]]
local FFMPEG_NAME = "ffmpeg"

local QUALITY_OPTIONS = {
    { label = "Best available (up to 4K)",
      format = "bestvideo+bestaudio/best" },
    { label = "1080p",
      format = "bestvideo[height<=1080]+bestaudio/best[height<=1080]" },
    { label = "720p",
      format = "bestvideo[height<=720]+bestaudio/best[height<=720]" },
    { label = "480p",
      format = "bestvideo[height<=480]+bestaudio/best[height<=480]" },
}

local script_dir = (arg and arg[0] or "."):match("^(.*)[\\/]") or "."

local jobs = {}             -- queued clips {url=, start_t=, end_t=, format=, quality_label=}
local dl_queue = {}
local current_index = 0
local downloading = false
local cancel_requested = false
local current_logfile, current_offset, dl_buffer = nil, 0, ""

local start_next_download

local function trim(s)
    return (s or ""):gsub("^%s+", ""):gsub("%s+$", "")
end

local function command_exists(name)
    local ok, _, code = os.execute('where ' .. name .. ' >nul 2>nul')
    if type(ok) == "number" then return ok == 0 end
    return ok == true
end

local function tail_new(path, pos)
    local f = io.open(path, "r")
    if not f then return "", pos end
    f:seek("set", pos)
    local chunk = f:read("a") or ""
    local newpos = f:seek()
    f:close()
    return chunk, newpos
end

local function run_async(cmd, logfile)
    local batfile = script_dir .. "\\_tmp_" .. os.time() .. "_" ..
                    math.random(1000, 9999) .. ".bat"
    local f = io.open(batfile, "w")
    f:write("@echo off\r\n")
    f:write(cmd .. ' >> "' .. logfile .. '" 2>&1\r\n')
    f:write('echo __DONE__ >> "' .. logfile .. '"\r\n')
    f:write('del "%~f0"\r\n')
    f:close()
    os.execute('start "" /B "' .. batfile .. '"')
end

local function clear_list(list_widget)
    while tonumber(list_widget.count or "0") > 0 do
        list_widget.removeitem = "1"
    end
end

local function job_label(j)
    local range
    if j.start_t ~= "" or j.end_t ~= "" then
        range = string.format("[%s -> %s]",
                               j.start_t ~= "" and j.start_t or "start",
                               j.end_t ~= "" and j.end_t or "end")
    else
        range = "[full video]"
    end
    return j.url .. "  " .. range .. "  (" .. j.quality_label .. ")"
end

local header = iup.label{
    title = "  YouTube HQ Clipper",
    bgcolor = "10 36 106",
    fgcolor = "255 255 255",
    font = "Tahoma, Bold 13",
    expand = "HORIZONTAL",
    size = "x30",
}

local url_text = iup.text{expand = "HORIZONTAL"}
local url_frame = iup.frame{
    iup.hbox{url_text; margin = "4x4", gap = "4"};
    title = "Video URL",
}

local start_text = iup.text{size = "80x"}
local end_text = iup.text{size = "80x"}
local quality_list = iup.list{dropdown = "YES", size = "160x"}
for i, opt in ipairs(QUALITY_OPTIONS) do quality_list[i] = opt.label end
quality_list.value = "1"

local add_btn = iup.button{title = "Add to Queue"}

local clip_frame = iup.frame{
    iup.vbox{
        iup.hbox{
            iup.label{title = "Start (hh:mm:ss, blank = beginning):"},
            start_text;
            gap = "4",
        },
        iup.hbox{
            iup.label{title = "End   (hh:mm:ss, blank = end of video):"},
            end_text;
            gap = "4",
        },
        iup.hbox{
            iup.label{title = "Quality:"}, quality_list, add_btn;
            gap = "6",
        };
        margin = "4x4", gap = "6",
    };
    title = "Clip Range (leave both blank for the full video)",
}

local job_list = iup.list{expand = "YES", visiblelines = "8"}
local remove_btn = iup.button{title = "Remove Selected"}
local queue_frame = iup.frame{
    iup.vbox{
        job_list, remove_btn;
        margin = "4x4", gap = "4",
    };
    title = "Queue",
    expand = "YES",
}

local default_out = (os.getenv("USERPROFILE") or ".") .. "\\Videos\\YT_Clips"
local out_text = iup.text{expand = "HORIZONTAL", value = default_out}
local browse_btn = iup.button{title = "Browse...", size = "60x"}
local out_frame = iup.frame{
    iup.hbox{out_text, browse_btn; margin = "4x4", gap = "4"};
    title = "Save To",
}

local progressbar = iup.progressbar{expand = "HORIZONTAL", size = "x24"}
local start_btn = iup.button{title = "Start Queue"}
local cancel_btn = iup.button{title = "Cancel", active = "NO"}
local ctrl_box = iup.hbox{
    progressbar, start_btn, cancel_btn;
    margin = "4x4", gap = "6",
}

local status_label = iup.label{title = "Ready", expand = "HORIZONTAL"}
local status_frame = iup.frame{status_label}

local main_box = iup.vbox{
    header, url_frame, clip_frame, queue_frame, out_frame, ctrl_box, status_frame;
    margin = "6x6", gap = "4",
}

local dlg = iup.dialog{
    main_box;
    title = "YouTube HQ Clipper",
    size = "460x560",
}

local download_timer = iup.timer{time = 250}

local function selected_quality()
    local idx = tonumber(quality_list.value) or 1
    return QUALITY_OPTIONS[idx]
end

add_btn.action = function()
    local url = trim(url_text.value)
    if url == "" then
        iup.Message("No URL", "Paste a YouTube video URL first.")
        return iup.DEFAULT
    end
    local q = selected_quality()
    local job = {
        url = url,
        start_t = trim(start_text.value),
        end_t = trim(end_text.value),
        format = q.format,
        quality_label = q.label,
    }
    table.insert(jobs, job)
    job_list[#jobs] = job_label(job)

    url_text.value = ""
    start_text.value = ""
    end_text.value = ""
    return iup.DEFAULT
end

remove_btn.action = function()
    local sel = tonumber(job_list.value)
    if sel and jobs[sel] then
        table.remove(jobs, sel)
        clear_list(job_list)
        for i, j in ipairs(jobs) do job_list[i] = job_label(j) end
    end
    return iup.DEFAULT
end

browse_btn.action = function()
    local fd = iup.filedlg{dialogtype = "DIR", title = "Choose output folder"}
    fd:popup(iup.CENTER, iup.CENTER)
    if fd.status == "0" then
        out_text.value = fd.value
    end
    fd:destroy()
    return iup.DEFAULT
end

start_btn.action = function()
    if #jobs == 0 then
        iup.Message("Nothing queued", "Add at least one clip to the queue first.")
        return iup.DEFAULT
    end
    local out_dir = out_text.value
    if not out_dir or out_dir == "" then
        iup.Message("No folder", "Choose an output folder first.")
        return iup.DEFAULT
    end
    os.execute('mkdir "' .. out_dir .. '" 2>nul')

    if not command_exists(FFMPEG_NAME) then
        iup.Message("ffmpeg not found",
                     "ffmpeg must be installed and on your PATH.")
        return iup.DEFAULT
    end

    dl_queue = jobs
    cancel_requested = false
    current_index = 1
    downloading = true
    start_btn.active = "NO"
    cancel_btn.active = "YES"
    add_btn.active = "NO"
    progressbar.value = 0
    download_timer.run = "YES"
    start_next_download()
    return iup.DEFAULT
end

cancel_btn.action = function()
    cancel_requested = true
    status_label.title = "Cancelling after current file..."
    return iup.DEFAULT
end

start_next_download = function()
    local j = dl_queue[current_index]
    status_label.title = string.format("Downloading %d/%d: %s",
                                        current_index, #dl_queue, j.url)

    current_logfile = script_dir .. "\\_dl_log_" .. current_index .. ".txt"
    current_offset = 0
    dl_buffer = ""
    local f = io.open(current_logfile, "w"); if f then f:close() end

    local section_arg = ""
    if j.start_t ~= "" or j.end_t ~= "" then
        section_arg = string.format(' --download-sections "*%s-%s"',
                                     j.start_t, j.end_t)
    end

    local out_pattern = out_text.value .. "\\%(title)s.%(ext)s"
    local cmd = string.format(
        '"%s" -f "%s" --merge-output-format mp4%s --windows-filenames -o "%s" "%s"',
        YTDLP_PATH, j.format, section_arg, out_pattern, j.url)
    run_async(cmd, current_logfile)
end

download_timer.action_cb = function()
    if not downloading then return iup.DEFAULT end

    local chunk, newpos = tail_new(current_logfile, current_offset)
    current_offset = newpos
    dl_buffer = dl_buffer .. chunk

    while true do
        local line, rest = dl_buffer:match("^(.-)\r?\n(.*)$")
        if not line then break end
        dl_buffer = rest

        if line == "__DONE__" then
            current_index = current_index + 1
            dl_buffer = ""
            if cancel_requested or current_index > #dl_queue then
                downloading = false
                download_timer.run = "NO"
                start_btn.active = "YES"
                cancel_btn.active = "NO"
                add_btn.active = "YES"
                if cancel_requested then
                    status_label.title = "Cancelled."
                else
                    progressbar.value = 1
                    status_label.title = "All clips downloaded."
                    jobs = {}
                    clear_list(job_list)
                end
            else
                start_next_download()
            end
        else

            local pct = line:match("%[download%]%s+([%d%.]+)%%")
            if pct then
                local overall = ((current_index - 1) + tonumber(pct) / 100) / #dl_queue
                progressbar.value = overall
            end
        end
    end
    return iup.DEFAULT
end

if not command_exists(YTDLP_PATH) then
    status_label.title = "yt-dlp.exe not found -- place it next to this script or add it to PATH"
elseif not command_exists(FFMPEG_NAME) then
    status_label.title = "ffmpeg not found -- install it and add it to PATH"
else
    status_label.title = "Ready"
end

dlg:show()
iup.MainLoop()
