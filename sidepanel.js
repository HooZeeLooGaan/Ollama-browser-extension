const statusDot = document.getElementById("statusDot");
const modelSelect = document.getElementById("modelSelect");
const refreshBtn = document.getElementById("refreshBtn");
const clearBtn = document.getElementById("clearBtn");
const chatFeed = document.getElementById("chatFeed");
const emptyState = document.getElementById("emptyState");
const pageCtxBtn = document.getElementById("pageCtxBtn");
const promptInput = document.getElementById("promptInput");
const sendBtn = document.getElementById("sendBtn");

let history = [];
let includePageContext = false;
let activePort = null;
let isStreaming = false;

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderMarkdown(raw) {
  const parts = raw.split(/```(\w*)\n([\s\S]*?)```/g);
  let html = "";

  for (let i = 0; i < parts.length; i += 3) {
    const textChunk = parts[i] || "";
    if (textChunk.trim()) {
      const formatted = escapeHtml(textChunk)
        .replace(/`([^`]+)`/g, '<code class="inline">$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .split(/\n{2,}/)
        .map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`)
        .join("");
      html += formatted;
    }

    if (i + 2 < parts.length) {
      const lang = escapeHtml(parts[i + 1] || "code");
      const code = escapeHtml(parts[i + 2]);
      html += `
        <div class="code-wrap">
          <div class="code-header">
            <span>${lang}</span>
            <button class="copy-btn" type="button">Copy</button>
          </div>
          <pre><code>${code}</code></pre>
        </div>`;
    }
  }
  return html || "<p></p>";
}

chatFeed.addEventListener("click", (e) => {
  if (!e.target.classList.contains("copy-btn")) return;
  const codeEl = e.target.closest(".code-wrap")?.querySelector("code");
  if (!codeEl) return;
  navigator.clipboard.writeText(codeEl.textContent);
  e.target.textContent = "Copied!";
  setTimeout(() => (e.target.textContent = "Copy"), 1400);
});

function addBubble(role, label, initialText = "") {
  if (emptyState) emptyState.style.display = "none";
  const wrap = document.createElement("div");
  wrap.className = `msg ${role}`;

  const meta = document.createElement("div");
  meta.className = "msg-meta";
  meta.textContent = label;

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  if (role === "user") {
    bubble.textContent = initialText;
  } else {
    bubble.innerHTML = renderMarkdown(initialText);
  }

  wrap.appendChild(meta);
  wrap.appendChild(bubble);
  chatFeed.appendChild(wrap);
  chatFeed.scrollTop = chatFeed.scrollHeight;
  return bubble;
}

async function getActiveTabContext() {
  try {
    // 1. Try lastFocusedWindow first (avoids picking up DevTools or side-panel window)
    let tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    let tab = tabs.find((t) => t.url && !t.url.startsWith("devtools://"));

    // 2. Fallback: find any active non-devtools tab across normal browser windows
    if (!tab) {
      const allActive = await chrome.tabs.query({ active: true, windowType: "normal" });
      tab = allActive.find((t) => t.url && !t.url.startsWith("devtools://"));
    }

    if (!tab?.id) {
      return { error: "No active browser tab found." };
    }

    if (/^(chrome|chrome-extension|edge|about|view-source|devtools):/.test(tab.url)) {
      return { error: `Browser internal page (${tab.url.split(":")[0]}://) cannot be scripted.` };
    }

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const selected = (window.getSelection()?.toString() || "").trim();
        const bodyText = (document.body?.innerText || "").replace(/\s+\n/g, "\n").trim();
        return {
          title: document.title || "Untitled",
          url: location.href,
          content: selected || bodyText.slice(0, 8000),
          isSelection: Boolean(selected)
        };
      }
    });

    const data = results?.[0]?.result;
    if (!data?.content) {
      return { error: "No readable text found on this tab (if this is a PDF, select text or use a webpage)." };
    }
    return data;
  } catch (err) {
    return { error: err?.message || "Script injection failed." };
  }
}

