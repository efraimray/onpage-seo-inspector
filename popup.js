const auditButton = document.getElementById("audit-button");
const auditStatus = document.getElementById("audit-status");
const tabs = Array.from(document.querySelectorAll("[data-tab]"));

function collectPageData() {
  const meta = (name) => document.querySelector(`meta[name="${name}" i]`)?.content?.trim() || "";
  const property = (name) => document.querySelector(`meta[property="${name}" i]`)?.content?.trim() || "";
  const canonical = document.querySelector('link[rel="canonical"]')?.href || "";
  const robots = meta("robots") || meta("googlebot") || "Not specified";
  const links = Array.from(document.querySelectorAll("a[href]")).map((anchor) => ({
    text: (anchor.innerText || anchor.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 180),
    href: anchor.href,
    rel: anchor.rel || "",
    target: anchor.target || ""
  }));
  const images = Array.from(document.images).map((image) => ({
    src: image.currentSrc || image.src,
    alt: image.getAttribute("alt"),
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height
  }));
  const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((heading) => ({
    level: Number(heading.tagName.slice(1)),
    text: heading.innerText.trim().replace(/\s+/g, " ").slice(0, 220)
  }));
  const schemaTypes = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((script) => {
    try {
      const parsed = JSON.parse(script.textContent || "null");
      const collectTypes = (value) => {
        if (!value || typeof value !== "object") return [];
        const own = value["@type"] ? (Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]]) : [];
        const graph = Array.isArray(value["@graph"]) ? value["@graph"].flatMap(collectTypes) : [];
        return [...own, ...graph];
      };
      return collectTypes(parsed);
    } catch {
      return ["Invalid JSON-LD"];
    }
  }).flat();
  const internalLinks = links.filter((link) => {
    try { return new URL(link.href).hostname === location.hostname; } catch { return false; }
  });
  const externalLinks = links.length - internalLinks.length;
  const indexable = !/(^|[,\s])noindex([,\s]|$)/i.test(robots);
  const title = document.title.trim();
  const description = meta("description");

  return {
    title,
    url: location.href,
    hostname: location.hostname,
    description,
    canonical,
    robots,
    indexable,
    lang: document.documentElement.lang || "Not set",
    viewport: meta("viewport") || "Not set",
    charset: document.characterSet || "Unknown",
    ogTitle: property("og:title"),
    ogDescription: property("og:description"),
    ogImage: property("og:image"),
    twitterCard: meta("twitter:card"),
    headings,
    links: links.slice(0, 80),
    totalLinks: links.length,
    internalLinks: internalLinks.length,
    externalLinks,
    images,
    schemaTypes: [...new Set(schemaTypes)],
    titleLength: title.length,
    descriptionLength: description.length,
    missingImageAlt: images.filter((image) => image.alt === null || image.alt.trim() === "").length,
    duplicateH1: headings.filter((heading) => heading.level === 1).length > 1
  };
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function resultRow(label, value, state = "good", title = "") {
  const symbol = state === "good" ? "✓" : state === "bad" ? "!" : "•";
  return `<div class="result-row" title="${escapeHtml(title || value)}"><span class="result-icon ${state}">${symbol}</span><span class="result-label">${escapeHtml(label)}</span><span class="result-value ${value ? "" : "muted"}">${escapeHtml(value || "Missing")}</span></div>`;
}

function detailRow(main, sub = "", index = "") {
  return `<div class="detail-row"><span class="detail-index">${escapeHtml(index)}</span><span class="detail-copy"><span class="detail-main" title="${escapeHtml(main)}">${escapeHtml(main || "(no text)")}</span>${sub ? `<span class="detail-sub" title="${escapeHtml(sub)}">${escapeHtml(sub)}</span>` : ""}</span></div>`;
}

function metric(value, label) {
  return `<div class="metric"><span class="metric-value">${escapeHtml(value)}</span><span class="metric-label">${escapeHtml(label)}</span></div>`;
}

function lengthState(length, min, max) {
  if (!length) return "bad";
  return length >= min && length <= max ? "good" : "warn";
}

