# Nav-Tools User Manual

> Nav-Tools is an Electron + Vue 3 workbench for robot development and debugging.
> It organizes dockable windows into **applications**, ingests real-time data,
> visualizes it, and drives devices over serial, network and SSH.
>
> - Download: <https://github.com/salmoshu/Nav-Tools/releases>
> - This manual replaces the legacy `Nav-Tools使用手册V1.2` Word/PDF documents.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Installation and First Launch](#2-installation-and-first-launch)
3. [Applications and Layout](#3-applications-and-layout)
4. [Data Sources (Input)](#4-data-sources-input)
5. [Window Reference](#5-window-reference)
6. [IAP Firmware Upgrade](#6-iap-firmware-upgrade)
7. [Terminal](#7-terminal)
8. [Settings](#8-settings)
9. [Keyboard and Mouse Reference](#9-keyboard-and-mouse-reference)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Overview

### 1.1 What Nav-Tools Does

Nav-Tools gives you a workspace where every debugging task is a window you can
drop into an application, resize, detach, or run full screen. A single
**Input** dialog configures every data source, so windows share connections
instead of each asking for a port again.

### 1.2 Core Concepts

| Concept | Meaning |
|---|---|
| **Application** | A named collection of windows with its own theme color and icon. Built-ins: GNSS, Motor, Camera. You can create your own. |
| **Window** | A functional panel (Plot, Terminal, Camera Video, Sky Plot, …). Windows are independent of applications — the same window can appear in several applications. |
| **Data source** | A connection configured once in `Input`: file, serial port, TCP, UDP, or RTSP camera. |
| **Parser** | How incoming bytes are interpreted: `Raw`, `JSON`, or `NMEA`. |
| **Layout** | The position and size of every window in an application. Saved automatically. |

### 1.3 Available Windows

| Category | Window | Purpose |
|---|---|---|
| General | **Plot** | Plot numeric fields over time; configurable fields, colors, sliding window, dual axis |
| General | **Raw Messages** | View, filter, pause and save raw messages; run IAP over the current serial port |
| General | **Terminal** | Local shells, WSL and SSH; split panes, SFTP, port forwarding |
| General | **Camera Video** | Play an RTSP stream; zoom, pan, on-screen status |
| Flow | **Flow Deviation** | Analyze Flow trajectory and deviation |
| GNSS | **GNSS Deviation** | Positioning trajectory and fix status |
| GNSS | **GNSS Signals** | Satellite signal strength and status |
| GNSS | **Sky Plot** | Satellite azimuth/elevation distribution |
| Motor | **Motor Parameters** | Read, configure and write motor parameters |

---

## 2. Installation and First Launch

### 2.1 Run the Released Build

Download the installer for your platform from the
[releases page](https://github.com/salmoshu/Nav-Tools/releases) and install.

### 2.2 Run from Source

```bash
git clone https://github.com/salmoshu/Nav-Tools.git
cd Nav-Tools

# Optional: use a China mirror for Electron downloads
echo "electron_mirror=https://npmmirror.com/mirrors/electron/" >> .npmrc

pnpm install
# If pnpm asks to approve build scripts, approve: electron, esbuild, ffmpeg-static
pnpm approve-builds

pnpm run dev
```

### 2.3 First Launch

The **application selector** opens first:

1. Pick a built-in application (GNSS / Motor / Camera) or create a custom one.
2. Open `Input` in the toolbar to configure your data sources.
3. Drag a window header to move it; drag its bottom-right corner to resize.
4. Use the buttons in a window header to detach, maximize, or remove it.
5. Dialogs close with `Esc` or by clicking outside.

---

## 3. Applications and Layout

### 3.1 Managing Applications

- The application editor lets you set name, description, theme color, icon and
  which windows the application contains.
- 20 application icons are provided.
- Application cards can be drag-reordered; the custom order is persisted.

### 3.2 Window Operations

| Action | How |
|---|---|
| Move | Drag the window header |
| Resize | Drag the bottom-right corner |
| Auto-layout | Toolbar action |
| Save layout | Automatic; layouts are persisted per application |
| Full screen | Button in the window header (the header adapts to light/dark theme) |
| Detach | Button in the window header — the window becomes an independent OS window |
| Restore | In a detached window, restore it back into the main window |
| Keep on top | Available for detached windows |

Detached windows show the window name in their title bar.

### 3.3 Multiple Windows

An application can be opened on its own, and any window can be detached.
All of them share the same data sources.

### 3.4 Themes

`Settings → Theme`: follow system, light, or dark.

---

## 4. Data Sources (Input)

`Input` in the toolbar is the single place to configure every source. Parameters
are persisted, so you configure a connection once.

| Source | Configured here |
|---|---|
| **File** | Path to a recorded file for replay |
| **Serial port** | Port, baud rate and framing |
| **TCP** | Host and port |
| **UDP** | Host and port |
| **Camera RTSP** | RTSP URL, e.g. `rtsp://192.168.3.14:8554/rgbstream` |

**Parsers**

| Parser | Use for |
|---|---|
| `Raw` | Undifferentiated byte/text streams |
| `JSON` | Structured JSON messages |
| `NMEA` | GNSS NMEA-0183 sentences |

---

## 5. Window Reference

### 5.1 Plot

Plots numeric fields over time. Configure which fields to draw, their colors,
the sliding window length, and optionally a second Y axis.

### 5.2 Raw Messages

Shows the incoming stream with filtering, pause and save. When a serial port is
connected, this window also exposes the **IAP** entry (see §6).

### 5.3 Camera Video

1. Add `Camera Video` to an application.
2. Configure the RTSP URL in `Input → Camera RTSP`. You can also click the
   source info below the picture to jump straight to the configuration.
3. Click **Play** to connect; **Pause** stops it and **Play** restarts it.
4. Scroll to zoom; when zoomed, drag with the left button to pan; double-click
   resets to the original scale.
5. The client tries UDP first and automatically falls back to TCP when the
   connection fails or no frame arrives in time, showing a more specific FFmpeg
   error message.

> RTSP playback relies on the Electron main process and the bundled FFmpeg, so
> it is only available in the desktop build.

### 5.4 Flow Deviation

Analyzes Flow trajectory data and its deviation from the reference path.

### 5.5 GNSS Deviation

Displays the positioning trajectory together with the current fix status.

### 5.6 GNSS Signals

Per-satellite signal strength and status.

### 5.7 Sky Plot

Satellite distribution by azimuth and elevation.

### 5.8 Motor Parameters

Reads, edits and writes motor parameters to the connected device.

---

## 6. IAP Firmware Upgrade

IAP reuses the **currently open serial port**, so connect the device first.

1. Connect the target serial port through `Input`, open `Raw Messages`, and click
   **IAP**.
2. Choose the firmware file. The built-in `IGK IAP` template uses 115200 baud,
   1024-byte packets and a 5000 ms timeout. Tick **Advanced** to configure frame
   header, commands, ACK, endianness, checksum algorithm and retry parameters for
   other devices.
3. During the upgrade the progress bar only advances when the device returns a
   valid ACK. A closed port, access denial, bad ACK or timeout stops the upgrade
   with an error — it never reports a false success.
4. After success, failure or cancellation, Nav-Tools restores the serial
   connection and baud rate that were in use before the upgrade.

> IAP requires the device bootloader to match the selected protocol template.
> The built-in template targets IGK IAP; other vendors' protocols can be
> configured as named templates and imported/exported as JSON.

---

## 7. Terminal

### 7.1 Session Types

| Type | Notes |
|---|---|
| PowerShell / CMD | Windows shells |
| Git Bash | Auto-detected on Windows |
| WSL | Detected distributions |
| SSH | Password, private key + passphrase, or SSH Agent |
| System shell | On Linux/macOS |

Click `+` at the end of the tab bar to create a session. Each pane header has
its own **split right** and **split down** buttons.

### 7.2 SSH

- New connections try password authentication first.
- Enable **securely remember password/passphrase** to store credentials
  encrypted in the OS secure store.
- The host key fingerprint is confirmed and recorded on first connect; if the
  fingerprint changes later, the connection is blocked.
- Nav-Tools reads `Host`, `HostName`, `User`, `Port`, `IdentityFile` and
  `ProxyJump` from `~/.ssh/config`.

### 7.3 SFTP Panel

Each tab shares one SFTP panel, opened from any SSH pane. Drag its edge to
change the width. Supports upload, download, create directory, rename and
delete.

### 7.4 Port Forwarding

Configured centrally in the SSH settings. Multiple rules are supported:

| Type | Flag |
|---|---|
| Local | `-L` |
| Remote | `-R` |
| SOCKS | `-D` |

### 7.5 Persistence

Tabs, the active tab, the recursive split layout and the terminal type are all
persisted. After a restart, local shells and WSL sessions are restored
automatically; SSH sessions keep their configuration and auto-fill credentials
when they were securely remembered.

### 7.6 Mouse and Sessions

- Right-click with a selection copies; right-click without a selection pastes.
- When a session drops or exits abnormally, a reconnect entry appears at the
  bottom of the terminal.
- An SSH connection in progress can be interrupted.

> Closing an active pane, a tab, or the whole Terminal window asks for
> confirmation first. After confirming, the associated shell, SSH session, SFTP
> transfers and port forwards are terminated.

### 7.7 GUI Command Block View

Each pane has two presentations, switchable per pane and remembered across
restarts:

- **Terminal view** — the classic xterm.js character grid, fully compatible with
  every shell and TUI program (`vim`, `less`, `top`, progress bars).
- **GUI view** — the same session rendered as Vue components: one card per
  command showing the command text, working directory, start time, exit code and
  output. Cards can be collapsed, copied, and re-run. A fixed input row at the
  bottom sends commands to the session (`↑`/`↓` walks the in-session history).

Paths detected in plain block output are verified against the active session.
Click a file to preview it inside the block; click a directory to show or hide a
lazy, collapsible file tree in place. Directory listing uses the matching local,
WSL, or SSH channel, so names are displayed as filesystem text rather than shell
commands.

Rich content: a program (or you) can push structured content into a block with
the injected `nav-render` helper:

```bash
nav-render report.md            # renders as Markdown
nav-render data.json            # renders as a JSON tree
nav-render metrics.csv          # renders as a table
nav-render plot.png             # renders as an image
```

Supported MIME types: `text/plain`, `text/markdown`, `application/json`,
`text/csv`, `image/png`, `image/jpeg`, `image/svg+xml`. Anything else is
ignored.

> The GUI view needs shell integration markers, which are injected into local
> bash-family shells (Git Bash / WSL) and PowerShell. **SSH and CMD sessions are
> not instrumented**, so those panes automatically fall back to the terminal
> view with a hint. Remote hosts can reproduce the equivalent helper in their
> own `.bashrc` if desired.

---

## 8. Settings

### 8.1 Theme

Follow system / Light / Dark.

### 8.2 Shortcuts

`Settings → Shortcuts → Terminal`. Every binding can be changed and reset to
default (see §9 for the defaults).

### 8.3 Credentials

SSH passwords and key passphrases are only stored when you explicitly enable
secure remembering; they are encrypted by the operating system's secure storage.

---

## 9. Keyboard and Mouse Reference

### 9.1 Terminal Shortcuts (defaults)

| Action | Windows / Linux | macOS |
|---|---|---|
| New tab | `Ctrl+T` | `Cmd+T` |
| Close active pane/tab | `Ctrl+W` | `Cmd+W` |
| Next tab | `Ctrl+Tab`, `Ctrl+PageDown` | same |
| Previous tab | `Ctrl+Shift+Tab`, `Ctrl+PageUp` | same |
| Select tab *n* | `Alt+1`…`Alt+9` | `Ctrl+1`…`Ctrl+9` |
| Focus next pane | `Ctrl+]` | `Cmd+]` |
| Focus previous pane | `Ctrl+[` | `Cmd+[` |
| Split right | `Ctrl+Shift+D` | `Cmd+D` |
| Split down | `Alt+Shift+D` | `Cmd+Shift+D` |
| Expand/collapse pane | `Ctrl+Shift+Enter` | `Cmd+Shift+Enter` |

### 9.2 Mouse

| Gesture | Result |
|---|---|
| Drag window header | Move the window |
| Drag window bottom-right corner | Resize |
| Scroll on camera picture | Zoom |
| Drag while camera is zoomed | Pan |
| Double-click camera picture | Reset zoom |
| Right-click in terminal (with selection) | Copy |
| Right-click in terminal (no selection) | Paste |

### 9.3 Dialogs

Any dialog closes with `Esc` or by clicking the area outside it.

---

## 10. Troubleshooting

**Camera shows no picture**

Check the RTSP URL in `Input → Camera RTSP`. The client tries UDP first and
falls back to TCP automatically; if it still fails, the error shown is the
FFmpeg message, which usually identifies the cause (wrong path, auth, codec).
RTSP playback requires the desktop build.

**IAP never reaches 100%**

Progress requires a valid ACK from the device bootloader. Verify that the
selected template matches your bootloader (the built-in template targets IGK
IAP) and that the baud rate matches.

**SSH connection refused with a fingerprint warning**

The host key changed. Nav-Tools blocks the connection on purpose — confirm the
new fingerprint with the host owner before updating the recorded entry.

**Terminal GUI view shows "not available for this session"**

The session type is SSH or CMD, which is not instrumented with shell
integration. Switch that pane back to the terminal view, or use a local
bash-family/WSL session to get the GUI view.

**A command block shows "(command not captured)"**

The shell integration marker was not received for that command line. This
happens when the command was run through a wrapper that bypasses the shell
integration. The output is still shown; only the command text is missing.

**Text selection behaves oddly while resizing windows**

Clearing the selection at the start of a grid resize is intentional — it keeps
adjacent cards from selecting text while you drag.

---

## Appendix: Further Reading

| Document | Contents |
|---|---|
| `README.md` | Feature overview and developer guide |
| `doc/terminal-component/` | Design and research notes for the Terminal window |
