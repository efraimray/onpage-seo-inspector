# OnPage SEO Inspector

A Chrome extension for reviewing on-page SEO signals on the website you are currently viewing. Run an audit from the popup and inspect metadata, headings, links, images, social tags, and structured data in one place.

Audits run in your browser against the active page. No account, API key, or backend service is required.

## Features

- SEO score with a category breakdown and prioritized recommendations
- Title, meta description, canonical URL, robots directives, language, viewport, and encoding checks
- H1-H6 heading counts and a heading-by-heading list
- Total, internal, and external link counts with a sample of page links
- Image counts, including images with and without alt text and title attributes
- Structured data detection for JSON-LD, Microdata, RDFa, and common Microformats
- Expandable structured-data entities with property/value details
- Entity, unique-type, and repeated-type counts for structured data
- Open Graph and Twitter Card checks

## Install in Chrome

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Turn on **Developer mode**.
4. Select **Load unpacked** and choose this project folder.
5. Open a regular website and select the OnPage SEO Inspector extension. The popup starts an audit automatically; select **Audit page** to run it again.

The extension can inspect regular HTTP and HTTPS pages. Browser-internal pages, extension pages, and other restricted URLs cannot be inspected.

## Permissions and privacy

The extension requests Chrome's `activeTab` and `scripting` permissions. These allow it to read the active page after you open the popup and execute the page audit. Page content is processed locally by the extension; there is no project backend or analytics service.

## Development

This is a lightweight Manifest V3 extension with no build step or package installation. The popup is implemented in `popup.html`, `popup.css`, and `popup.js`; extension configuration is in `manifest.json`.

