const OLLAMA_BASE = "http://localhost:11434";

// 1. Set native click-to-open behavior immediately on worker startup
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error("setPanelBehavior failed:", err));

// 2. Explicit fallback in case native behavior didn't bind
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  } catch (err) {
    console.error("sidePanel.open failed:", err);
  }
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === "LIST_MODELS") {
    fetch(`${OLLAMA_BASE}/api/tags`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const models = (data.models || []).map((m) => m.name);
        sendResponse({ ok: true, models });
      })
      .catch((err) => sendResponse({ ok: false, error: err.message }));
    return true;
  }
});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "ollama-stream") return;
  let controller = null;

  port.onDisconnect.addListener(() => {
    if (controller) controller.abort();
  });

  port.onMessage.addListener(async (payload) => {
    if (payload.type === "ABORT") {
      if (controller) controller.abort();
      return;
    }

    if (payload.type !== "CHAT") return;
    controller = new AbortController();

    try {
      const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          model: payload.model,
          messages: payload.messages,
          stream: true
        })
      });

      if (!res.ok) {
        port.postMessage({ type: "ERROR", error: `Ollama HTTP ${res.status}` });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;
          const chunk = JSON.parse(line);
          if (chunk.message?.content) {
            port.postMessage({ type: "TOKEN", token: chunk.message.content });
          }
          if (chunk.done) {
            port.postMessage({ type: "DONE" });
          }
        }
      }
    } catch (err) {
      if (err.name === "AbortError") {
        port.postMessage({ type: "DONE" });
      } else {
        port.postMessage({ type: "ERROR", error: err.message });
      }
    } finally {
      controller = null;
    }
  });
});