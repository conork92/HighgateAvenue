.PHONY: help start run stop build clean install dev serve docker-start docker-logs test

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

start: ## Run app locally at http://localhost:8001 (creates venv on first run)
	@if [ ! -x "venv/bin/python" ]; then \
		$(MAKE) install; \
	fi
	$(MAKE) serve

run: start ## Same as start

docker-start: ## Start with Docker Compose (with rebuild)
	@echo "Building Docker image..."
	docker-compose build
	@echo "Starting Highgate Avenue application..."
	docker-compose up -d
	@echo "Application is running at http://localhost:8001"

stop: ## Stop Docker Compose stack
	@echo "Stopping Highgate Avenue application..."
	docker-compose down

restart: stop docker-start ## Rebuild and restart Docker stack

build: ## Build the Docker image
	@echo "Building Docker image..."
	docker-compose build

docker-logs: ## View Docker application logs
	docker-compose logs -f

logs: docker-logs ## Alias for docker-logs

serve: ## Run app locally with Python (no Docker rebuild)
	@if [ ! -x "venv/bin/python" ]; then \
		echo "Virtual environment not found — run 'make install' first."; \
		exit 1; \
	fi
	@PORT=$${PORT:-8001}; \
	if lsof -ti :$$PORT >/dev/null 2>&1; then \
		echo "Port $$PORT in use — stopping existing process..."; \
		lsof -ti :$$PORT | xargs kill -9 2>/dev/null || true; \
		sleep 0.5; \
	fi; \
	echo "Starting Flask at http://localhost:$$PORT (Ctrl+C to stop)..."; \
	FLASK_ENV=development PORT=$$PORT venv/bin/python app.py

dev: install serve ## Install deps and run locally

install: ## Install dependencies locally
	@if [ ! -d "venv" ]; then \
		echo "Creating virtual environment..."; \
		python3 -m venv venv; \
	fi
	venv/bin/pip install -r requirements.txt
	@echo "Dependencies installed!"

clean: ## Clean up Docker containers and images
	@echo "Cleaning up..."
	docker-compose down -v
	docker system prune -f

test: ## Run tests (placeholder for future tests)
	@echo "No tests configured yet"

.DEFAULT_GOAL := help
