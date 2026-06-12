.PHONY: help dev api web build test typecheck docker docker-run clean

help: ## List available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-15s %s\n", $$1, $$2}'

dev: ## Run Go API on :8080 (DEV=1) and Vite on :5173 in parallel
	@trap 'kill 0' EXIT; \
	  $(MAKE) -j 2 api web

api: ## Run only the Go API in dev mode (no embedded SPA)
	DEV=1 go run ./cmd/server

web: ## Run only the Vite dev server
	npm --prefix web/app run dev

build: ## Build SPA, then Go binary with the SPA embedded
	npm --prefix web/app ci
	npm --prefix web/app run build
	CGO_ENABLED=1 go build -ldflags="-s -w" -o ./server ./cmd/server

test: ## Run Go tests
	go test ./... -count=1

typecheck: ## Type-check the frontend
	npm --prefix web/app run typecheck

docker: ## Build the Docker image
	docker build -t gnrs:latest .

docker-run: ## Run the latest image with .env (uses named volume gnrs-data)
	docker volume create gnrs-data >/dev/null
	docker run --rm -it --env-file .env -p 8080:8080 -v gnrs-data:/app/data gnrs:latest

clean: ## Remove build artifacts
	rm -rf ./server web/dist/* web/app/node_modules web/app/dist
	touch web/dist/.gitkeep
