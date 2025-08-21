async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["settings"], (data) => resolve(data.settings || {}));
  });
}

async function setSettings(next) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ settings: next }, () => resolve());
  });
}

function getActiveTabId() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
      resolve(tabs?.[0]?.id);
    });
  });
}

async function highlight(selector) {
  const tabId = await getActiveTabId();
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "HIGHLIGHT_SELECTOR", selector }, (res) => resolve(res));
  });
}

async function clearHighlights() {
  const tabId = await getActiveTabId();
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "CLEAR_HIGHLIGHTS" }, (res) => resolve(res));
  });
}

async function evalSelector(selector) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "RUN_CONTENT_EVAL", selector }, (res) => resolve(res));
  });
}

function extractWithSelectors(doc, sels) {
  const getText = (s) => {
    if (!s) return "";
    const nodes = doc.querySelectorAll(s);
    if (!nodes.length) return "";
    return Array.from(nodes).map((n) => (n.textContent || "").trim()).filter(Boolean)[0] || "";
  };
  const getImages = (s) => {
    if (!s) return [];
    return Array.from(doc.querySelectorAll(s)).map((n) => {
      if (n.tagName === "IMG") return n.src || n.getAttribute("data-src") || "";
      const img = n.querySelector("img");
      return img?.src || img?.getAttribute("data-src") || "";
    }).filter(Boolean);
  };
  const getSpecs = (s) => {
    if (!s) return [];
    const rows = Array.from(doc.querySelectorAll(s));
    const pairs = [];
    for (const row of rows) {
      const cells = row.querySelectorAll("td, th, dt, dd, span, div");
      const text = Array.from(cells).map((c) => (c.textContent || "").trim()).filter(Boolean);
      if (text.length >= 2) {
        pairs.push({ name: text[0], value: text.slice(1).join(" ") });
      }
    }
    return pairs;
  };
  return {
    title: getText(sels.title),
    price: getText(sels.price),
    images: getImages(sels.images),
    specs: getSpecs(sels.specs)
  };
}

async function parsePage() {
  const sels = {
    title: document.getElementById("sel-title").value.trim(),
    price: document.getElementById("sel-price").value.trim(),
    images: document.getElementById("sel-images").value.trim(),
    specs: document.getElementById("sel-specs").value.trim(),
  };
  const tabId = await getActiveTabId();
  const [{ result: html }] = await chrome.scripting.executeScript({
    target: { tabId },
    func: () => document.documentElement.outerHTML
  });
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const data = extractWithSelectors(doc, sels);
  data.url = (await chrome.tabs.get(tabId)).url;
  return data;
}

async function sendToN8n(payload) {
  const settings = await getSettings();
  const url = settings.n8nWebhookUrl;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`n8n error ${res.status}`);
  return res.json().catch(() => ({}));
}

async function aiComplete(payload) {
  const settings = await getSettings();
  const url = settings.aiApiUrl;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      task: "complete_product_specs",
      input: payload
    })
  });
  if (!res.ok) throw new Error(`AI error ${res.status}`);
  return res.json();
}

function setStatus(msg) {
  const el = document.getElementById("status");
  el.textContent = msg || "";
}

function pretty(obj) { return JSON.stringify(obj, null, 2); }

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await getSettings();
  document.getElementById("cfg-n8n").value = settings.n8nWebhookUrl || "";
  document.getElementById("cfg-ai").value = settings.aiApiUrl || "";
  document.getElementById("cfg-apanel").value = settings.apanelApiUrl || "";

  document.querySelectorAll("[data-preview]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const inputId = btn.getAttribute("data-preview");
      const selector = document.getElementById(inputId).value.trim();
      if (!selector) return;
      setStatus("highlighting…");
      await highlight(selector);
      const res = await evalSelector(selector);
      setStatus( res?.results?.length ? `${res.results.length} matches` : (res?.error || "no matches") );
    });
  });

  document.getElementById("btn-parse").addEventListener("click", async () => {
    setStatus("parsing…");
    try {
      const data = await parsePage();
      document.getElementById("preview").textContent = pretty(data);
      setStatus("parsed");
    } catch (e) {
      setStatus(String(e));
    }
  });

  document.getElementById("btn-send-n8n").addEventListener("click", async () => {
    setStatus("sending to n8n…");
    try {
      const data = JSON.parse(document.getElementById("preview").textContent || "{}");
      const res = await sendToN8n(data);
      setStatus("sent");
      document.getElementById("preview").textContent = pretty({ sent: true, response: res });
    } catch (e) {
      setStatus(String(e));
    }
  });

  document.getElementById("btn-ai-complete").addEventListener("click", async () => {
    setStatus("AI completing…");
    try {
      const data = JSON.parse(document.getElementById("preview").textContent || "{}");
      const res = await aiComplete(data);
      const merged = { ...data, ...res }; // expect res.specs_filled etc
      document.getElementById("preview").textContent = pretty(merged);
      setStatus("AI completed");
    } catch (e) {
      setStatus(String(e));
    }
  });

  const dlg = document.getElementById("dlg-settings");
  document.getElementById("open-settings").addEventListener("click", () => dlg.showModal());
  document.getElementById("save-settings").addEventListener("click", async (ev) => {
    ev.preventDefault();
    const next = {
      n8nWebhookUrl: document.getElementById("cfg-n8n").value.trim(),
      aiApiUrl: document.getElementById("cfg-ai").value.trim(),
      apanelApiUrl: document.getElementById("cfg-apanel").value.trim(),
    };
    await setSettings(next);
    dlg.close();
  });
});

