# syntax=docker/dockerfile:1
# The built client as static files. It holds no game data: the player's own
# .ipa is read in their browser. ubiquitous-server's compose file runs it
# behind the proxy that also carries the game socket.
FROM --platform=$BUILDPLATFORM node:26-alpine AS build
WORKDIR /src/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY .nvmrc /src/
COPY client/ ./
RUN npm run build
# Behind the proxy the socket is on the page's own origin, so every device
# reaches it at the address it opened the page on.
RUN sed -i 's#^server=.*#server=/ubiquitous-server#' dist/config.txt \
    && grep -q '^server=/ubiquitous-server$' dist/config.txt

FROM caddy:2-alpine
COPY --from=build /src/client/dist /srv
COPY <<EOF /etc/caddy/Caddyfile
:8780 {
	root * /srv
	encode zstd gzip
	file_server
	@fresh path /config.txt /sw.js /index.html /
	header @fresh Cache-Control no-cache
}
EOF
EXPOSE 8780
