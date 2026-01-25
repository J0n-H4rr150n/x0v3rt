import { defineConfig } from 'vite';
import { join } from 'path';

export default defineConfig(({ mode }) => ({
    root: join(__dirname, 'renderer'),
    base: './',
    build: {
        outDir: join(__dirname, 'dist'),
        emptyOutDir: true,
        minify: mode === 'production', // Only minify in production
        sourcemap: mode === 'development', // Source maps in development
        rollupOptions: {
            input: {
                index: join(__dirname, 'renderer', 'index.html')
            }
        }
    },
    server: {
        port: 5173
    }
}));
