# Build stage: TypeScript is a devDependency, and better-sqlite3 may need to
# compile from source where no prebuilt binary exists (e.g. linux/arm64), so this
# stage carries the toolchain.
FROM node:22-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npx tsc && npm prune --omit=dev

# Runtime stage: the compiled app and its production node_modules, no toolchain.
FROM node:22-slim

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY data/official ./data/official

# Build the database from the committed official-data snapshots (no network access)
RUN node dist/db/seed.js

EXPOSE 3000

CMD ["node", "dist/index.js"]
