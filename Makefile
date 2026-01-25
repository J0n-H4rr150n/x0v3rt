.PHONY: help start build build-win build-mac build-linux dev electron-dev clean

help:
	@echo "Available targets:"
	@echo "  make start       Build renderer and start app"
	@echo "  make build       Build renderer"
	@echo "  make build-win   Build Windows installer"
	@echo "  make build-mac   Build macOS installer"
	@echo "  make build-linux Build Linux installer"
	@echo "  make dev         Start Vite dev server"
	@echo "  make electron-dev Start dev server + Electron"
	@echo "  make clean       Remove dist folder"

start:
	npm run build:dev && npm start

build:
	npm run build

build-win:
	npm run build:win

build-mac:
	npm run build:mac

build-linux:
	npm run build:linux

dev:
	npm run dev

electron-dev:
	npm run electron:dev

clean:
	-@rmdir /s /q dist 2>NUL || cmd /c "exit /b 0"
