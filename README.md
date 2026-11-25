# Ollama Browser Extension

A lightweight Manifest V3 Chrome extension that adds a dark-mode side panel connected to a local [Ollama](https://ollama.com/) instance, with real-time NDJSON response streaming, Markdown/code rendering, model switching, and active-tab or text-selection page context.

## Features

- **Chrome Side Panel UI:** Persistent dark-mode chat panel (`sidepanel.html` / `sidepanel.js`) alongside your browsing session.
- **Local Ollama Integration:** Discovers installed models via `/api/tags` and streams responses via `/api/chat` in the background service worker (`background.js`) with request cancellation support.
- **Page & Selection Context:** Injects a lightweight reader script via `chrome.scripting.executeScript` to attach selected text or active tab text when **Page Context** is enabled.
- **Markdown & Code Formatting:** Renders structured replies, lists, and fenced code blocks cleanly inside the panel.

## Project Structure

```text
.
├── manifest.json     # Manifest V3 configuration, permissions, and side panel entry
├── background.js     # Service worker handling Ollama model discovery and streaming chat
├── sidepanel.html    # Side panel layout and dark-mode styles
├── sidepanel.js      # Chat state, streaming consumer, and active-tab context extraction
└── icons/            # Extension toolbar icons