async function loadModels() {
  modelSelect.innerHTML = `<option>Connecting to Ollama...</option>`;
  statusDot.className = "status-dot";

  const res = await chrome.runtime.sendMessage({ type: "LIST_MODELS" });
  modelSelect.innerHTML = "";

  if (!res?.ok || !res.models?.length) {
    statusDot.className = "status-dot offline";
    const opt = document.createElement("option");
    opt.textContent = res?.error ? `Offline (${res.error})` : "No models found";
    modelSelect.appendChild(opt);
    return;
  }

  statusDot.className = "status-dot online";
  // Prioritize qwen models first, then others
  const sorted = [...res.models].sort((a, b) => {
    const aq = a.toLowerCase().includes("qwen") ? 0 : 1;
    const bq = b.toLowerCase().includes("qwen") ? 0 : 1;
    return aq - bq;
  });

  for (const name of sorted) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (name.includes("qwen") && name.includes("7b")) opt.selected = true;
    modelSelect.appendChild(opt);
  }
}

function setStreamingUI(streaming) {
  isStreaming = streaming;
  sendBtn.textContent = streaming ? "Stop" : "Send";
  sendBtn.classList.toggle("stop", streaming);
}

async function handleSend() {
  if (isStreaming && activePort) {
    activePort.postMessage({ type: "ABORT" });
    return;
  }

  const text = promptInput.value.trim();
  const model = modelSelect.value;
  if (!text || !model || statusDot.classList.contains("offline")) return;

  promptInput.value = "";
  promptInput.style.height = "auto";
  setStreamingUI(true);

  let finalPrompt = text;
  let userLabel = "You";

  if (includePageContext) {
    const ctx = await getActiveTabContext();
    if (ctx?.content) {
      userLabel = ctx.isSelection ? "You · Selection attached" : "You · Page attached";
      finalPrompt = `Use ONLY the webpage context below to answer the user's request.\n\nContext from "${ctx.title}" (${ctx.url}):\n"""\n${ctx.content}\n"""\n\nUser request: ${text}`;
    } else {
      addBubble("assistant", "System", `Could not read page context: ${ctx?.error || "Unknown error"}`);
      setStreamingUI(false);
      return;
    }
  }

  addBubble("user", userLabel, text);
  history.push({ role: "user", content: finalPrompt });

  const assistantBubble = addBubble("assistant", model, "Thinking...");
  let fullReply = "";

  activePort = chrome.runtime.connect({ name: "ollama-stream" });
  activePort.onMessage.addListener((msg) => {
    if (msg.type === "TOKEN") {
      fullReply += msg.token;
      assistantBubble.innerHTML = renderMarkdown(fullReply);
      chatFeed.scrollTop = chatFeed.scrollHeight;
    } else if (msg.type === "DONE") {
      if (fullReply) history.push({ role: "assistant", content: fullReply });
      setStreamingUI(false);
      activePort.disconnect();
      activePort = null;
    } else if (msg.type === "ERROR") {
      assistantBubble.innerHTML = `<p style="color:#f87171">Error: ${escapeHtml(msg.error)}</p>`;
      setStreamingUI(false);
      activePort.disconnect();
      activePort = null;
    }
  });

  activePort.postMessage({
    type: "CHAT",
    model,
    messages: history
  });
}

pageCtxBtn.addEventListener("click", () => {
  includePageContext = !includePageContext;
  pageCtxBtn.classList.toggle("active", includePageContext);
  pageCtxBtn.textContent = includePageContext ? "✓ Page Context On" : "+ Page Context";
});

promptInput.addEventListener("input", () => {
  promptInput.style.height = "auto";
  promptInput.style.height = `${Math.min(promptInput.scrollHeight, 140)}px`;
});

promptInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
});

sendBtn.addEventListener("click", handleSend);
refreshBtn.addEventListener("click", loadModels);

clearBtn.addEventListener("click", () => {
  history = [];
  chatFeed.innerHTML = "";
  if (emptyState) {
    emptyState.style.display = "block";
    chatFeed.appendChild(emptyState);
  }
});

loadModels();