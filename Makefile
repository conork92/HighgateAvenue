.PHONY: help start stop build clean install dev test

help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

start: ## Start the application using Docker Compose
	@echo "Starting Highgate Avenue application..."
	docker-compose up -d
	@echo "Application is running at http://localhost:8000"

stop: ## Stop the application
	@echo "Stopping Highgate Avenue application..."
	docker-compose down

restart: stop start ## Restart the application

build: ## Build the Docker image
	@echo "Building Docker image..."
	docker-compose build

logs: ## View application logs
	docker-compose logs -f

dev: ## Run in development mode (local Python)
	@echo "Starting in development mode..."
	@if [ ! -d "venv" ]; then \
		echo "Creating virtual environment..."; \
		python3 -m venv venv; \
	fi
	@echo "Installing dependencies..."
	venv/bin/pip install -r requirements.txt
	@echo "Starting Flask development server..."
	FLASK_ENV=development venv/bin/python app.py

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
