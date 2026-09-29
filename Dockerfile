# syntax = docker/dockerfile:1

# better-sqlite3 compiles a native addon on install, so the build stage keeps
# a toolchain; the runtime stage only carries the result, staying small.
FROM node:24-slim AS build
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
# matches the pnpm version mise.toml pins for this repo
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --prod --frozen-lockfile
COPY src/ ./src/
COPY public/ ./public/
COPY README.md ./README.md

FROM node:24-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 8080
CMD ["node", "src/server.js"]
