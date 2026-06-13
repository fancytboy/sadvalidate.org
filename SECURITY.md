# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| 1.x     | Yes       |
| < 1.0   | No        |

## Reporting a vulnerability

Please report security issues privately using GitHub's
**[Report a vulnerability](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing-information-about-vulnerabilities/privately-reporting-a-security-vulnerability)**
feature, found under the repository's **Security** tab. Do not open a public
issue for vulnerabilities, and note that this project does not accept pull
requests (see [CONTRIBUTING.md](CONTRIBUTING.md)), so do not submit fixes as
PRs either.

Include in your report:

- A description of the issue and its impact.
- Steps to reproduce (a minimal design JSON or input sample helps).
- The browser and version you observed it in.

You should receive an acknowledgement within 5 business days. Please allow a
reasonable disclosure window before publishing details.

## Security model

The app runs in two modes. In **BYOK mode** (static hosting) the browser
talks to the AI provider directly with the user's own key. In **proxy mode**
(the recommended deployment, `server/server.mjs`) API keys live on the server
as environment variables and never reach the browser. Keep the following in
mind when assessing or deploying it:

- **API keys (BYOK mode)** are held in memory for the current session only
  and are never written to `localStorage`; closing the tab drops them, and
  keys persisted by older versions are purged on first load. For any
  multi-user or persistent setup, configure keys in the proxy deployment
  (`server/Dockerfile` environment) instead.
- **Content-Security-Policy**: `index.html` restricts the page to its own
  resources and limits outbound connections to itself and the four provider
  APIs. If you self-host with a custom API base URL, you must extend
  `connect-src` yourself; keep it as narrow as possible.
- **Server proxy**: validates provider, model, prompt size, and token limits,
  applies a per-IP rate limit, serves only the app shell, and does not log
  prompts or keys. It still needs HTTPS in front of it in production.
- **Prompt injection**: candidate-supplied text (node labels, descriptions,
  connection labels) is untrusted input that ends up in model prompts. The
  app neutralizes it via data fencing and caps prompt size (`js/client.js`);
  an injection scanner is exported for deployments that want their own
  logging. This is defense-in-depth, not a guarantee; the only thing a
  single user can game is their own score.
- **Rendering**: all user-controlled text is escaped before being placed in
  `innerHTML` (`js/util.js`) or assigned via `textContent`. Report any path
  where unescaped input reaches the DOM.
- **Service worker**: only same-origin GET requests are cached; AI API calls
  and `/api/` proxy requests always go to the network.
- **Transparency**: the "Preview the exact request" link shows the full
  prompt and destination before anything is sent; nothing is logged to the
  console or transmitted elsewhere.

## Out of scope

- Cost or rate-limit abuse of your own API key.
- Issues that require physical or profile-level access to the victim's
  browser.
- Vulnerabilities in the upstream AI provider APIs themselves.
