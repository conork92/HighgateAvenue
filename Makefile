.PHONY: help start run stop build clean install dev serve test

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

start: ## Start the application using Docker Compose (with rebuild)
	@echo "Building Docker image..."
	docker-compose build
	@echo "Starting Highgate Avenue application..."
	docker-compose up -d
	@echo "Application is running at http://localhost:8001"

run: start ## Same as start (Docker Compose with rebuild)

stop: ## Stop the application
	@echo "Stopping Highgate Avenue application..."
	docker-compose down

restart: stop start ## Restart the application

build: ## Build the Docker image
	@echo "Building Docker image..."
	docker-compose build

logs: ## View application logs
	docker-compose logs -f

serve: ## Run app locally with Python (no Docker rebuild)
	@if [ ! -x "venv/bin/python" ]; then \
		echo "Virtual environment not found — run 'make install' first."; \
		exit 1; \
	fi
	@echo "Starting Flask at http://localhost:8001 (Ctrl+C to stop)..."
	FLASK_ENV=development PORT=8001 venv/bin/python app.py

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
