FROM node:18-alpine

WORKDIR /app

# 先复制依赖文件，利用 Docker 缓存层
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 复制项目文件
COPY public/ ./public/
COPY server.js ./

# CloudBase 云托管会通过 PORT 环境变量指定监听端口
ENV PORT=3000
EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "server.js"]
