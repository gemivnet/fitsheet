# fitsheet — single image: builds the web PWA, then runs the API which also serves the PWA.
# node:sqlite needs Node >= 22.5 (unflagged on 24); no native build step.

# ── stage 1: build the web app (react-native-web → static PWA) ──────────────
FROM node:24-alpine AS web
WORKDIR /web
COPY app/package.json app/package-lock.json* ./
RUN npm install
COPY app/ ./
RUN npm run build:web

# ── stage 2: the server (also serves the built PWA from /app/web) ───────────
FROM node:24-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json* ./
RUN npm install
COPY server/ ./
COPY --from=web /web/dist ./web

ENV TZ=America/Chicago
ENV DATA_DIR=/app/data
ENV PORT=3000
ENV WEB_DIR=/app/web
RUN mkdir -p /app/data/uploads

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["npm", "start"]
