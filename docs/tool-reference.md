<!-- AUTO GENERATED DO NOT EDIT - run 'npm run gen' to update-->

# Chrome DevTools MCP Tool Reference (~17987 cl100k_base tokens)

- **[Input automation](#input-automation)** (10 tools)
  - [`click`](#click)
  - [`drag`](#drag)
  - [`fill`](#fill)
  - [`fill_form`](#fill_form)
  - [`handle_dialog`](#handle_dialog)
  - [`hover`](#hover)
  - [`press_key`](#press_key)
  - [`scroll_into_view`](#scroll_into_view)
  - [`type_text`](#type_text)
  - [`upload_file`](#upload_file)
- **[Navigation automation](#navigation-automation)** (7 tools)
  - [`broadcast_evaluate`](#broadcast_evaluate)
  - [`close_page`](#close_page)
  - [`list_pages`](#list_pages)
  - [`navigate_page`](#navigate_page)
  - [`new_page`](#new_page)
  - [`select_page`](#select_page)
  - [`wait_for`](#wait_for)
- **[Emulation](#emulation)** (9 tools)
  - [`clear_idle_state_override`](#clear_idle_state_override)
  - [`emulate`](#emulate)
  - [`emulate_idle_state`](#emulate_idle_state)
  - [`emulate_reduced_motion`](#emulate_reduced_motion)
  - [`emulate_sensor`](#emulate_sensor)
  - [`emulate_vision_deficiency`](#emulate_vision_deficiency)
  - [`override_permissions`](#override_permissions)
  - [`reset_permissions`](#reset_permissions)
  - [`resize_page`](#resize_page)
- **[Performance](#performance)** (3 tools)
  - [`performance_analyze_insight`](#performance_analyze_insight)
  - [`performance_start_trace`](#performance_start_trace)
  - [`performance_stop_trace`](#performance_stop_trace)
- **[Network](#network)** (2 tools)
  - [`get_network_request`](#get_network_request)
  - [`list_network_requests`](#list_network_requests)
- **[Debugging](#debugging)** (10 tools)
  - [`evaluate_script`](#evaluate_script)
  - [`get_box_model`](#get_box_model)
  - [`get_computed_styles`](#get_computed_styles)
  - [`get_console_message`](#get_console_message)
  - [`get_layout_metrics`](#get_layout_metrics)
  - [`lighthouse_audit`](#lighthouse_audit)
  - [`list_console_messages`](#list_console_messages)
  - [`query_selector_all`](#query_selector_all)
  - [`take_screenshot`](#take_screenshot)
  - [`take_snapshot`](#take_snapshot)
- **[Extensions](#extensions)** (5 tools)
  - [`install_extension`](#install_extension)
  - [`list_extensions`](#list_extensions)
  - [`reload_extension`](#reload_extension)
  - [`trigger_extension_action`](#trigger_extension_action)
  - [`uninstall_extension`](#uninstall_extension)
- **[Memory](#memory)** (1 tools)
  - [`take_memory_snapshot`](#take_memory_snapshot)
- **[Storage](#storage)** (19 tools)
  - [`clear_all_storage`](#clear_all_storage)
  - [`clear_cookies`](#clear_cookies)
  - [`clear_indexeddb_object_store`](#clear_indexeddb_object_store)
  - [`clear_local_storage`](#clear_local_storage)
  - [`clear_session_storage`](#clear_session_storage)
  - [`delete_cache`](#delete_cache)
  - [`delete_cache_entry`](#delete_cache_entry)
  - [`delete_cookie`](#delete_cookie)
  - [`delete_indexeddb_database`](#delete_indexeddb_database)
  - [`get_cache_entries`](#get_cache_entries)
  - [`get_indexeddb_data`](#get_indexeddb_data)
  - [`get_local_storage`](#get_local_storage)
  - [`get_session_storage`](#get_session_storage)
  - [`list_caches`](#list_caches)
  - [`list_cookies`](#list_cookies)
  - [`list_indexeddb_databases`](#list_indexeddb_databases)
  - [`set_cookie`](#set_cookie)
  - [`set_local_storage`](#set_local_storage)
  - [`set_session_storage`](#set_session_storage)
- **[Network interception](#network-interception)** (10 tools)
  - [`block_urls`](#block_urls)
  - [`clear_interceptors`](#clear_interceptors)
  - [`intercept_network`](#intercept_network)
  - [`list_har_recordings`](#list_har_recordings)
  - [`list_interceptors`](#list_interceptors)
  - [`mock_response`](#mock_response)
  - [`modify_request_headers`](#modify_request_headers)
  - [`record_har_start`](#record_har_start)
  - [`record_har_stop`](#record_har_stop)
  - [`remove_interceptor`](#remove_interceptor)
- **[Service workers / PWA](#service-workers-/-pwa)** (9 tools)
  - [`evaluate_in_worker`](#evaluate_in_worker)
  - [`get_manifest`](#get_manifest)
  - [`list_service_workers`](#list_service_workers)
  - [`skip_waiting`](#skip_waiting)
  - [`start_service_worker`](#start_service_worker)
  - [`stop_service_worker`](#stop_service_worker)
  - [`trigger_background_sync`](#trigger_background_sync)
  - [`unregister_service_worker`](#unregister_service_worker)
  - [`update_service_worker`](#update_service_worker)
- **[Code coverage](#code-coverage)** (4 tools)
  - [`start_css_coverage`](#start_css_coverage)
  - [`start_js_coverage`](#start_js_coverage)
  - [`stop_css_coverage`](#stop_css_coverage)
  - [`stop_js_coverage`](#stop_js_coverage)
- **[Page export](#page-export)** (3 tools)
  - [`export_dom_html`](#export_dom_html)
  - [`print_to_pdf`](#print_to_pdf)
  - [`save_mhtml`](#save_mhtml)

## Input automation

### `click`

**Description:** Clicks on the provided element

**Parameters:**

- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot
- **dblClick** (boolean) _(optional)_: Set to true for double clicks. Default is false.
- **includeSnapshot** (boolean) _(optional)_: Whether to include a snapshot in the response. Default is false.

---

### `drag`

**Description:** [`Drag`](#drag) an element onto another element

**Parameters:**

- **from_uid** (string) **(required)**: The uid of the element to [`drag`](#drag)
- **to_uid** (string) **(required)**: The uid of the element to drop into
- **includeSnapshot** (boolean) _(optional)_: Whether to include a snapshot in the response. Default is false.

---

### `fill`

**Description:** Type text into an input, text area or select an option from a &lt;select&gt; element.

**Parameters:**

- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot
- **value** (string) **(required)**: The value to [`fill`](#fill) in
- **includeSnapshot** (boolean) _(optional)_: Whether to include a snapshot in the response. Default is false.

---

### `fill_form`

**Description:** [`Fill`](#fill) out multiple form elements at once

**Parameters:**

- **elements** (array) **(required)**: Elements from snapshot to [`fill`](#fill) out.
- **includeSnapshot** (boolean) _(optional)_: Whether to include a snapshot in the response. Default is false.

---

### `handle_dialog`

**Description:** If a browser dialog was opened, use this command to handle it

**Parameters:**

- **action** (enum: "accept", "dismiss") **(required)**: Whether to dismiss or accept the dialog
- **promptText** (string) _(optional)_: Optional prompt text to enter into the dialog.

---

### `hover`

**Description:** [`Hover`](#hover) over the provided element

**Parameters:**

- **uid** (string) **(required)**: The uid of an element on the page from the page content snapshot
- **includeSnapshot** (boolean) _(optional)_: Whether to include a snapshot in the response. Default is false.

---

### `press_key`

**Description:** Press a key or key combination. Use this when other input methods like [`fill`](#fill)() cannot be used (e.g., keyboard shortcuts, navigation keys, or special key combinations).

**Parameters:**

- **key** (string) **(required)**: A key or a combination (e.g., "Enter", "Control+A", "Control++", "Control+Shift+R"). Modifiers: Control, Shift, Alt, Meta
- **includeSnapshot** (boolean) _(optional)_: Whether to include a snapshot in the response. Default is false.

---

### `scroll_into_view`

**Description:** Scrolls the element identified by uid into the viewport.

**Parameters:**

- **uid** (string) **(required)**
- **block** (enum: "start", "center", "end", "nearest") _(optional)_
- **inline** (enum: "start", "center", "end", "nearest") _(optional)_

---

### `type_text`

**Description:** Type text using keyboard into a previously focused input

**Parameters:**

- **text** (string) **(required)**: The text to type
- **submitKey** (string) _(optional)_: Optional key to press after typing. E.g., "Enter", "Tab", "Escape"

---

### `upload_file`

**Description:** Upload a file through a provided element.

**Parameters:**

- **filePath** (string) **(required)**: The local path of the file to upload
- **uid** (string) **(required)**: The uid of the file input element or an element that will open file chooser on the page from the page content snapshot
- **includeSnapshot** (boolean) _(optional)_: Whether to include a snapshot in the response. Default is false.

---

## Navigation automation

### `broadcast_evaluate`

**Description:** Run the same JavaScript expression in every open page (or a filtered subset) and aggregate the results. Useful for cross-tab queries (e.g. "find all pages where the user is logged in").

**Parameters:**

- **expression** (string) **(required)**
- **pageIds** (array) _(optional)_: Restrict broadcast to these page ids. Default: every open page.
- **timeoutMs** (integer) _(optional)_: Per-page timeout. Default 5000.

---

### `close_page`

**Description:** Closes the page by its index. The last open page cannot be closed.

**Parameters:**

- **pageId** (number) **(required)**: The ID of the page to close. Call [`list_pages`](#list_pages) to list pages.

---

### `list_pages`

**Description:** Get a list of pages open in the browser.

**Parameters:** None

---

### `navigate_page`

**Description:** Go to a URL, or back, forward, or reload. Use project URL if not specified otherwise.

**Parameters:**

- **handleBeforeUnload** (enum: "accept", "decline") _(optional)_: Whether to auto accept or beforeunload dialogs triggered by this navigation. Default is accept.
- **ignoreCache** (boolean) _(optional)_: Whether to ignore cache on reload.
- **initScript** (string) _(optional)_: A JavaScript script to be executed on each new document before any other scripts for the next navigation.
- **timeout** (integer) _(optional)_: Maximum wait time in milliseconds. If set to 0, the default timeout will be used.
- **type** (enum: "url", "back", "forward", "reload") _(optional)_: Navigate the page by URL, back or forward in history, or reload.
- **url** (string) _(optional)_: Target URL (only type=url)

---

### `new_page`

**Description:** Open a new tab and load a URL. Use project URL if not specified otherwise.

**Parameters:**

- **url** (string) **(required)**: URL to load in a new page.
- **background** (boolean) _(optional)_: Whether to open the page in the background without bringing it to the front. Default is false (foreground).
- **isolatedContext** (string) _(optional)_: If specified, the page is created in an isolated browser context with the given name. Pages in the same browser context share cookies and storage. Pages in different browser contexts are fully isolated.
- **timeout** (integer) _(optional)_: Maximum wait time in milliseconds. If set to 0, the default timeout will be used.

---

### `select_page`

**Description:** Select a page as a context for future tool calls.

**Parameters:**

- **pageId** (number) **(required)**: The ID of the page to select. Call [`list_pages`](#list_pages) to get available pages.
- **bringToFront** (boolean) _(optional)_: Whether to focus the page and bring it to the top.

---

### `wait_for`

**Description:** Wait for the specified text to appear on the selected page.

**Parameters:**

- **text** (array) **(required)**: Non-empty list of texts. Resolves when any value appears on the page.
- **timeout** (integer) _(optional)_: Maximum wait time in milliseconds. If set to 0, the default timeout will be used.

---

## Emulation

### `clear_idle_state_override`

**Description:** Clear the IdleDetector override.

**Parameters:** None

---

### `emulate`

**Description:** Emulates various features on the selected page.

**Parameters:**

- **colorScheme** (enum: "dark", "light", "auto") _(optional)_: [`Emulate`](#emulate) the dark or the light mode. Set to "auto" to reset to the default.
- **cpuThrottlingRate** (number) _(optional)_: Represents the CPU slowdown factor. Omit or set the rate to 1 to disable throttling
- **geolocation** (string) _(optional)_: Geolocation (`&lt;latitude&gt;x&lt;longitude&gt;`) to [`emulate`](#emulate). Latitude between -90 and 90. Longitude between -180 and 180. Omit to clear the geolocation override.
- **networkConditions** (enum: "Offline", "Slow 3G", "Fast 3G", "Slow 4G", "Fast 4G") _(optional)_: Throttle network. Omit to disable throttling.
- **userAgent** (string) _(optional)_: User agent to [`emulate`](#emulate). Set to empty string to clear the user agent override.
- **viewport** (string) _(optional)_: [`Emulate`](#emulate) device viewports '&lt;width&gt;x&lt;height&gt;x&lt;devicePixelRatio&gt;[,mobile][,touch][,landscape]'. 'touch' and 'mobile' to [`emulate`](#emulate) mobile devices. 'landscape' to [`emulate`](#emulate) landscape mode.

---

### `emulate_idle_state`

**Description:** Override the IdleDetector state (CDP `Emulation.setIdleOverride`).

**Parameters:**

- **isScreenUnlocked** (boolean) **(required)**
- **isUserActive** (boolean) **(required)**

---

### `emulate_reduced_motion`

**Description:** [`Emulate`](#emulate) `prefers-reduced-motion: reduce` via media-feature override.

**Parameters:**

- **enabled** (boolean) **(required)**

---

### `emulate_sensor`

**Description:** Override readings for a Web Sensor API sensor (CDP `Emulation.setSensorOverrideEnabled` + `setSensorOverrideReadings`).

**Parameters:**

- **type** (enum: "absolute-orientation", "accelerometer", "ambient-light", "gravity", "gyroscope", "linear-acceleration", "magnetometer", "proximity", "relative-orientation") **(required)**
- **alpha** (number) _(optional)_: For orientation sensors (degrees).
- **beta** (number) _(optional)_
- **enabled** (boolean) _(optional)_: Default true. Pass false to disable the override.
- **gamma** (number) _(optional)_
- **illuminance** (number) _(optional)_: Lux, for ambient-light.
- **x** (number) _(optional)_
- **y** (number) _(optional)_
- **z** (number) _(optional)_

---

### `emulate_vision_deficiency`

**Description:** [`Emulate`](#emulate) a CSS vision deficiency for accessibility testing (CDP `Emulation.setEmulatedVisionDeficiency`).

**Parameters:**

- **type** (enum: "none", "achromatopsia", "blurredVision", "deuteranopia", "protanopia", "tritanopia", "reducedContrast") **(required)**

---

### `override_permissions`

**Description:** Grants the listed permissions for the active page's origin. Until reset, the browser auto-grants these without prompting.

**Parameters:**

- **permissions** (array) **(required)**: Permissions to grant.
- **origin** (string) _(optional)_: Origin to grant for. Default: current page origin.

---

### `reset_permissions`

**Description:** Clears any permission overrides for the current browser context, restoring default prompt behavior.

**Parameters:** None

---

### `resize_page`

**Description:** Resizes the selected page's window so that the page has specified dimension

**Parameters:**

- **height** (number) **(required)**: Page height
- **width** (number) **(required)**: Page width

---

## Performance

### `performance_analyze_insight`

**Description:** Provides more detailed information on a specific Performance Insight of an insight set that was highlighted in the results of a trace recording.

**Parameters:**

- **insightName** (string) **(required)**: The name of the Insight you want more information on. For example: "DocumentLatency" or "LCPBreakdown"
- **insightSetId** (string) **(required)**: The id for the specific insight set. Only use the ids given in the "Available insight sets" list.

---

### `performance_start_trace`

**Description:** Start a performance trace on the selected webpage. Use to find frontend performance issues, Core Web Vitals (LCP, INP, CLS), and improve page load speed.

**Parameters:**

- **autoStop** (boolean) _(optional)_: Determines if the trace recording should be automatically stopped.
- **filePath** (string) _(optional)_: The absolute file path, or a file path relative to the current working directory, to save the raw trace data. For example, trace.json.gz (compressed) or trace.json (uncompressed).
- **reload** (boolean) _(optional)_: Determines if, once tracing has started, the current selected page should be automatically reloaded. Navigate the page to the right URL using the [`navigate_page`](#navigate_page) tool BEFORE starting the trace if reload or autoStop is set to true.

---

### `performance_stop_trace`

**Description:** Stop the active performance trace recording on the selected webpage.

**Parameters:**

- **filePath** (string) _(optional)_: The absolute file path, or a file path relative to the current working directory, to save the raw trace data. For example, trace.json.gz (compressed) or trace.json (uncompressed).

---

## Network

### `get_network_request`

**Description:** Gets a network request by an optional reqid, if omitted returns the currently selected request in the DevTools Network panel.

**Parameters:**

- **reqid** (number) _(optional)_: The reqid of the network request. If omitted returns the currently selected request in the DevTools Network panel.
- **requestFilePath** (string) _(optional)_: The absolute or relative path to a .network-request file to save the request body to. If omitted, the body is returned inline.
- **responseFilePath** (string) _(optional)_: The absolute or relative path to a .network-response file to save the response body to. If omitted, the body is returned inline.

---

### `list_network_requests`

**Description:** List all requests for the currently selected page since the last navigation.

**Parameters:**

- **includePreservedRequests** (boolean) _(optional)_: Set to true to return the preserved requests over the last 3 navigations.
- **pageIdx** (integer) _(optional)_: Page number to return (0-based). When omitted, returns the first page.
- **pageSize** (integer) _(optional)_: Maximum number of requests to return. When omitted, returns all requests.
- **resourceTypes** (array) _(optional)_: Filter requests to only return requests of the specified resource types. When omitted or empty, returns all requests.

---

## Debugging

### `evaluate_script`

**Description:** Evaluate a JavaScript function inside the currently selected page. Returns the response as JSON,
so returned values have to be JSON-serializable.

**Parameters:**

- **function** (string) **(required)**: A JavaScript function declaration to be executed by the tool in the currently selected page.
  Example without arguments: `() => {
  return document.title
}` or `async () => {
  return await fetch("example.com")
}`.
  Example with arguments: `(el) => {
  return el.innerText;
}`

- **args** (array) _(optional)_: An optional list of arguments to pass to the function.
- **dialogAction** (string) _(optional)_: Handle dialogs while execution. "accept", "dismiss", or string for response of window.prompt. Defaults to accept.

---

### `get_box_model`

**Description:** Returns the box model (content/padding/border/margin quads, plus width/height) for an element by uid.

**Parameters:**

- **uid** (string) **(required)**

---

### `get_computed_styles`

**Description:** Returns a subset of `getComputedStyle` for an element identified by uid. Filter to a property list to avoid the full dump.

**Parameters:**

- **uid** (string) **(required)**
- **properties** (array) _(optional)_: Property names to return (e.g. ["display", "color"]). If omitted, returns the full computed style object — large.

---

### `get_console_message`

**Description:** Gets a console message by its ID. You can get all messages by calling [`list_console_messages`](#list_console_messages).

**Parameters:**

- **msgid** (number) **(required)**: The msgid of a console message on the page from the listed console messages

---

### `get_layout_metrics`

**Description:** Returns viewport, content, and visual viewport metrics for the active page (CDP `Page.getLayoutMetrics`).

**Parameters:** None

---

### `lighthouse_audit`

**Description:** Get Lighthouse score and reports. By default audits accessibility, SEO and best practices. Pass `categories` to include other audits — pass `['performance']` for the performance audit (or use [`performance_start_trace`](#performance_start_trace) for trace-level analysis).

**Parameters:**

- **categories** (array) _(optional)_: Lighthouse audit categories to run. Default ['accessibility', 'seo', 'best-practices'].
- **device** (enum: "desktop", "mobile") _(optional)_: Device to [`emulate`](#emulate).
- **mode** (enum: "navigation", "snapshot") _(optional)_: "navigation" reloads &amp; audits. "snapshot" analyzes current state.
- **outputDirPath** (string) _(optional)_: Directory for reports. If omitted, uses temporary files.

---

### `list_console_messages`

**Description:** List all console messages for the currently selected page since the last navigation.

**Parameters:**

- **includePreservedMessages** (boolean) _(optional)_: Set to true to return the preserved messages over the last 3 navigations.
- **pageIdx** (integer) _(optional)_: Page number to return (0-based). When omitted, returns the first page.
- **pageSize** (integer) _(optional)_: Maximum number of messages to return. When omitted, returns all messages.
- **types** (array) _(optional)_: Filter messages to only return messages of the specified resource types. When omitted or empty, returns all messages.

---

### `query_selector_all`

**Description:** Returns matches for a CSS selector on the active page. Each match includes the snapshot uid (if the element is part of the current a11y snapshot), tagName, and a brief text excerpt. Useful for narrowing element targets before `[`click`](#click)` / `[`fill`](#fill)`.

**Parameters:**

- **selector** (string) **(required)**: CSS selector.
- **limit** (integer) _(optional)_: Default 50.

---

### `take_screenshot`

**Description:** Take a screenshot of the page or element.

**Parameters:**

- **filePath** (string) _(optional)_: The absolute path, or a path relative to the current working directory, to save the screenshot to instead of attaching it to the response.
- **format** (enum: "png", "jpeg", "webp") _(optional)_: Type of format to save the screenshot as. Default is "png"
- **fullPage** (boolean) _(optional)_: If set to true takes a screenshot of the full page instead of the currently visible viewport. Incompatible with uid.
- **quality** (number) _(optional)_: Compression quality for JPEG and WebP formats (0-100). Higher values mean better quality but larger file sizes. Ignored for PNG format.
- **uid** (string) _(optional)_: The uid of an element on the page from the page content snapshot. If omitted, takes a page screenshot.

---

### `take_snapshot`

**Description:** Take a text snapshot of the currently selected page based on the a11y tree. The snapshot lists page elements along with a unique
identifier (uid). Always use the latest snapshot. Prefer taking a snapshot over taking a screenshot. The snapshot indicates the element selected
in the DevTools Elements panel (if any).

**Parameters:**

- **filePath** (string) _(optional)_: The absolute path, or a path relative to the current working directory, to save the snapshot to instead of attaching it to the response.
- **forceRefresh** (boolean) _(optional)_: When true, ignore any cached snapshot and rebuild from scratch. Default false; the cached snapshot is reused when no DOM mutation has been observed since it was built.
- **verbose** (boolean) _(optional)_: Whether to include all possible information available in the full a11y tree. Default is false.

---

## Extensions

> NOTE: Extensions are not active by default. Use the '--categoryExtensions' flag

### `install_extension`

**Description:** Installs a Chrome extension from the given path.

**Parameters:**

- **path** (string) **(required)**: Absolute path to the unpacked extension folder.

---

### `list_extensions`

**Description:** Lists all the Chrome extensions installed in the browser. This includes their name, ID, version, and enabled status.

**Parameters:** None

---

### `reload_extension`

**Description:** Reloads an unpacked Chrome extension by its ID.

**Parameters:**

- **id** (string) **(required)**: ID of the extension to reload.

---

### `trigger_extension_action`

**Description:** Triggers the default action of an extension by its ID.

**Parameters:**

- **id** (string) **(required)**: ID of the extension to trigger the action for.

---

### `uninstall_extension`

**Description:** Uninstalls a Chrome extension by its ID.

**Parameters:**

- **id** (string) **(required)**: ID of the extension to uninstall.

---

## Memory

### `take_memory_snapshot`

**Description:** Capture a heap snapshot of the currently selected page. Use to analyze the memory distribution of JavaScript objects and debug memory leaks.

**Parameters:**

- **filePath** (string) **(required)**: A path to a .heapsnapshot file to save the heapsnapshot to.

---

## Storage

### `clear_all_storage`

**Description:** Clears one or more storage types for an origin via CDP `Storage.clearDataForOrigin`. Default: all storage types for the active page origin.

**Parameters:**

- **origin** (string) _(optional)_
- **types** (array) _(optional)_: Storage types to clear. If omitted, clears `all`. Common values: cookies, indexeddb, local_storage, cache_storage, service_workers.

---

### `clear_cookies`

**Description:** Clears all cookies for the active page's origin (or a provided origin) via CDP `Storage.clearDataForOrigin`.

**Parameters:**

- **origin** (string) _(optional)_: Origin to clear cookies for. Default: current page origin.

---

### `clear_indexeddb_object_store`

**Description:** Clears all entries from an IndexedDB object store.

**Parameters:**

- **database** (string) **(required)**
- **objectStore** (string) **(required)**
- **origin** (string) _(optional)_

---

### `clear_local_storage`

**Description:** Clears localStorage on the active page's origin. If `key` is provided, removes only that key; otherwise removes everything.

**Parameters:**

- **key** (string) _(optional)_

---

### `clear_session_storage`

**Description:** Clears sessionStorage on the active page's origin (or a single key).

**Parameters:**

- **key** (string) _(optional)_

---

### `delete_cache`

**Description:** Deletes a CacheStorage cache by cacheId.

**Parameters:**

- **cacheId** (string) **(required)**

---

### `delete_cache_entry`

**Description:** Deletes a single entry (request URL) from a CacheStorage cache.

**Parameters:**

- **cacheId** (string) **(required)**
- **request** (string) **(required)**: Request URL to remove from the cache.

---

### `delete_cookie`

**Description:** Deletes a single cookie matching the given filter from the active browser context.

**Parameters:**

- **name** (string) **(required)**: Cookie name.
- **domain** (string) _(optional)_
- **path** (string) _(optional)_
- **url** (string) _(optional)_

---

### `delete_indexeddb_database`

**Description:** Deletes an IndexedDB database for the given origin.

**Parameters:**

- **database** (string) **(required)**
- **origin** (string) _(optional)_

---

### `get_cache_entries`

**Description:** Returns entries (URL + response metadata) for a single cache. Paginated.

**Parameters:**

- **cacheId** (string) **(required)**: cacheId obtained from `[`list_caches`](#list_caches)`.
- **pageIdx** (integer) _(optional)_
- **pageSize** (integer) _(optional)_
- **pathFilter** (string) _(optional)_: Optional substring filter on request URL path.

---

### `get_indexeddb_data`

**Description:** Returns entries from an IndexedDB object store. Paginated via pageSize/pageIdx.

**Parameters:**

- **database** (string) **(required)**: Database name.
- **objectStore** (string) **(required)**: Object store name.
- **indexName** (string) _(optional)_: Optional index name. If omitted, queries the primary key.
- **origin** (string) _(optional)_
- **pageIdx** (integer) _(optional)_
- **pageSize** (integer) _(optional)_

---

### `get_local_storage`

**Description:** Returns all localStorage entries for the active page's origin.

**Parameters:**

- **origin** (string) _(optional)_: Informational only — the page is not navigated. Default: page origin.

---

### `get_session_storage`

**Description:** Returns all sessionStorage entries for the active page's origin.

**Parameters:**

- **origin** (string) _(optional)_

---

### `list_caches`

**Description:** Lists CacheStorage caches accessible from the active page.

**Parameters:**

- **securityOrigin** (string) _(optional)_

---

### `list_cookies`

**Description:** Lists cookies for the active browser context. Optionally filter by URL(s); without a filter, returns all cookies in the active browser context.

**Parameters:**

- **urls** (array) _(optional)_: Optional list of URLs to filter cookies by. Cookies whose domain/path match any URL are returned. Default: all cookies.

---

### `list_indexeddb_databases`

**Description:** Lists IndexedDB database names for the active page's origin.

**Parameters:**

- **origin** (string) _(optional)_

---

### `set_cookie`

**Description:** Sets a cookie in the active browser context. At least one of `url` or `domain` must be provided.

**Parameters:**

- **name** (string) **(required)**: Cookie name.
- **value** (string) **(required)**: Cookie value.
- **domain** (string) _(optional)_: Cookie domain.
- **expires** (number) _(optional)_: Expiration time in seconds since UNIX epoch. Omit for session cookie.
- **httpOnly** (boolean) _(optional)_
- **path** (string) _(optional)_: Cookie path. Default "/".
- **sameSite** (enum: "Strict", "Lax", "None") _(optional)_
- **secure** (boolean) _(optional)_
- **url** (string) _(optional)_: URL for which the cookie applies (sets domain/path/secure).

---

### `set_local_storage`

**Description:** Sets a localStorage entry on the active page's origin.

**Parameters:**

- **key** (string) **(required)**
- **value** (string) **(required)**

---

### `set_session_storage`

**Description:** Sets a sessionStorage entry on the active page's origin.

**Parameters:**

- **key** (string) **(required)**
- **value** (string) **(required)**

---

## Network interception

### `block_urls`

**Description:** Block requests matching any of the provided URLPattern strings. Convenience wrapper around `[`intercept_network`](#intercept_network)` with `action: abort`.

**Parameters:**

- **patterns** (array) **(required)**
- **abortReason** (string) _(optional)_

---

### `clear_interceptors`

**Description:** Removes all interceptors for the current page.

**Parameters:** None

---

### `intercept_network`

**Description:** Register a persistent request interceptor for the current page.

Returns the new `interceptorId`. Rules are evaluated in registration order; the first matching rule wins. Use `[`mock_response`](#mock_response)`, `[`block_urls`](#block_urls)`, or `[`modify_request_headers`](#modify_request_headers)` for common cases — they are convenience wrappers around this tool.

**Parameters:**

- **action** (enum: "continue", "abort", "fulfill", "modify") **(required)**: `continue` (no-op pass through), `abort` (block), `fulfill` (mock response), or `modify` (header / method / body overrides on the outgoing request).
- **urlPattern** (string) **(required)**: URLPattern to match (e.g. `https://api.example.com/*` or `*://*/static/*`).
- **abortReason** (string) _(optional)_: For `abort`. Default `blockedbyclient`.
- **body** (string) _(optional)_: For `fulfill`. Response body.
- **contentType** (string) _(optional)_: For `fulfill`. Convenience for the `Content-Type` header.
- **headers** (unknown) _(optional)_: For `fulfill`. Response headers.
- **latencyMs** (integer) _(optional)_: Artificial delay before the response is delivered.
- **method** (string) _(optional)_: For `modify`. Override HTTP method.
- **postData** (string) _(optional)_: For `modify`. Override outgoing request body.
- **removeHeaders** (array) _(optional)_: For `modify`. Header names to drop from the outgoing request.
- **setHeaders** (unknown) _(optional)_: For `modify`. Headers to set/override on the outgoing request.
- **status** (integer) _(optional)_: For `fulfill`. Default 200.

---

### `list_har_recordings`

**Description:** Lists in-progress HAR recordings.

**Parameters:** None

---

### `list_interceptors`

**Description:** Lists all active network interceptors for the current page.

**Parameters:** None

---

### `mock_response`

**Description:** Convenience wrapper around `[`intercept_network`](#intercept_network)` with `action: fulfill`. Returns the registered interceptorId.

**Parameters:**

- **urlPattern** (string) **(required)**
- **body** (string) _(optional)_
- **contentType** (string) _(optional)_
- **headers** (unknown) _(optional)_
- **latencyMs** (integer) _(optional)_
- **status** (integer) _(optional)_

---

### `modify_request_headers`

**Description:** Convenience wrapper around `[`intercept_network`](#intercept_network)` with `action: modify`. Sets and/or removes headers on outgoing requests matching urlPattern.

**Parameters:**

- **urlPattern** (string) **(required)**
- **removeHeaders** (array) _(optional)_
- **setHeaders** (unknown) _(optional)_

---

### `record_har_start`

**Description:** Begin recording a HAR for the current page. Use `[`record_har_stop`](#record_har_stop)` (with the same `name`) to end the recording and get the HAR contents or write a file.

**Parameters:**

- **name** (string) **(required)**: Logical name for this recording. Pass the same name to `[`record_har_stop`](#record_har_stop)`.
- **includeBodies** (boolean) _(optional)_: When true, response bodies up to 1 MiB are included in the HAR (utf-8 if textual, base64 otherwise).

---

### `record_har_stop`

**Description:** Stops a HAR recording started with `[`record_har_start`](#record_har_start)`. Either writes to `filePath` (with `.har` extension auto-applied) or returns the HAR JSON inline.

**Parameters:**

- **name** (string) **(required)**
- **filePath** (string) _(optional)_: Optional output path. If omitted, the HAR is returned inline.

---

### `remove_interceptor`

**Description:** Removes a single interceptor by id.

**Parameters:**

- **interceptorId** (string) **(required)**

---

## Service workers / PWA

### `evaluate_in_worker`

**Description:** Evaluates a JavaScript expression inside a service worker. The worker is identified by a substring of its URL (e.g. "sw.js" or "/service-worker.js").

The script is run as an expression. Use `[`evaluate_script`](#evaluate_script)` for page contexts; this tool exists for SW debugging (`caches.keys()`, `self.registration.update()`, etc.).

**Parameters:**

- **expression** (string) **(required)**: JavaScript expression to evaluate in the worker. Async expressions resolved.
- **workerUrlSubstring** (string) **(required)**: Substring matched against worker URLs. The first matching worker is used.

---

### `get_manifest`

**Description:** Returns the active page's web app manifest (CDP `Page.getAppManifest`). Includes the manifest URL, parsed errors, and raw text.

**Parameters:** None

---

### `list_service_workers`

**Description:** Lists active service workers visible to the current page's browser context (URLs and target IDs). Includes any web workers attached via `Page.workers()` for completeness.

**Parameters:** None

---

### `skip_waiting`

**Description:** Tells a waiting service worker version to immediately activate (CDP `ServiceWorker.skipWaiting`). Useful for testing the new SW without forcing a hard reload.

**Parameters:**

- **scopeURL** (string) **(required)**

---

### `start_service_worker`

**Description:** Starts a service worker registration (CDP `ServiceWorker.startWorker`).

**Parameters:**

- **scopeURL** (string) **(required)**

---

### `stop_service_worker`

**Description:** Stops the active service worker for a registration (CDP `ServiceWorker.stopWorker`). Doesn't unregister; the SW will start again on the next event.

**Parameters:**

- **versionId** (string) **(required)**: Service worker version id (from `list_service_worker_registrations`).

---

### `trigger_background_sync`

**Description:** Manually trigger a Background Sync event for a registered tag (CDP `BackgroundService` domain).

**Parameters:**

- **origin** (string) **(required)**: Origin of the service worker.
- **serviceWorkerRegistrationId** (string) **(required)**: Registration id (from `[`list_service_workers`](#list_service_workers)`'s context output).
- **tag** (string) **(required)**: Sync tag.

---

### `unregister_service_worker`

**Description:** Unregisters a service worker by registration scope URL (e.g. "https://example.com/").

**Parameters:**

- **scopeURL** (string) **(required)**: Service worker registration scope URL.

---

### `update_service_worker`

**Description:** Forces a service worker registration update (re-fetches the SW script and runs the install/activate cycle if changed).

**Parameters:**

- **scopeURL** (string) **(required)**

---

## Code coverage

### `start_css_coverage`

**Description:** Start collecting CSS coverage on the active page.

**Parameters:**

- **resetOnNavigation** (boolean) _(optional)_

---

### `start_js_coverage`

**Description:** Start collecting JavaScript code coverage on the active page. Stop with `[`stop_js_coverage`](#stop_js_coverage)` to retrieve the report.

**Parameters:**

- **detailed** (boolean) _(optional)_: When true, collect detailed coverage (every byte). When false, only function-level granularity. Default true.
- **reportAnonymousScripts** (boolean) _(optional)_: Include anonymous scripts (e.g. eval). Default false.
- **resetOnNavigation** (boolean) _(optional)_: Reset coverage on navigation. Default true.

---

### `stop_css_coverage`

**Description:** Stop CSS coverage and return the report.

**Parameters:**

- **filePath** (string) _(optional)_
- **summaryOnly** (boolean) _(optional)_

---

### `stop_js_coverage`

**Description:** Stop JS coverage and return the report. If `filePath` is set, the JSON is written to disk; otherwise the report is returned inline.

**Parameters:**

- **filePath** (string) _(optional)_
- **summaryOnly** (boolean) _(optional)_: Return only per-URL byte usage totals instead of full ranges. Default false.

---

## Page export

### `export_dom_html`

**Description:** Save the active page's serialized DOM (document.documentElement.outerHTML).

**Parameters:**

- **filePath** (string) _(optional)_

---

### `print_to_pdf`

**Description:** Export the active page as a PDF (CDP `Page.printToPDF`). Returns the saved file path.

**Parameters:**

- **filePath** (string) _(optional)_: Output path. Defaults to a temp file.
- **footerTemplate** (string) _(optional)_
- **headerTemplate** (string) _(optional)_: HTML for header. Use classes `date title url pageNumber totalPages`.
- **height** (string) _(optional)_
- **landscape** (boolean) _(optional)_
- **marginBottom** (string) _(optional)_
- **marginLeft** (string) _(optional)_
- **marginRight** (string) _(optional)_
- **marginTop** (string) _(optional)_
- **pageRanges** (string) _(optional)_: e.g. "1-3,5". Default: all pages.
- **paperFormat** (enum: "letter", "legal", "tabloid", "ledger", "a0", "a1", "a2", "a3", "a4", "a5", "a6") _(optional)_: Standard paper size. Mutually exclusive with width/height.
- **printBackground** (boolean) _(optional)_: Include background colors / images. Default true.
- **scale** (number) _(optional)_
- **width** (string) _(optional)_: e.g. "8.5in", "210mm".

---

### `save_mhtml`

**Description:** Save the active page as an MHTML archive (CDP `Page.captureSnapshot` with format `mhtml`).

**Parameters:** None

---
