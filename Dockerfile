# syntax=docker/dockerfile:1
#
# Herald — long-running worker image. Runs `herald serve`, which posts the
# standup on config.schedule. Build compiles TypeScript with the dev toolchain;
# the runtime stage ships only production deps + compiled JS (no tsx/esbuild),
# so it's small and the ignored-esbuild-build-script warning never applies.

# ---- build: compile src/ -> dist/ ----
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# ---- runtime: production deps + compiled output ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --from=build /app/dist ./dist

# Herald reads herald.config.json from the working directory. Mount yours at
# runtime (`-v "$PWD/herald.config.json:/app/herald.config.json:ro"`) or COPY it
# into a fork's image. Secrets ALWAYS come from the environment, never config:
#   GITHUB_TOKEN, ANTHROPIC_API_KEY (or GROQ_API_KEY / OPENAI_API_KEY),
#   DISCORD_WEBHOOK_URL.
CMD ["node", "dist/cli.js", "serve"]
