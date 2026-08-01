local iup = require("iuplua")

local YTDLP_PATH = "yt-dlp.exe" 
local FFMPEG_NAME = "ffmpeg"      -- just used for the startup PATH check

local script_dir = (arg and arg[0] or "."):match("^(.*)[\\/]") or "."

local videos = {}          -- {id=, title=, url=} for everything fetched
local dl_queue = {}         
local current_index = 0
local downloading = false
local cancel_requested = false

local current_logfile, current_offset, dl_buffer = nil, 0, ""
local fetch_logfile, fetch_offset, fetch_buffer = nil, 0, ""

-- forward declarations (assigned further down, called from callbacks
-- that are wired up before their real bodies exist in the file)
local start_next_download
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

local header = iup.label{
    title = "  YouTube Playlist Audio Extractor",
    bgcolor = "10 36 106",
    fgcolor = "255 255 255",
    font = "Tahoma, Bold 13",
    expand = "HORIZONTAL",
    size = "x30",
}

local url_text = iup.text{expand = "HORIZONTAL"}
local fetch_btn = iup.button{title = "Fetch", size = "50x"}
local url_frame = iup.frame{
    iup.hbox{url_text, fetch_btn; margin = "4x4", gap = "4"};
    title = "Playlist or Video URL",
}

local list_widget = iup.list{expand = "YES", multiple = "YES", visiblelines = "10"}
local selall_btn = iup.button{title = "Select All"}
local selnone_btn = iup.button{title = "Select None"}
local list_frame = iup.frame{
    iup.vbox{
        list_widget,
        iup.hbox{selall_btn, selnone_btn; gap = "6"};
        margin = "4x4", gap = "4",
    };
    title = "Videos in Playlist",
    expand = "YES",
}

local default_out = (os.getenv("USERPROFILE") or ".") .. "\\Music\\YT_WAV"
local out_text = iup.text{expand = "HORIZONTAL", value = default_out}
local browse_btn = iup.button{title = "Browse...", size = "60x"}
local out_frame = iup.frame{
    iup.hbox{out_text, browse_btn; margin = "4x4", gap = "4"};
    title = "Save WAV Files To",
}

local progressbar = iup.progressbar{expand = "HORIZONTAL", size = "x24"}
local start_btn = iup.button{title = "Start Download"}
local cancel_btn = iup.button{title = "Cancel", active = "NO"}
local ctrl_box = iup.hbox{
    progressbar, start_btn, cancel_btn;
    margin = "4x4", gap = "6",
}

local status_label = iup.label{title = "Ready", expand = "HORIZONTAL"}
local status_frame = iup.frame{status_label}

local main_box = iup.vbox{
    header, url_frame, list_frame, out_frame, ctrl_box, status_frame;
    margin = "6x6", gap = "4",
}

local dlg = iup.dialog{
    main_box;
    title = "YouTube Playlist -> WAV Ripper",
    size = "420x460",
}

local fetch_timer = iup.timer{time = 250}
local download_timer = iup.timer{time = 250}

fetch_btn.action = function()
    local url = url_text.value
    if not url or url == "" then
        iup.Message("No URL", "Paste a YouTube playlist or video URL first.")
        return iup.DEFAULT
    end

    status_label.title = "Fetching playlist info..."
    fetch_btn.active = "NO"
    clear_list(list_widget)
    videos = {}
    fetch_buffer = ""
    fetch_offset = 0
    fetch_logfile = script_dir .. "\\_fetch_log.txt"
    local f = io.open(fetch_logfile, "w"); if f then f:close() end

    -- %% escapes a literal % for string.format; yt-dlp expands
    -- %(id)s / %(title)s itself. We use a "|||" delimiter instead of
    -- JSON so this stays a plain string-split, no JSON library needed.
    local cmd = string.format(
        '"%s" --flat-playlist --print "%%(id)s|||%%(title)s" "%s"',
        YTDLP_PATH, url)
    run_async(cmd, fetch_logfile)
    fetch_timer.run = "YES"
    return iup.DEFAULT
end

fetch_timer.action_cb = function()
    local chunk, newpos = tail_new(fetch_logfile, fetch_offset)
    fetch_offset = newpos
    fetch_buffer = fetch_buffer .. chunk

    while true do
        local line, rest = fetch_buffer:match("^(.-)\r?\n(.*)$")
        if not line then break end
        fetch_buffer = rest

        if line == "__DONE__" then
            fetch_timer.run = "NO"
            fetch_btn.active = "YES"
            status_label.title = string.format(
                "Found %d video(s). Select which to download.", #videos)
            if #videos > 0 then
                list_widget.value = string.rep("+", #videos)
            end
        else
            local id, title = line:match("^([^|]*)|||(.*)$")
            if id and id ~= "" and title then
                table.insert(videos, {
                    id = id, title = title,
                    url = "https://www.youtube.com/watch?v=" .. id,
                })
                list_widget[#videos] = title
            end
        end
    end
    return iup.DEFAULT
end
selall_btn.action = function()
    if #videos > 0 then list_widget.value = string.rep("+", #videos) end
    return iup.DEFAULT
end

selnone_btn.action = function()
    if #videos > 0 then list_widget.value = string.rep("-", #videos) end
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
    local sel = list_widget.value or ""
    dl_queue = {}
    for i = 1, #sel do
        if sel:sub(i, i) == "+" and videos[i] then
            table.insert(dl_queue, videos[i])
        end
    end
    if #dl_queue == 0 then
        iup.Message("Nothing selected", "Fetch a playlist and select at least one video.")
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
                     "ffmpeg must be installed and on your PATH for WAV conversion.")
        return iup.DEFAULT
    end

    cancel_requested = false
    current_index = 1
    downloading = true
    start_btn.active = "NO"
    cancel_btn.active = "YES"
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
    local v = dl_queue[current_index]
    status_label.title = string.format("Downloading %d/%d: %s",
                                        current_index, #dl_queue, v.title)

    current_logfile = script_dir .. "\\_dl_log_" .. current_index .. ".txt"
    current_offset = 0
    dl_buffer = ""
    local f = io.open(current_logfile, "w"); if f then f:close() end

    local out_pattern = out_text.value .. "\\%(title)s.%(ext)s"
    local cmd = string.format(
        '"%s" -f bestaudio/best --extract-audio --audio-format wav ' ..
        '--audio-quality 0 --windows-filenames -o "%s" "%s"',
        YTDLP_PATH, out_pattern, v.url)
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
                if cancel_requested then
                    status_label.title = "Cancelled."
                else
                    progressbar.value = 1
                    status_label.title = "All downloads complete."
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
