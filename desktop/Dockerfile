# syntax=docker/dockerfile:1
# The Linux AppImage, built with nothing but Docker:
#
#   docker build -f desktop/Dockerfile --output desktop/dist .
#
# It holds the built client and no game data: the player picks their own .ipa
# in the window. To bundle yours instead, so the window opens it by itself,
# name the folder that holds it:
#
#   docker build -f desktop/Dockerfile --build-context game=<folder> --output desktop/dist .
#
# That AppImage carries your copy of the game and is for your own devices.
FROM scratch AS game

FROM --platform=$BUILDPLATFORM node:26 AS client
WORKDIR /src/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY .nvmrc /src/
COPY client/ ./
RUN npm run build

FROM --platform=$BUILDPLATFORM node:26 AS pack
WORKDIR /src/desktop
COPY desktop/package.json desktop/package-lock.json ./
RUN npm ci
COPY desktop/ ./
COPY --from=client /src/client/dist ./client-dist
RUN mkdir -p game
COPY --from=game / ./game/
# Compressing an .ipa again saves nothing and takes minutes, so a build that
# carries one stores it as it is.
RUN if ls game/*.ipa >/dev/null 2>&1; then npm run dist -- -c.compression=store; else npm run dist; fi

FROM scratch AS out
COPY --from=pack /src/desktop/dist/*.AppImage /
