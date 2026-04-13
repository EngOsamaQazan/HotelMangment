FROM node:20-alpine AS base

FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/@google-cloud ./node_modules/@google-cloud
COPY --from=builder /app/node_modules/google-auth-library ./node_modules/google-auth-library
COPY --from=builder /app/node_modules/google-gax ./node_modules/google-gax
COPY --from=builder /app/node_modules/proto3-json-serializer ./node_modules/proto3-json-serializer
COPY --from=builder /app/node_modules/protobufjs ./node_modules/protobufjs
COPY --from=builder /app/google-vision-key.json ./google-vision-key.json

ENV GOOGLE_APPLICATION_CREDENTIALS="./google-vision-key.json"

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