function renderAudit(data) {
  document.getElementById("page-title").textContent = data.title || "Untitled page";
  document.getElementById("page-url").textContent = data.url;
  const h1Count = data.headings.filter((heading) => heading.level === 1).length;
  const checks = [
    Boolean(data.title),
    lengthState(data.titleLength, 30, 60) === "good",
    Boolean(data.description),
    lengthState(data.descriptionLength, 70, 160) === "good",
    h1Count === 1,
    Boolean(data.canonical),
    data.indexable,
    data.missingImageAlt === 0,
    data.viewport !== "Not set",
    data.schemaTypes.length > 0
  ];
  const score = Math.round((checks.filter(Boolean).length / checks.length) * 100);
  document.getElementById("score").textContent = String(score);
  document.getElementById("meta-status").textContent = `${checks.filter(Boolean).length}/${checks.length} signals`;
  document.getElementById("appearance-results").innerHTML = [
    resultRow("Title tag", data.title, data.title ? lengthState(data.titleLength, 30, 60) : "bad", `${data.titleLength} characters`),
    resultRow("Meta description", data.description, data.description ? lengthState(data.descriptionLength, 70, 160) : "bad", `${data.descriptionLength} characters`),
    resultRow("Canonical URL", data.canonical, data.canonical ? "good" : "warn"),
    resultRow("Robots directive", data.robots, data.indexable ? "good" : "warn")
  ].join("");
  document.getElementById("social-results").innerHTML = [
    resultRow("Open Graph title", data.ogTitle, data.ogTitle ? "good" : "warn"),
    resultRow("Open Graph description", data.ogDescription, data.ogDescription ? "good" : "warn"),
    resultRow("Open Graph image", data.ogImage, data.ogImage ? "good" : "warn"),
    resultRow("Twitter card", data.twitterCard, data.twitterCard ? "good" : "warn")
  ].join("");
  document.getElementById("technical-results").innerHTML = [
    resultRow("Language", data.lang, data.lang !== "Not set" ? "good" : "warn"),
    resultRow("Viewport", data.viewport, data.viewport !== "Not set" ? "good" : "warn"),
    resultRow("Page encoding", data.charset, "good")
  ].join("");
  document.getElementById("schema-results").innerHTML = data.schemaTypes.length
    ? data.schemaTypes.slice(0, 5).map((type) => resultRow("JSON-LD type", type, type === "Invalid JSON-LD" ? "bad" : "good")).join("")
    : resultRow("JSON-LD", "No structured data found", "warn");

  const headingCounts = [1, 2, 3, 4, 5, 6].map((level) => `H${level} ${data.headings.filter((heading) => heading.level === level).length}`);
  document.getElementById("heading-count").textContent = `${data.headings.length} headings`;
  document.getElementById("heading-results").innerHTML = `<div class="metric-grid">${headingCounts.map((label) => metric(label.split(" ")[1], label.split(" ")[0])).join("")}</div>` +
    (data.headings.length ? data.headings.map((heading, index) => `<div class="detail-row"><span class="detail-level">H${heading.level}</span><span class="detail-copy"><span class="detail-main" title="${escapeHtml(heading.text)}">${escapeHtml(heading.text || "(empty heading)")}</span></span><span class="detail-index">${index + 1}</span></div>`).join("") : `<div class="empty-state">No heading elements found.</div>`);

  document.getElementById("link-count").textContent = `${data.totalLinks} links`;
  document.getElementById("link-metrics").innerHTML = metric(data.totalLinks, "Total") + metric(data.internalLinks, "Internal") + metric(data.externalLinks, "External");
  const linkSamples = data.links.slice(0, 16);
  document.getElementById("link-results").innerHTML = linkSamples.length
    ? linkSamples.map((link, index) => detailRow(link.text || link.href, link.href, index + 1)).join("")
    : `<div class="empty-state">No links found.</div>`;

  document.getElementById("image-count").textContent = `${data.images.length} images`;
  document.getElementById("image-metrics").innerHTML = metric(data.images.length, "Total") + metric(data.missingImageAlt, "Missing alt") + metric(data.images.length - data.missingImageAlt, "Alt provided");
  document.getElementById("image-results").innerHTML = data.images.length
    ? data.images.slice(0, 16).map((image, index) => detailRow(image.alt || "Missing alt text", image.src, index + 1)).join("")
    : `<div class="empty-state">No images found.</div>`;

  document.getElementById("updated-at").textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  auditStatus.textContent = data.indexable ? "Page is not marked noindex. Audit data stays on your device." : "This page has a noindex directive. Audit data stays on your device.";
}

async function runAudit() {
  auditButton.disabled = true;
  auditButton.innerHTML = '<span aria-hidden="true">…</span> Inspecting';
  auditStatus.textContent = "Reading page signals…";
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !/^https?:/.test(tab.url || "")) throw new Error("This page cannot be inspected. Open a regular website and try again.");
    const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: collectPageData });
    if (!result?.result) throw new Error("The page did not return audit data. Try reloading the page.");
    renderAudit(result.result);
  } catch (error) {
    auditStatus.textContent = error instanceof Error ? error.message : "Could not inspect this page.";
  } finally {
    auditButton.disabled = false;
    auditButton.innerHTML = '<span aria-hidden="true">↻</span> Audit page';
  }
}

auditButton.addEventListener("click", runAudit);
tabs.forEach((tab) => tab.addEventListener("click", () => {
  tabs.forEach((item) => {
    const active = item === tab;
    item.classList.toggle("is-active", active);
    item.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => { panel.hidden = panel.id !== `panel-${tab.dataset.tab}`; });
}));
