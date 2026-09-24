# ─────────────────────────────────────────────
# 构建阶段：装依赖 + 出静态产物
# ─────────────────────────────────────────────
FROM node:22-alpine AS build

WORKDIR /app

# 先只拷依赖清单。只要 lock 没变，这一层就能命中缓存，
# 改业务代码不会触发重新 npm ci。
COPY package.json package-lock.json ./
RUN npm ci

# 再拷源码（.dockerignore 已经把 node_modules / docs / .git 挡在外面）
COPY . .

# npm run build = vue-tsc --noEmit && vite build
# 类型错误会让构建直接失败，等于免费拿到一道 CI 关卡
RUN npm run build


# ─────────────────────────────────────────────
# 运行阶段：只要 nginx + 静态文件
# ─────────────────────────────────────────────
FROM nginx:alpine AS runtime

# 站点配置（gzip / 缓存策略 / SPA 回退 / 安全响应头）
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# 从构建阶段取产物，node_modules 和源码都不会进最终镜像
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
