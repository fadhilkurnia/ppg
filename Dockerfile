# syntax=docker/dockerfile:1.7

# 1. Build the SPA bundle
FROM node:20-alpine AS frontend
WORKDIR /web/app

COPY web/app/package.json web/app/package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY web/app ./
RUN npm run build

# 2. Build the Go binary with the SPA embedded
FROM golang:1.25-alpine AS backend
RUN apk add --no-cache build-base sqlite-dev
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
COPY --from=frontend /web/dist ./web/dist

RUN CGO_ENABLED=1 GOOS=linux go build \
      -ldflags="-s -w" \
      -tags sqlite_omit_load_extension \
      -o /out/server ./cmd/server

# 3. Runtime image
FROM alpine:3.20
RUN apk add --no-cache ca-certificates sqlite-libs tini \
 && addgroup -S -g 1001 app \
 && adduser -S -G app -u 1001 app

WORKDIR /app
COPY --from=backend --chown=app:app /out/server ./server
RUN mkdir -p /app/data && chown app:app /app/data

USER app
EXPOSE 8080
VOLUME ["/app/data"]

ENV PORT=8080 \
    DATABASE_PATH=/app/data/app.db

ENTRYPOINT ["/sbin/tini", "--", "./server"]
