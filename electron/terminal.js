/**
 * Terminal (PTY) Manager
 *
 * Provides a VS Code-style integrated terminal using node-pty.
 */

const { ipcMain } = require('electron');
const pty = require('node-pty');
const fs = require('fs');

const terminals = new Map();
let terminalCounter = 0;

function getDefaultShell() {
    if (process.platform === 'win32') {
        const bashCandidates = [
            process.env.SHELL,
            'C:\\Program Files\\Git\\bin\\bash.exe',
            'C:\\Program Files\\Git\\usr\\bin\\bash.exe',
            'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
            'C:\\Program Files (x86)\\Git\\usr\\bin\\bash.exe'
        ].filter(Boolean);

        const bashPath = bashCandidates.find((candidate) => candidate && fs.existsSync(candidate));
        if (bashPath) {
            return bashPath;
        }

        return process.env.COMSPEC || 'powershell.exe';
    }

    if (process.env.SHELL && process.env.SHELL.includes('bash')) {
        return process.env.SHELL;
    }

    if (fs.existsSync('/bin/bash')) {
        return '/bin/bash';
    }

    return process.env.SHELL || '/bin/sh';
}

function createPty() {
    const shell = getDefaultShell();

    return pty.spawn(shell, [], {
        name: 'xterm-color',
        cols: 80,
        rows: 24,
        cwd: process.cwd(),
        env: process.env,
        encoding: 'utf8'
    });
}

function getTerminalMap(senderId) {
    if (!terminals.has(senderId)) {
        terminals.set(senderId, new Map());
    }
    return terminals.get(senderId);
}

function generateTerminalId() {
    terminalCounter += 1;
    return `term-${terminalCounter}`;
}

function registerHandlers() {
    ipcMain.handle('terminal:create', (event) => {
        const senderId = event.sender.id;
        const terminalId = generateTerminalId();
        const senderTerminals = getTerminalMap(senderId);

        const ptyProcess = createPty();
        senderTerminals.set(terminalId, ptyProcess);

        ptyProcess.onData((data) => {
            event.sender.send('terminal:data', { terminalId, data });
        });

        ptyProcess.onExit(() => {
            senderTerminals.delete(terminalId);
            event.sender.send('terminal:exit', terminalId);
        });

        return { success: true, terminalId };
    });

    ipcMain.handle('terminal:dispose', (event, terminalId) => {
        const senderId = event.sender.id;
        const senderTerminals = getTerminalMap(senderId);
        const ptyProcess = senderTerminals.get(terminalId);
        if (ptyProcess) {
            try {
                ptyProcess.kill();
            } finally {
                senderTerminals.delete(terminalId);
            }
        }

        return { success: true };
    });

    ipcMain.on('terminal:input', (event, terminalId, data) => {
        const senderId = event.sender.id;
        const senderTerminals = getTerminalMap(senderId);
        const ptyProcess = senderTerminals.get(terminalId);
        if (ptyProcess && typeof data === 'string') {
            ptyProcess.write(data);
        }
    });

    ipcMain.on('terminal:resize', (event, terminalId, cols, rows) => {
        const senderId = event.sender.id;
        const senderTerminals = getTerminalMap(senderId);
        const ptyProcess = senderTerminals.get(terminalId);
        if (ptyProcess && Number.isInteger(cols) && Number.isInteger(rows)) {
            ptyProcess.resize(cols, rows);
        }
    });
}
module.exports = {
    registerHandlers
};
