# Static deployment image for the System Design Playground.
# The app is a pure static site, so the image only copies the runtime assets
# into nginx. Run `npm run sw:bump` before building so returning visitors are
# not served a stale cache.
#
# Build:  docker build -t system-design-playground .
# Run:    docker run --rm -p 8080:80 system-design-playground
#
# The service worker (offline support) requires a secure origin, so put this
# container behind HTTPS (a reverse proxy or your platform's TLS) in
# production; plain http works on localhost.

FROM nginx:1.27-alpine

COPY index.html favicon.svg manifest.webmanifest sw.js /usr/share/nginx/html/
COPY css /usr/share/nginx/html/css
COPY js /usr/share/nginx/html/js

EXPOSE 80
