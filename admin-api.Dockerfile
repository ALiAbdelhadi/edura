# Vercel Services container for apps/admin-api in the back-office project.
# scripts/deploy-backoffice.sh copies it over Dockerfile.vercel in the staged
# repo (Vercel accepts only that file name; the context is the repo root).
FROM oven/bun:1.4.2

WORKDIR /app
COPY . .
# Runs @repo/database's postinstall (prisma generate) like the Railway build.
RUN bun install --frozen-lockfile

ENV NODE_ENV=production
# Vercel containers listen on 80 by default; src/env.ts reads PORT.
ENV PORT=80
EXPOSE 80

WORKDIR /app/apps/admin-api
CMD ["bun", "src/server.ts"]
