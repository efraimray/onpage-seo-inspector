const auditButton = document.getElementById("audit-button");
const auditStatus = document.getElementById("audit-status");
const tabs = Array.from(document.querySelectorAll("[data-tab]"));
const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));
const importantSection = document.querySelector(".important-section");

function setActiveTab(selectedTabName) {
  importantSection.hidden = selectedTabName !== "overview";
  tabs.forEach((tab) => {
    const isActive = tab.dataset.tab === selectedTabName;
    tab.classList.toggle("is-active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });

  tabPanels.forEach((panel) => {
    const isVisible = panel.id === `panel-${selectedTabName}`;
    panel.classList.toggle("is-visible", isVisible);
    panel.hidden = !isVisible;
  });
}

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
    title: image.getAttribute("title"),
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height
  }));
  const headings = Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6")).map((heading) => ({
    level: Number(heading.tagName.slice(1)),
    text: heading.innerText.trim().replace(/\s+/g, " ").slice(0, 220)
  }));
  const displayType = (type) => {
    const value = String(type).trim().replace(/^schema:/i, "");
    return value.split(/[\/#]/).filter(Boolean).pop() || value;
  };
  const schemaScripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]')).map((script) => {
    try {
      const parsed = JSON.parse(script.textContent || "null");
      const collectEntities = (value) => {
        if (Array.isArray(value)) return value.flatMap(collectEntities);
        if (!value || typeof value !== "object") return [];
        const own = value["@type"] ? (Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]]) : [];
        const properties = Object.entries(value)
          .filter(([name]) => !["@context", "@type", "@graph"].includes(name))
          .map(([name, propertyValue]) => ({ name, value: propertyValue }));
        const entities = own.map((type) => ({ type: String(type), properties }));
        const nested = Object.entries(value)
          .filter(([name]) => !["@context", "@type"].includes(name))
          .flatMap(([, nestedValue]) => collectEntities(nestedValue));
        return [...entities, ...nested];
      };
      return { valid: true, entities: collectEntities(parsed) };
    } catch {
      return { valid: false, entities: [] };
    }
  });
  const schemaItems = schemaScripts.flatMap((script, index) => {
    const source = `JSON-LD block ${index + 1}`;
    if (!script.valid) return [{ type: "Invalid JSON-LD", source, state: "bad", properties: [] }];
    if (!script.entities.length) return [{ type: "No @type found", source, state: "warn", properties: [] }];
    return script.entities.map((entity) => ({ type: displayType(entity.type), source: "JSON-LD", state: "good", properties: entity.properties }));
  });
  const readPropertyValue = (element) => {
    if (element.hasAttribute("content")) return element.getAttribute("content") || "";
    if (element.hasAttribute("datetime")) return element.getAttribute("datetime") || "";
    if (element.hasAttribute("value")) return element.getAttribute("value") || "";
    const tagName = element.tagName.toLowerCase();
    if (["a", "area", "link"].includes(tagName)) return element.href || element.getAttribute("href") || "";
    if (["img", "audio", "embed", "iframe", "source", "track", "video"].includes(tagName)) return element.src || element.getAttribute("src") || "";
    return (element.innerText || element.textContent || "").trim().replace(/\s+/g, " ").slice(0, 500);
  };
  const collectDomProperties = (root, selector, scopeSelector, nameAttribute) => Array.from(root.querySelectorAll(selector))
    .filter((element) => element.closest(scopeSelector) === root)
    .flatMap((element) => {
      const value = readPropertyValue(element);
      return (element.getAttribute(nameAttribute) || "").trim().split(/\s+/).filter(Boolean).map((name) => ({ name, value }));
    });
  Array.from(document.querySelectorAll("[itemscope][itemtype]")).forEach((element) => {
    const properties = collectDomProperties(element, "[itemprop]", "[itemscope]", "itemprop");
    (element.getAttribute("itemtype") || "").trim().split(/\s+/).filter(Boolean).forEach((type) => {
      schemaItems.push({ type: displayType(type), source: "Microdata", state: "good", properties });
    });
  });
  Array.from(document.querySelectorAll("[typeof]")).forEach((element) => {
    const properties = collectDomProperties(element, "[property]", "[typeof]", "property");
    (element.getAttribute("typeof") || "").trim().split(/\s+/).filter(Boolean).forEach((type) => {
      schemaItems.push({ type: displayType(type), source: "RDFa", state: "good", properties });
    });
  });
  const microformatTypes = new Set(["hentry", "h-entry", "h-card", "h-event", "h-product", "h-recipe", "h-review", "h-feed", "h-adr", "h-geo"]);
  Array.from(document.querySelectorAll("[class]")).forEach((element) => {
    element.classList.forEach((className) => {
      if (!microformatTypes.has(className)) return;
      const itemSelector = Array.from(microformatTypes).map((type) => `.${type}`).join(",");
      const properties = Array.from(element.querySelectorAll("[class]"))
        .filter((child) => child.closest(itemSelector) === element)
        .flatMap((child) => {
          const token = Array.from(child.classList).find((value) => /^(p|u|dt|e)-/.test(value)) ||
            Array.from(child.classList).find((value) => ["entry-title", "summary", "author", "published", "updated", "url"].includes(value));
          return token ? [{ name: token.replace(/^(p|u|dt|e)-/, ""), value: readPropertyValue(child) }] : [];
        });
      schemaItems.push({ type: className, source: "Microformats", state: "good", properties });
    });
  });
  const schemaTypes = [...new Set(schemaItems.filter((item) => item.state === "good").map((item) => item.type))];
  const schemaTypeOccurrences = schemaItems.filter((item) => item.state === "good").map((item) => item.type);
  const schemaDuplicateCount = schemaTypeOccurrences.length - new Set(schemaTypeOccurrences).size;
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
    schemaScripts,
    schemaItems,
    schemaTypes,
    schemaDuplicateCount,
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

