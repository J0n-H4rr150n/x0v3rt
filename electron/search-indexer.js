/**
 * Search Indexer
 *
 * Full-text search using SQLite FTS5
 * Indexes file names and content for fast searching
 */

const Database = require('better-sqlite3');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const TEXT_EXTENSIONS = ['.md', '.txt', '.json', '.js', '.py', '.sql', '.html', '.css', '.yaml', '.yml', '.sh', '.bash', '.xml', '.csv'];

class SearchIndexer {
    constructor(workspaceDir) {
        this.workspaceDir = workspaceDir;
        this.dbPath = path.join(workspaceDir, '.x0v3rt', 'db', 'search.db');
        this.db = null;
    }

    async initialize() {
        await this.ensureDbDir();
        this.db = new Database(this.dbPath);
        this.createTables();
        console.log('[SearchIndexer] Initialized:', this.dbPath);
    }

    async ensureDbDir() {
        const dbDir = path.dirname(this.dbPath);
        if (!fsSync.existsSync(dbDir)) {
            await fs.mkdir(dbDir, { recursive: true });
        }
    }

    createTables() {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS files (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                path TEXT UNIQUE NOT NULL,
                filename TEXT NOT NULL,
                extension TEXT,
                size INTEGER,
                modified_at INTEGER,
                indexed_at INTEGER,
                front_matter TEXT
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS files_fts USING fts5(
                filename,
                content,
                front_matter,
                tokenize='porter unicode61'
            );

            CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
            CREATE INDEX IF NOT EXISTS idx_files_modified ON files(modified_at);
        `);

        // Ensure new columns exist for older DBs
        const columns = this.db.prepare(`PRAGMA table_info(files)`).all().map((col) => col.name);
        if (!columns.includes('front_matter')) {
            this.db.exec(`ALTER TABLE files ADD COLUMN front_matter TEXT`);
        }

        // Recreate FTS table if missing front_matter column
        try {
            this.db.prepare('SELECT front_matter FROM files_fts LIMIT 1').get();
        } catch (_error) {
            this.db.exec(`DROP TABLE IF EXISTS files_fts;`);
            this.db.exec(`
                CREATE VIRTUAL TABLE files_fts USING fts5(
                    filename,
                    content,
                    front_matter,
                    tokenize='porter unicode61'
                );
            `);
        }
    }

    parseFrontMatter(content, ext) {
        if (ext !== '.md') {
            return { frontMatterText: '', body: content };
        }

        const trimmed = content.startsWith('\uFEFF') ? content.slice(1) : content;
        if (!trimmed.startsWith('---')) {
            return { frontMatterText: '', body: content };
        }

        const match = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
        if (!match) {
            return { frontMatterText: '', body: content };
        }

        const frontMatterRaw = match[1];
        let frontMatterText = frontMatterRaw;

        try {
            const parsed = yaml.load(frontMatterRaw);
            if (parsed && typeof parsed === 'object') {
                frontMatterText = JSON.stringify(parsed, null, 2);
            }
        } catch (_error) {
            // Keep raw front matter if parsing fails
        }

        const body = trimmed.slice(match[0].length);
        return { frontMatterText, body };
    }

    async indexFile(filepath) {
        try {
            const stats = await fs.stat(filepath);
            const filename = path.basename(filepath);
            const ext = path.extname(filepath).toLowerCase();

            // Only index text files
            if (!TEXT_EXTENSIONS.includes(ext)) {
                return false;
            }

            // Skip very large files (>1MB)
            if (stats.size > 1024 * 1024) {
                console.warn('[SearchIndexer] Skipping large file:', filepath);
                return false;
            }

            const content = await fs.readFile(filepath, 'utf-8');
            const { frontMatterText, body } = this.parseFrontMatter(content, ext);
            const relativePath = path.relative(this.workspaceDir, filepath);

            // Insert/update file record
            const stmt = this.db.prepare(`
                INSERT INTO files (path, filename, extension, size, modified_at, indexed_at, front_matter)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(path) DO UPDATE SET
                    filename = excluded.filename,
                    extension = excluded.extension,
                    size = excluded.size,
                    modified_at = excluded.modified_at,
                    indexed_at = excluded.indexed_at,
                    front_matter = excluded.front_matter
                RETURNING id
            `);

            const result = stmt.get(
                relativePath,
                filename,
                ext,
                stats.size,
                Math.floor(stats.mtimeMs),
                Date.now(),
                frontMatterText
            );

            const fileId = result.id;

            // Update FTS index - FTS5 doesn't support UPSERT, so DELETE then INSERT
            // First, try to delete existing entry
            this.db.prepare(`DELETE FROM files_fts WHERE rowid = ?`).run(fileId);

            // Then insert the new entry
            this.db.prepare(`
                INSERT INTO files_fts (rowid, filename, content, front_matter)
                VALUES (?, ?, ?, ?)
            `).run(fileId, filename, body, frontMatterText);

            return true;
        } catch (error) {
            console.error('[SearchIndexer] Error indexing file:', filepath, error.message);
            return false;
        }
    }

    async removeFile(filepath) {
        const relativePath = path.relative(this.workspaceDir, filepath);

        const stmt = this.db.prepare(`DELETE FROM files WHERE path = ? RETURNING id`);
        const result = stmt.get(relativePath);

        if (result) {
            this.db.prepare(`DELETE FROM files_fts WHERE rowid = ?`).run(result.id);
        }
    }

    async rebuildIndex() {
        console.log('[SearchIndexer] Rebuilding index...');

        // Clear existing index
        this.db.exec(`
            DELETE FROM files_fts;
            DELETE FROM files;
        `);

        // Index all files
        await this.indexDirectory(this.workspaceDir);

        const count = this.db.prepare(`SELECT COUNT(*) as count FROM files`).get();
        console.log(`[SearchIndexer] Indexed ${count.count} files`);
    }

    async indexDirectory(dir) {
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                // Skip hidden directories and .x0v3rt
                if (entry.isDirectory()) {
                    if (entry.name.startsWith('.')) continue;
                    await this.indexDirectory(fullPath);
                } else if (entry.isFile()) {
                    await this.indexFile(fullPath);
                }
            }
        } catch (error) {
            console.error('[SearchIndexer] Error indexing directory:', dir, error.message);
        }
    }

    search(query, limit = 20) {
        if (!query || query.trim().length === 0) {
            return [];
        }

        try {
            // FTS5 query with phrase and prefix matching
            const ftsQuery = query.trim().split(/\s+/).map(term => `"${term}"*`).join(' OR ');

            const results = this.db.prepare(`
                SELECT
                    f.path,
                    f.filename,
                    snippet(files_fts, 1, '<mark>', '</mark>', '...', 64) as snippet,
                    rank
                FROM files_fts
                JOIN files f ON files_fts.rowid = f.id
                WHERE files_fts MATCH ?
                ORDER BY rank
                LIMIT ?
            `).all(ftsQuery, limit);

            return results;
        } catch (error) {
            console.error('[SearchIndexer] Search error:', error.message);

            // Fallback to simple LIKE search
            return this.db.prepare(`
                SELECT path, filename, '' as snippet, 0 as rank
                FROM files
                WHERE filename LIKE ? OR path LIKE ?
                LIMIT ?
            `).all(`%${query}%`, `%${query}%`, limit);
        }
    }

    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

module.exports = SearchIndexer;
