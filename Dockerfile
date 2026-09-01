# ontoplano, as an image somebody can pull and run.
#
#   docker run -d --name ontoplano -p 1493:1493 \
#     -v ontoplano-data:/data \
#     -e ORIGIN=https://plano.example.com \
#     -e BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
#     ontoplano/ontoplano:latest
#
# One process and one SQLite file. There is no second service to run: no
# Postgres, no Redis, no queue. `docs/DOCKER.md` is the long version.
#
# Three stages, and the middle one is the point. better-sqlite3 is a native
# module: installing it needs python and a C++ compiler, and shipping those in
# the image somebody runs is ~200MB of attack surface for a build that already
# happened. So the compilers live in `deps`, and `runtime` copies the compiled
# result across.

# ── deps: node_modules, compiled, with the toolchain that needs ──────────────
FROM node:22-slim AS deps

RUN apt-get update && apt-get install -y --no-install-recommends \
	python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json yarn.lock .npmrc ./
RUN yarn install --frozen-lockfile

# The production set, built separately and kept: the runtime needs it without
# vite, playwright and the rest, and `yarn install --production` on a machine
# with no compiler cannot rebuild better-sqlite3.
RUN cp -R node_modules /tmp/node_modules_dev \
	&& yarn install --frozen-lockfile --production \
	&& cp -R node_modules /tmp/node_modules_prod \
	&& rm -rf node_modules \
	&& mv /tmp/node_modules_dev node_modules

# ── build: the app itself ────────────────────────────────────────────────────
FROM deps AS build

WORKDIR /app
COPY . .
RUN yarn build

# ── runtime: what actually runs ──────────────────────────────────────────────
FROM node:22-slim AS runtime

# tini, because node as PID 1 does not reap children or forward signals, and a
# container that ignores SIGTERM is one docker kills ten seconds later —
# mid-write, on a database. gosu, to drop from root to `node` after the
# entrypoint has fixed the ownership of a volume docker created as root.
RUN apt-get update && apt-get install -y --no-install-recommends tini gosu \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=deps /tmp/node_modules_prod ./node_modules
COPY --from=build /app/build ./build
# The migrations and the two scripts that apply and snapshot them. Not part of
# the build output, and the container has no git remote to fetch them from.
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/scripts/migrate.mjs /app/scripts/db-snapshot.mjs ./scripts/
COPY --from=build /app/package.json ./
COPY docker-entrypoint.sh /usr/local/bin/
# Stated rather than inherited: a checkout on a filesystem that does not carry
# the executable bit (a Windows clone, an unpacked zip) produces an image whose
# entrypoint cannot run, and the error says "exec format" rather than why.
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Everything the instance keeps is under /data: the database, the snapshots the
# migration takes, and the config file. One volume, one thing to back up.
ENV NODE_ENV=production \
	HOST=0.0.0.0 \
	PORT=1493 \
	DATABASE_URL=/data/ontoplano.db \
	ONTOPLANO_CONFIG_DIR=/data/config \
	ONTOPLANO_SELF_HOST=true

# Not root. The node image ships a `node` user; the volume is handed to it at
# start, because a named volume is created root-owned and the entrypoint is the
# only thing that runs after that.
RUN mkdir -p /data && chown -R node:node /data /app
VOLUME ["/data"]
EXPOSE 1493

# The app answers this without a database read, so it says "the process is up"
# rather than "the disk is fast today".
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||1493)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--", "docker-entrypoint.sh"]
CMD ["node", "build/index.js"]
