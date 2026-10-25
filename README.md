# Unchained

Unchained is a single-file, mobile-first chat app for the abliteration.ai API. Everything lives in `index.html`
(markup, CSS, JavaScript and the vendored markdown/sanitizer/highlighter libraries); the only network
calls it makes are to the API itself.

Files:

| File | Required? | What it does |
|---|---|---|
| `index.html` | **yes** | the whole app |
| `manifest.webmanifest` | optional | lets Chrome install it as an app |
| `sw.js` | optional | offline launch + "Update available" prompt (caches only the app shell, never API calls) |
| `relay-worker.js` | only if direct mode is CORS-blocked | Cloudflare Worker relay (the same code is embedded in the app under Settings → "Copy relay code") |
| `README.md` | — | this file |

Upload `index.html` on its own and the app still works fully; add the two companions and it becomes
installable and launches offline. All paths are relative, so it runs under a subpath such as
`https://<you>.github.io/unchained-llm-mobile-console/`.

---

## Put it online with GitHub Pages (all from your phone, in Chrome)

GitHub hides some menus on small screens. Whenever something below is missing, tap Chrome's **⋮ → Desktop site**
and look again.

### 1. Create the repository
1. Sign in at **github.com**. Tap your avatar → **Your repositories** → **New** (or open `github.com/new`).
2. Repository name: `unchained-llm-mobile-console`.
3. Choose **Public** (GitHub Pages on a free account needs a public repo).
4. Tick **Add a README file**.
5. Tap **Create repository**.

### 2. Turn on GitHub Pages
1. In the repo, tap **Settings** (if you don't see it, use ⋮ → Desktop site).
2. Left menu → **Pages**.
3. Under **Build and deployment → Source**, choose **GitHub Actions**.
4. In the suggested workflows pick **Static HTML** → **Configure**.
5. Tap **Commit changes…** → **Commit changes** (keep the defaults).

### 3. Upload the app files
1. Download the zip from this chat on your phone and extract it (Files app → tap the zip → Extract), or download the files one by one.
2. Back in the repo's main page (the **Code** tab), tap **Add file → Upload files**.
3. Tap **choose your files** and select `index.html`, `manifest.webmanifest` and `sw.js` (and `relay-worker.js` if you like; it's harmless).
   You can repeat the upload if the picker only lets you choose one file at a time.
4. Tap **Commit changes**.

### 4. Wait for the deploy and find the URL
1. Tap the **Actions** tab. Wait for the workflow to show a green **✓** (usually under a minute).
2. **Settings → Pages**: the live address is shown at the top, e.g. `https://<you>.github.io/unchained-llm-mobile-console/`. Open it.

### 5. Install it on HyperOS (Xiaomi)
1. Allow Chrome to add shortcuts: phone **Settings → Apps → Manage apps → Chrome → Other permissions → Home screen shortcuts → Allow**.
2. In Chrome, with the app open: **⋮ → Add to Home screen** (or **Install app**) → **Install**.
3. Launch it from the home screen. It opens full-screen and also works offline.

### 6. Connect to the API
1. In the app: **☰ → Settings → Connection**.
2. Paste your API key. (It stays on the device only — IndexedDB — masked on screen, never logged, never in a URL.)
3. Tap **Test connection**. You get one of:
   - **OK** — done; the model list is refreshed from the API.
   - **Bad key** — check the key.
   - **Network error** — check connectivity / base URL.
   - **Blocked by browser (CORS) — use relay mode** — the API does not let web pages call it directly. Tap **Relay guide (Help)** and follow the in-app steps (free Cloudflare Worker, ~5 minutes, all from the phone).

### Good to know
- **Export your chats regularly.** Browser storage is tied to the site's address: if you move the app to a new URL, clear site data, or uninstall Chrome, the chats do not follow. **Settings → Export all chats (JSON)** downloads everything; **Import JSON** brings them back anywhere. Single chats can be exported as JSON or Markdown from the chat menu.
- **Battery saver** may pause a stream while the app is in the background. The app keeps the partial reply and offers **Retry**; nothing is lost.
- **Switching models**: tap the model chip under the chat title. The sheet lists every model the API reports (falling back to the built-in table) with window size, image support and reasoning notes; tick **Set as default for new chats** to make the choice stick. Switching mid-chat keeps the history. If the chat contains images and you pick a text-only model (large-v2), the app asks first and then sends the text only.
- **Default model** for new chats is `abliterated-model-large-v2` (1M window, reasoning always on, text only). If you had already saved a different default, it is kept and Settings → Defaults shows a one-time note.
- **Context meter** in the header shows how much of the model's window the next request will use. It warns at 80% and blocks at 100%, offering "new chat with summary", "trim oldest" or "switch model". Nothing is ever trimmed silently unless you switch on **Auto-trim** in Settings.
- **Cost**: each turn resends the whole conversation. Enter your per-model prices in Settings → Pricing to see $ per reply and per chat.
- **Updating the app**: upload the new `index.html` **and** `sw.js` the same way (Add file → Upload files replaces them). Installed copies show an "Update available — Reload" bar within a minute of the next launch.
- **Diagnostics** (Settings → Diagnostics) shows version, https/file status, service worker and install state, storage, connection mode, the last 20 API requests and recent errors; **Copy diagnostics** gives you a redacted report to paste into a chat.

---

## Relay mode (only if direct mode is CORS-blocked)

The in-app **Relay guide** has the tap-by-tap version. In short: create a Cloudflare Worker, paste `relay-worker.js`
(Settings → **Copy relay code**), deploy, add the secrets `ABLI_API_KEY` and `RELAY_TOKEN` (Settings → **Generate token**),
add the text variable `ALLOWED_ORIGINS` (Settings → **Copy this app's origin**), then paste the Worker's `workers.dev`
address into Settings → Relay URL. The Worker only forwards `/v1/chat/completions`, `/v1/models` and
`/v1/messages/count_tokens`, only from your origin, only with your token, and streams SSE through unbuffered.
Opening the Worker address in a browser shows a status page that says whether each secret is set without revealing it.

---

## For later edits

`index.html` is unminified and organised in commented sections (constants, util, store, tokens, api, render, sessions,
diagnostics, settings UI, help/diagnostics panels, UI). The vendored libraries are the minified block at the very end
with their license headers. The `dev/` folder in the zip holds the source parts, the build script that assembles
`index.html` + `sw.js`, the mock API server and the automated tests, in case you ever want to rebuild on a computer.
