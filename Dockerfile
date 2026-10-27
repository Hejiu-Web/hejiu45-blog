# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────
# 构建阶段：安装依赖并构建前端
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# pnpm 通过 corepack 提供，版本由 package.json 的 packageManager 字段锁定
RUN corepack enable

# 先只复制依赖清单，充分利用镜像层缓存
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 复制源码并构建前端（产物在 apps/web/dist）
COPY . .
RUN pnpm build

# 注意：这里不执行 `pnpm prune --prod`。
# sharp 通过「平台相关可选依赖」分发原生二进制（@img/sharp-linux-x64 等），
# prune 可能把它们裁掉，导致生产容器里图片处理失效。
# 多带一些 devDependencies 的体积，换取确定性，是更划算的取舍。

# ─────────────────────────────────────────────────────────────
# 运行阶段：只带运行时需要的东西
# ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

# tini 作为 PID 1 处理信号，避免容器内 Node 收不到 SIGTERM
RUN apk add --no-cache tini

WORKDIR /app

ENV NODE_ENV=production \
    PORT=8787

# 非 root 运行，降低容器逃逸影响面
RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 -G nodejs app

COPY --from=builder --chown=app:nodejs /app/package.json ./package.json
COPY --from=builder --chown=app:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=app:nodejs /app/apps ./apps

# 数据与上传目录：建议用 volume 挂载，保证重建容器不丢数据
RUN mkdir -p /app/apps/server/data /app/apps/server/uploads \
    && chown -R app:nodejs /app/apps/server/data /app/apps/server/uploads

USER app

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/server/src/index.js"]