function importantDetail(icon, label, value, badge, state) {
  const symbol = state === "good" ? "✓" : state === "bad" ? "×" : "!";
  return `<article class="important-detail"><span class="important-icon" aria-hidden="true">${icon}</span><div class="important-copy"><div class="important-detail-heading"><strong>${escapeHtml(label)}</strong><span class="status-badge is-${state}"><span aria-hidden="true">${symbol}</span>${escapeHtml(badge)}</span></div><p class="important-value" title="${escapeHtml(value)}">${escapeHtml(value)}</p></div></article>`;
}

function schemaRows(items) {
  if (!items.length) return `<div class="empty-state">No structured data found on this page.</div>`;
  return items.map((item) => {
    const propertyRows = item.properties?.length
      ? item.properties.map((property) => `<div class="schema-property-row"><span class="schema-property-name">${escapeHtml(property.name)}</span><span class="schema-property-value">${escapeHtml(schemaValueText(property.value))}</span></div>`).join("")
      : `<div class="schema-no-properties">${item.state === "bad" ? "This JSON-LD block could not be parsed." : item.state === "warn" ? "No typed entity was found in this block." : "No properties found for this item."}</div>`;
    return `<details class="schema-entity is-${item.state}" role="listitem"><summary><span class="schema-type-name">${escapeHtml(item.type)}</span><span class="schema-source">${escapeHtml(item.source)}</span></summary><div class="schema-properties">${propertyRows}</div></details>`;
  }).join("");
}

function schemaValueText(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return value.map(schemaValueText).filter(Boolean).join(", ");
  if (typeof value === "object") {
    const identity = [value["@type"], value.name, value["@id"]].filter((part) => typeof part === "string" && part).join(": ");
    return (identity || JSON.stringify(value)).slice(0, 500);
  }
  return String(value);
}

function schemaOverviewRows(items) {
  if (!items.length) return resultRow("Structured data", "None detected", "warn");
  return items.slice(0, 5).map((item) => resultRow(item.source, item.type, item.state)).join("");
}

function detailRow(main, sub = "", index = "") {
  return `<div class="detail-row"><span class="detail-index">${escapeHtml(index)}</span><span class="detail-copy"><span class="detail-main" title="${escapeHtml(main)}">${escapeHtml(main || "(no text)")}</span>${sub ? `<span class="detail-sub" title="${escapeHtml(sub)}">${escapeHtml(sub)}</span>` : ""}</span></div>`;
}

