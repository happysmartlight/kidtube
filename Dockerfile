# ═══════════════════════════════════════════════════════════════════
# KidTube Home — image cho Raspberry Pi 5 (arm64) va ca amd64
#
# Multi-stage: stage build co devDependencies va toolchain de bien dich
# better-sqlite3; stage runtime chi giu thu can thiet -> image nho hon.
# ═══════════════════════════════════════════════════════════════════

# ── Stage 1: build ────────────────────────────────────────────────
FROM node:22-bookworm-slim AS builder

# better-sqlite3 la native module, tren arm64 thuong khong co ban prebuilt
# -> phai bien dich, can python3 + g++ + make.
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy manifest truoc de tan dung cache layer: doi code ma khong doi
# dependency thi khong phai npm ci lai.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
RUN npm ci

COPY . .
RUN npm run build

# Cat bo devDependencies khoi node_modules de copy sang runtime.
RUN npm prune --omit=dev


# ── Stage 2: runtime ──────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

# ffmpeg: yt-dlp can de ghep luong video + audio thanh mp4.
# python3-pip: de cai yt-dlp (ban apt thuong qua cu so voi thay doi cua YouTube).
# util-linux: cung cap `setpriv`, entrypoint dung de ha quyen tu root xuong
# user thuong SAU KHI da sua quyen cua bind mount. Cai tuong minh thay vi
# tin la base image co san — thieu thi build hong ngay, khong hong luc chay.
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 python3-pip ca-certificates tini util-linux \
    && rm -rf /var/lib/apt/lists/* \
    && setpriv --help >/dev/null

# Pin phien ban yt-dlp de build tai lap duoc.
# CAP NHAT KHI YT-DLP HONG (YouTube doi ky thuat vai thang mot lan):
# dat YTDLP_VERSION trong .env roi build lai — khong can sua file nay.
#
# CHU Y cai `[default]`, dung cai `yt-dlp` tran: extras nay keo theo
# `yt-dlp-ejs`, tuc bo giai do thach "n challenge" cua YouTube. Thieu no thi
# MOI video deu hong voi "This video is not available" hoac "The page needs
# to be reloaded" — da kiem chung, khong phai phong doan. Bo giai do con can
# mot JS runtime; image nay san co node va services/youtube/ytdlp.ts bat no
# bang `--js-runtimes node`.
ARG YTDLP_VERSION=2026.8.19
RUN pip3 install --no-cache-dir --break-system-packages "yt-dlp[default]==${YTDLP_VERSION}" \
    && yt-dlp --version

WORKDIR /app

COPY --from=builder /app/node_modules  ./node_modules
COPY --from=builder /app/package.json  ./package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/web/dist ./apps/web/dist

# schema.sql KHONG duoc tsc copy sang dist/ (chi copy .ts).
# db/index.ts tim file nay theo nhieu duong dan — day la mot trong so do.
COPY --from=builder /app/apps/api/src/db/schema.sql ./apps/api/src/db/schema.sql

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    MEDIA_DIR=/media \
    WEB_DIST=/app/apps/web/dist \
    YTDLP_PATH=yt-dlp \
    PUID=1000 \
    PGID=1000

# Dau van tay cua ban build. Updater dien hai gia tri nay khi build lai,
# nho do trang Cai dat noi duoc "dang chay commit nao, build luc nao".
# Dat o cuoi de doi commit khong lam hong cache cua cac layer ben tren.
ARG GIT_COMMIT=""
ARG BUILD_TIME=""
ENV KIDTUBE_COMMIT=$GIT_COMMIT \
    KIDTUBE_BUILT_AT=$BUILD_TIME

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
    && mkdir -p /data /media \
    && chown -R node:node /data /media /app

# CO Y khong dat `USER node` o day.
#
# Bind mount tu host (./data:/data) GHI DE quyen so huu da dat luc build.
# Neu nguoi dung chay compose bang root — rat pho bien tren DietPi/Pi OS —
# thu muc host thuoc root:root va uid 1000 khong ghi duoc (SQLITE_CANTOPEN).
#
# Nen: container vao bang root, entrypoint chown volume roi `setpriv` ha quyen
# xuong PUID:PGID (mac dinh 1000:1000). Tien trinh node KHONG chay bang root.
# Muon tu quyet dinh quyen thi dat `user:` trong compose — entrypoint se bo qua.

VOLUME ["/data", "/media"]
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini lam PID 1 de SIGTERM den duoc node -> shutdown gon gang,
# khong bo lai job tai dang chay o trang thai 'running'.
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "apps/api/dist/index.js"]
