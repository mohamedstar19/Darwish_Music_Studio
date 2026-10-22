# ---- Build the web app ----
FROM node:22-alpine AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---- Runtime: API + built web app + ffmpeg ----
FROM node:22-alpine
RUN apk add --no-cache ffmpeg chromaprint tini wget
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY server/ ./
COPY --from=web /web/dist /app/web/dist

ENV NODE_ENV=production \
    PORT=8080 \
    MEDIA_DIR=/data/media \
    WEB_DIR=/app/web/dist

RUN mkdir -p /data/media && chown -R node:node /data
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "src/index.js"]
