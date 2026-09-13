(function () {
  "use strict";

  // Same origin-detection trick as widget.js — works wherever this script
  // is embedded without any config needed on the page.
  var currentScript = document.currentScript;
  var origin = currentScript ? new URL(currentScript.src).origin : "";
  var mapUrl = origin + "/near-me";

  var STYLE_ID = "hpw-popup-style";
  var BUTTON_ID = "hpw-popup-button";
  var OVERLAY_ID = "hpw-popup-overlay";

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      "#" + BUTTON_ID + "{position:fixed;bottom:20px;right:20px;z-index:999998;" +
      "background:#1b3a5c;color:#fff;border:none;border-radius:999px;padding:14px 20px;" +
      "font-family:system-ui,-apple-system,sans-serif;font-size:14px;font-weight:600;" +
      "box-shadow:0 4px 16px rgba(0,0,0,.2);cursor:pointer;display:flex;align-items:center;gap:8px;" +
      "transition:transform .15s;}" +
      "#" + BUTTON_ID + ":hover{transform:scale(1.04);}" +
      "#" + BUTTON_ID + " svg{flex-shrink:0;}" +
      "#" + OVERLAY_ID + "{position:fixed;inset:0;z-index:999999;background:rgba(15,23,42,.6);" +
      "display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;}" +
      "#" + OVERLAY_ID + "[hidden]{display:none;}" +
      ".hpw-modal{background:#fff;border-radius:12px;width:100%;max-width:1100px;height:100%;" +
      "max-height:800px;position:relative;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3);}" +
      ".hpw-modal iframe{width:100%;height:100%;border:0;display:block;}" +
      ".hpw-modal-close{position:absolute;top:10px;right:10px;z-index:1;background:#fff;" +
      "border:1px solid #e2e8f0;border-radius:999px;width:36px;height:36px;font-size:18px;" +
      "line-height:1;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.15);}" +
      "@media (max-width:640px){#" + OVERLAY_ID + "{padding:0;}.hpw-modal{max-height:100%;border-radius:0;}}";
    document.head.appendChild(style);
  }

  function buildButton() {
    var btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.type = "button";
    btn.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
      '<path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
      "<span>See Our Projects Near You</span>";
    btn.setAttribute("aria-label", "Open map of nearby completed projects");
    return btn;
  }

  function buildOverlay() {
    var overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.hidden = true;

    var modal = document.createElement("div");
    modal.className = "hpw-modal";

    var closeBtn = document.createElement("button");
    closeBtn.className = "hpw-modal-close";
    closeBtn.type = "button";
    closeBtn.innerHTML = "&times;";
    closeBtn.setAttribute("aria-label", "Close");

    var iframe = document.createElement("iframe");
    iframe.title = "Herts Roofing & Construction — projects near you";
    iframe.loading = "lazy";

    modal.appendChild(closeBtn);
    modal.appendChild(iframe);
    overlay.appendChild(modal);

    function close() {
      overlay.hidden = true;
      document.body.style.overflow = "";
      iframe.src = ""; // stop the map/tiles loading in the background once closed
    }

    function open() {
      if (!iframe.src) iframe.src = mapUrl;
      overlay.hidden = false;
      document.body.style.overflow = "hidden";
    }

    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) close();
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !overlay.hidden) close();
    });

    return { element: overlay, open: open };
  }

  function init() {
    injectStyles();
    var overlay = buildOverlay();
    var button = buildButton();
    button.addEventListener("click", overlay.open);
    document.body.appendChild(button);
    document.body.appendChild(overlay.element);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
