# Builds the frontend and runs the Node server that serves it + the API.
FROM node:20-bookworm-slim

# build tools for the native better-sqlite3 module (used only if no prebuilt binary)
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
# Persistent data lives on a mounted volume (see DEPLOY.md)
ENV DB_PATH=/data/data.db
ENV UPLOAD_DIR=/data/uploads

# The host (Railway/Fly/Render) injects PORT; the server reads process.env.PORT
EXPOSE 8080

CMD ["node", "server/index.js"]
