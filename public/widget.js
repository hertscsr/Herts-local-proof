(function () {
  "use strict";

  // Figures out its own origin from the <script> tag that loaded it, so it
  // fetches from the right place whether that's the vercel.app URL or a
  // future custom domain — no config needed on the embedding page besides
  // pointing the div id and this script's src at the right place.
  var currentScript = document.currentScript;
  var origin = currentScript ? new URL(currentScript.src).origin : "";

  var CONTAINER_ID = "herts-projects-widget";
  var STYLE_ID = "herts-projects-widget-style";

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent =
      ".hpw-grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));font-family:system-ui,-apple-system,sans-serif;}" +
      ".hpw-card{display:block;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;text-decoration:none;color:#0f172a;transition:box-shadow .15s;}" +
      ".hpw-card:hover{box-shadow:0 4px 14px rgba(0,0,0,.08);}" +
      ".hpw-thumb{width:100%;height:150px;object-fit:cover;display:block;background:#f1f5f9;}" +
      ".hpw-thumb-placeholder{width:100%;height:150px;display:flex;align-items:center;justify-content:center;background:#f1f5f9;color:#94a3b8;font-size:13px;}" +
      ".hpw-body{padding:12px;}" +
      ".hpw-service{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.02em;color:#c2410c;}" +
      ".hpw-location{margin-top:4px;font-weight:600;font-size:15px;}" +
      ".hpw-materials{margin-top:4px;font-size:13px;color:#475569;}" +
      ".hpw-review{margin-top:8px;font-size:13px;color:#334155;}" +
      ".hpw-stars{color:#f59e0b;}" +
      ".hpw-empty{color:#64748b;font-size:14px;font-family:system-ui,-apple-system,sans-serif;}";
    document.head.appendChild(style);
  }

  function starString(rating) {
    var full = Math.round(rating);
    return "★".repeat(full) + "☆".repeat(5 - full);
  }

  function renderJobs(container, jobs, siteUrl) {
    if (!jobs.length) {
      container.innerHTML = '<p class="hpw-empty">No published jobs yet.</p>';
      return;
    }

    var grid = document.createElement("div");
    grid.className = "hpw-grid";

    jobs.forEach(function (job) {
      var card = document.createElement("a");
      card.className = "hpw-card";
      card.href = (siteUrl || origin) + "/projects/" + job.slug;

      var thumbHtml = job.thumbnail
        ? '<img class="hpw-thumb" src="' + job.thumbnail + '" alt="" loading="lazy">'
        : '<div class="hpw-thumb-placeholder">No photo yet</div>';

      var reviewHtml = "";
      if (job.review) {
        var snippet =
          job.review.review.length > 90 ? job.review.review.slice(0, 90) + "…" : job.review.review;
        reviewHtml =
          '<div class="hpw-review"><span class="hpw-stars">' +
          starString(job.review.rating) +
          "</span> “" +
          snippet +
          "”</div>";
      }

      card.innerHTML =
        thumbHtml +
        '<div class="hpw-body">' +
        '<div class="hpw-service">' +
        (job.serviceType || "").replace(/_/g, " ") +
        "</div>" +
        '<div class="hpw-location">' +
        job.city +
        ", " +
        job.state +
        "</div>" +
        '<div class="hpw-materials">' +
        [job.manufacturer, job.product].filter(Boolean).join(" ") +
        "</div>" +
        reviewHtml +
        "</div>";

      grid.appendChild(card);
    });

    container.innerHTML = "";
    container.appendChild(grid);
  }

  function init() {
    var container = document.getElementById(CONTAINER_ID);
    if (!container) return; // the embedding page didn't add the div — nothing to do

    injectStyles();
    container.innerHTML = '<p class="hpw-empty">Loading recent projects…</p>';

    fetch(origin + "/api/public/jobs")
      .then(function (res) {
        if (!res.ok) throw new Error("bad response");
        return res.json();
      })
      .then(function (data) {
        renderJobs(container, data.jobs || [], data.siteUrl);
      })
      .catch(function () {
        container.innerHTML = '<p class="hpw-empty">Couldn’t load recent projects right now.</p>';
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
