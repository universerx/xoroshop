(() => {
  let lastHighlightNodes = [];

  function clearHighlights() {
    for (const node of lastHighlightNodes) {
      node.style.outline = node.__scp_prev_outline || "";
      delete node.__scp_prev_outline;
    }
    lastHighlightNodes = [];
  }

  function highlightSelector(selector) {
    clearHighlights();
    try {
      const nodes = document.querySelectorAll(selector);
      nodes.forEach((n) => {
        n.__scp_prev_outline = n.style.outline;
        n.style.outline = "2px solid #34d399";
        lastHighlightNodes.push(n);
      });
      return { count: nodes.length };
    } catch (e) {
      return { error: String(e) };
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "HIGHLIGHT_SELECTOR") {
      const res = highlightSelector(msg.selector || "");
      sendResponse(res);
    }
    if (msg?.type === "CLEAR_HIGHLIGHTS") {
      clearHighlights();
      sendResponse({ ok: true });
    }
    return true;
  });
})();

