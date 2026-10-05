FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY public ./public
ENV RIO_SPOTIFY_HOST=0.0.0.0
CMD ["node", "server.js"]