function metric(value, label) {
  return `<div class="metric"><span class="metric-value">${escapeHtml(value)}</span><span class="metric-label">${escapeHtml(label)}</span></div>`;
}

function summaryMiniMetric(label, value) {
  return `<span class="summary-mini-item"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></span>`;
}

function imageGalleryItem(image, index) {
  const safeSrc = image.src || "";
  const safeAlt = image.alt || `Image ${index + 1}`;
  const label = safeAlt && safeAlt.trim() ? safeAlt : `Image ${index + 1}`;
  const url = safeSrc || "Unknown image source";

  return `
    <div class="media-item">
      <div class="media-thumb">
        <img src="${escapeHtml(safeSrc)}" alt="${escapeHtml(safeAlt)}" onerror="this.style.display='none'; this.parentElement.classList.add('missing-thumb');" />
      </div>
      <div class="media-copy">
        <div class="media-name">${escapeHtml(label)}</div>
        <a class="media-url" href="${escapeHtml(url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(url)}</a>
      </div>
    </div>
  `;
}

function lengthState(length, min, max) {
  if (!length) return "bad";
  return length >= min && length <= max ? "good" : "warn";
}

function renderAudit(data) {
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
  const passedChecks = checks.filter(Boolean).length;
  const score = Math.round((passedChecks / checks.length) * 100);
  document.getElementById("score").textContent = String(score);
  document.getElementById("meta-status").textContent = `${passedChecks}/${checks.length} signals`;

  const categories = [
    { name: "Search appearance", checks: [checks[0], checks[1], checks[2], checks[3], checks[5]] },
    { name: "Content structure", checks: [checks[4]] },
    { name: "Technical", checks: [checks[6], checks[8]] },
    { name: "Media & schema", checks: [checks[7], checks[9]] }
  ];
  document.getElementById("breakdown-total").textContent = `${passedChecks}/${checks.length} signals`;
  document.getElementById("score-breakdown").innerHTML = categories.map((category) => {
    const passed = category.checks.filter(Boolean).length;
    const percent = Math.round((passed / category.checks.length) * 100);
    return `<div class="score-bar-row"><div class="score-bar-label"><span>${escapeHtml(category.name)}</span><strong>${passed}/${category.checks.length}</strong></div><div class="score-track" role="progressbar" aria-label="${escapeHtml(category.name)}" aria-valuemin="0" aria-valuemax="${category.checks.length}" aria-valuenow="${passed}"><span class="score-fill" style="--bar-value:${percent}%"></span></div></div>`;
  }).join("");

  const recommendations = [];
  if (!data.title || lengthState(data.titleLength, 30, 60) !== "good") recommendations.push(["Review the title tag", data.title ? `${data.titleLength} characters; aim for 30–60.` : "Add a descriptive page title."]);
  if (!data.description || lengthState(data.descriptionLength, 70, 160) !== "good") recommendations.push(["Improve the meta description", data.description ? `${data.descriptionLength} characters; aim for 70–160.` : "Add a unique search description."]);
  if (h1Count !== 1) recommendations.push(["Use one clear H1 heading", `Found ${h1Count} H1 headings.`]);
  if (!data.canonical) recommendations.push(["Add a canonical URL", "Declare the preferred URL for this page."]);
  if (!data.indexable) recommendations.push(["Review the noindex directive", "Search engines may be blocked from indexing this page."]);
  if (data.viewport === "Not set") recommendations.push(["Set a mobile viewport", "Add a responsive viewport meta tag."]);
  if (data.missingImageAlt > 0) recommendations.push(["Add image alternative text", `${data.missingImageAlt} image${data.missingImageAlt === 1 ? " is" : "s are"} missing alt text.`]);
  if (data.schemaTypes.length === 0) recommendations.push(["Add structured data", "No JSON-LD schema types were detected."]);
  document.getElementById("priority-count").textContent = String(recommendations.length);
  document.getElementById("priority-nav-count").textContent = String(recommendations.length);
  document.getElementById("priority-list").innerHTML = recommendations.length
    ? recommendations.map(([title, detail]) => `<div class="priority-item"><span class="priority-marker" aria-hidden="true">!</span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div></div>`).join("")
    : `<div class="priority-empty"><span aria-hidden="true">✓</span><span>All tracked checks look good.</span></div>`;

  document.getElementById("overview-heading-count").textContent = String(data.headings.length);
  document.getElementById("overview-link-count").textContent = String(data.totalLinks);
  document.getElementById("overview-image-count").textContent = String(data.images.length);
  document.getElementById("overview-schema-count").textContent = String(data.schemaTypes.length);
  const titleState = data.title ? lengthState(data.titleLength, 30, 60) : "bad";
  const descriptionState = data.description ? lengthState(data.descriptionLength, 70, 160) : "bad";
  document.getElementById("appearance-results").innerHTML = [
    importantDetail("T", "Title", data.title || "No title tag found", `${data.titleLength} characters`, titleState),
    importantDetail("D", "Description", data.description || "No meta description found", `${data.descriptionLength} characters`, descriptionState),
    importantDetail("↗", "URL", data.url, data.indexable ? "Indexable" : "Noindex", data.indexable ? "good" : "warn"),
    importantDetail("◎", "Canonical", data.canonical || "No canonical URL declared", data.canonical ? "Canonical set" : "Missing", data.canonical ? "good" : "bad")
  ].join("");
  const metadataRows = [
    resultRow("Title tag", data.title, titleState, `${data.titleLength} characters`),
    resultRow("Meta description", data.description, descriptionState, `${data.descriptionLength} characters`),
    resultRow("Canonical URL", data.canonical, data.canonical ? "good" : "warn"),
    resultRow("Robots directive", data.robots, data.indexable ? "good" : "warn"),
    resultRow("Language", data.lang, data.lang !== "Not set" ? "good" : "warn"),
    resultRow("Mobile viewport", data.viewport, data.viewport !== "Not set" ? "good" : "warn"),
    resultRow("Page encoding", data.charset, data.charset !== "Unknown" ? "good" : "warn")
  ];
  document.getElementById("metadata-panel-results").innerHTML = metadataRows.join("");
  const metadataFieldsPresent = [data.title, data.description, data.canonical, data.robots !== "Not specified", data.lang !== "Not set", data.viewport !== "Not set", data.charset !== "Unknown"].filter(Boolean).length;
  document.getElementById("metadata-summary").textContent = `${metadataFieldsPresent}/7 fields present`;
  const socialRows = [
    resultRow("Open Graph title", data.ogTitle, data.ogTitle ? "good" : "warn"),
    resultRow("Open Graph description", data.ogDescription, data.ogDescription ? "good" : "warn"),
    resultRow("Open Graph image", data.ogImage, data.ogImage ? "good" : "warn"),
    resultRow("Twitter card", data.twitterCard, data.twitterCard ? "good" : "warn")
  ];
  document.getElementById("social-results").innerHTML = socialRows.join("");
  document.getElementById("social-panel-results").innerHTML = socialRows.join("");
  const socialPresent = [data.ogTitle, data.ogDescription, data.ogImage, data.twitterCard].filter(Boolean).length;
  document.getElementById("social-summary").textContent = `${socialPresent}/4 fields present`;
  document.getElementById("technical-results").innerHTML = [
    resultRow("Language", data.lang, data.lang !== "Not set" ? "good" : "warn"),
    resultRow("Viewport", data.viewport, data.viewport !== "Not set" ? "good" : "warn"),
    resultRow("Page encoding", data.charset, "good")
  ].join("");
  const advancedChecks = [
    ["Indexability", data.indexable ? "Indexable" : "Noindex", data.indexable ? "good" : "warn"],
    ["Canonical URL", data.canonical ? "Present" : "Missing", data.canonical ? "good" : "warn"],
    ["H1 structure", h1Count === 1 ? "One H1" : `${h1Count} H1 headings`, h1Count === 1 ? "good" : "warn"],
    ["Language", data.lang, data.lang !== "Not set" ? "good" : "warn"],
    ["Mobile viewport", data.viewport, data.viewport !== "Not set" ? "good" : "warn"],
    ["Page encoding", data.charset, "good"]
  ];
  document.getElementById("advanced-summary").textContent = `${advancedChecks.filter(([, , state]) => state === "good").length}/${advancedChecks.length} checks pass`;
  document.getElementById("advanced-panel-results").innerHTML = advancedChecks
    .map(([label, value, state]) => resultRow(label, value, state))
    .join("");
  document.getElementById("schema-results").innerHTML = schemaOverviewRows(data.schemaItems);
  const detectedSchemaItems = data.schemaItems.filter((item) => item.state === "good").length;
  const schemaIssues = data.schemaItems.length - detectedSchemaItems;
  document.getElementById("schema-summary").textContent = detectedSchemaItems
    ? `${detectedSchemaItems} item${detectedSchemaItems === 1 ? "" : "s"}${schemaIssues ? ` · ${schemaIssues} issue${schemaIssues === 1 ? "" : "s"}` : ""}`
    : schemaIssues ? `${schemaIssues} issue${schemaIssues === 1 ? "" : "s"}` : "No data found";
  document.getElementById("schema-panel-results").innerHTML = schemaRows(data.schemaItems);
  document.getElementById("schema-entity-count").textContent = String(data.schemaItems.filter((item) => item.state === "good").length);
  document.getElementById("schema-unique-type-count").textContent = String(data.schemaTypes.length);
  document.getElementById("schema-duplicate-count").textContent = String(data.schemaDuplicateCount);

  const headingLevelCounts = [1, 2, 3, 4, 5, 6].map((level) => ({
    level,
    count: data.headings.filter((heading) => heading.level === level).length
  }));
  document.getElementById("overview-heading-breakdown").innerHTML = headingLevelCounts.map(({ level, count }) =>
    `<div class="heading-count-item"><strong>${count}</strong><span>H${level}</span></div>`
  ).join("");
  document.getElementById("overview-link-breakdown").innerHTML = summaryMiniMetric("Internal", data.internalLinks) + summaryMiniMetric("External", data.externalLinks);
  document.getElementById("overview-image-breakdown").innerHTML = summaryMiniMetric("With alt", data.images.length - data.missingImageAlt) + summaryMiniMetric("Without", data.missingImageAlt);
  document.getElementById("overview-schema-breakdown").innerHTML = summaryMiniMetric("Entities", data.schemaItems.filter((item) => item.state === "good").length) + summaryMiniMetric("Duplicates", data.schemaDuplicateCount);
  document.getElementById("heading-count").textContent = `${data.headings.length} headings`;
  document.getElementById("heading-results").innerHTML = data.headings.length
    ? data.headings.map((heading, index) => `<div class="detail-row"><span class="detail-level">H${heading.level}</span><span class="detail-copy"><span class="detail-main" title="${escapeHtml(heading.text)}">${escapeHtml(heading.text || "(empty heading)")}</span></span><span class="detail-index">${index + 1}</span></div>`).join("")
    : `<div class="empty-state">No heading elements found.</div>`;

  document.getElementById("link-count").textContent = `${data.totalLinks} links`;
  document.getElementById("link-metrics").innerHTML = metric(data.totalLinks, "Total") + metric(data.internalLinks, "Internal") + metric(data.externalLinks, "External");
  const linkSamples = data.links.slice(0, 16);
  document.getElementById("link-results").innerHTML = linkSamples.length
    ? linkSamples.map((link, index) => detailRow(link.text || link.href, link.href, index + 1)).join("")
    : `<div class="empty-state">No links found.</div>`;

  document.getElementById("image-count").textContent = data.images.length;
  document.getElementById("image-with-alt").textContent = data.images.length - data.missingImageAlt;
  document.getElementById("image-without-alt").textContent = data.missingImageAlt;
  document.getElementById("image-without-title").textContent = data.images.filter((image) => !image.title || !image.title.trim()).length;
  document.getElementById("image-results").innerHTML = data.images.length
    ? `<div class="media-gallery">${data.images.slice(0, 12).map((image, index) => imageGalleryItem(image, index)).join("")}</div>`
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
  setActiveTab(tab.dataset.tab);
}));

runAudit();
