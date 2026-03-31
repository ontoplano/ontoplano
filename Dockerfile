FROM node:22-slim AS build

WORKDIR /app
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn build

FROM node:22-slim AS production

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production

COPY --from=build /app/build ./build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=1493

EXPOSE 1493

CMD ["node", "build/index.js"]
