.PHONY: build dev ci
build:
	npm run build
	CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o hockey .
dev: build
	FRONTEND_DIST_DIR=static TEMPLATES_DIR=templates ./hockey
ci: build
	go test -race ./...
	go vet ./...
	npm run check
	git diff --check
