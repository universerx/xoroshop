const DEFAULT_SETTINGS = {
  n8nWebhookUrl: "http://localhost:5678/webhook/shop-parser",
  aiApiUrl: "http://localhost:8000/api/v1/ai",
  apanelApiUrl: "http://localhost:9000/api",
  allowAllHosts: true
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(["settings"], (data) => {
    if (!data.settings) {
      chrome.storage.sync.set({ settings: DEFAULT_SETTINGS });
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "RUN_CONTENT_EVAL") {
    chrome.scripting
      .executeScript({
        target: { tabId: sender.tab.id },
        func: (selector) => {
          try {
            const elements = Array.from(document.querySelectorAll(selector));
            return elements.map((el) => ({
              text: (el.textContent || "").trim(),
              html: el.outerHTML,
              attrs: Array.from(el.attributes).reduce((acc, a) => {
                acc[a.name] = a.value; return acc;
              }, {}),
            }));
          } catch (e) {
            return { error: String(e) };
          }
        },
        args: [message.selector]
      })
      .then((results) => sendResponse({ results: results?.[0]?.result }))
      .catch((err) => sendResponse({ error: String(err) }));
    return true;
  }
});

