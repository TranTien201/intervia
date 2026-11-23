.PHONY: help setup run-dev run-mock run-backend mongo

help:
	@echo "make setup        Install backend (uv sync) and web (npm install) dependencies"
	@echo "make run-dev      MongoDB + backend (port 8000) + web in hybrid mode (real API for auth, roles, cvs, jds)"
	@echo "make run-mock     Web only, every endpoint mocked (no backend, no MongoDB)"
	@echo "make run-backend  MongoDB + backend only"

setup:
	cd backend && uv sync
	cd web && npm install

mongo:
	@docker start mongo >/dev/null || { echo "Cannot start the 'mongo' container. Is Docker running?"; exit 1; }

# Backend and web run side by side; Ctrl+C stops both.
run-dev: mongo
	@trap 'kill 0' INT TERM; \
	(cd backend && uv run uvicorn app.main:app --reload --port 8000) & \
	(cd web && npm run dev:hybrid) & \
	wait

run-mock:
	cd web && npm run dev:mock

run-backend: mongo
	cd backend && uv run uvicorn app.main:app --reload --port 8000
