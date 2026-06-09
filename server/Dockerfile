# fitsheet server — runs the TypeScript API directly with tsx (node:sqlite needs Node >= 22.5;
# unflagged on Node 24). No native build step (we use the built-in SQLite).

FROM node:24-alpine
WORKDIR /app

# install deps (tsx is needed at runtime since we run TS directly)
COPY package.json package-lock.json* ./
RUN npm install

COPY . .

ENV TZ=America/Chicago
ENV DATA_DIR=/app/data
ENV PORT=3000
RUN mkdir -p /app/data/uploads

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/health || exit 1

CMD ["npm", "start"]
