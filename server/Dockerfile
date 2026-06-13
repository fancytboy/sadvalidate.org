# Recommended deployment: the bundled key-holding proxy (server/server.mjs)
# serves the app and forwards AI calls with keys from the environment below,
# so API keys never reach the browser.
#
# Build and run from the repository root (the build context must be the repo
# root so the COPY paths below resolve):
#
# Build:  docker build -f server/Dockerfile -t system-design-playground-proxy .
# Run:    docker run --rm -p 8080:8080 -e ANTHROPIC_API_KEY=sk-ant-... system-design-playground-proxy
#
# Run `npm run sw:bump` before building. Put the container behind HTTPS in
# production; the service worker requires a secure origin.

FROM node:22-alpine

# API key configuration. Fill these in (or pass them with `docker run -e` /
# your platform's secret store, which is safer than baking keys into an
# image). Only providers with a non-empty key appear in the app.
ENV ANTHROPIC_API_KEY=""
ENV OPENAI_API_KEY=""
ENV GEMINI_API_KEY=""
ENV QWEN_API_KEY=""

# Keyless Ollama: set the daemon URL to enable it. From inside a container,
# a daemon on the Docker host is usually http://host.docker.internal:11434.
ENV OLLAMA_BASE_URL=""

ENV NODE_ENV=production
WORKDIR /app

COPY index.html favicon.svg manifest.webmanifest sw.js ./
COPY css ./css
COPY js ./js
COPY server ./server

EXPOSE 8080
USER node
CMD ["node", "server/server.mjs"]
