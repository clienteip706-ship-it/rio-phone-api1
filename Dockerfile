FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates ffmpeg && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/yt-dlp && /opt/yt-dlp/bin/pip install --no-cache-dir --upgrade "yt-dlp[default]"
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
ENV RIO_SPOTIFY_HOST=0.0.0.0
ENV YT_DLP_PATH=/opt/yt-dlp/bin/yt-dlp
CMD ["node", "server.js"]
