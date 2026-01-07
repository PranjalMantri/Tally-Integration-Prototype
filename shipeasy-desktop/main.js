const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Import the Agent Class
const TallyAgent = require(path.join(__dirname, '../shipeasy-agent/agent.js'));

let mainWindow;
let tray;
let agent;
let isQuitting = false;

const USER_DATA_PATH = app.getPath('userData');
const CONFIG_PATH = path.join(USER_DATA_PATH, 'config.json');
const STATE_PATH = path.join(USER_DATA_PATH, 'app-state.json');

function loadUserConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = fs.readFileSync(CONFIG_PATH, 'utf8');
            return JSON.parse(data);
        }
        const localConfigPath = path.join(__dirname, '../shipeasy-agent/config.json');
        if (fs.existsSync(localConfigPath)) {
            const data = fs.readFileSync(localConfigPath, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error("Failed to load config:", e);
    }
    return {};
}

function saveUserConfig(newConfig) {
    try {
        const current = loadUserConfig();
        const updated = { ...current, ...newConfig };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2));
        return updated;
    } catch (e) {
        console.error("Failed to save config:", e);
        return null;
    }
}

function loadState() {
    try {
        if (fs.existsSync(STATE_PATH)) {
            return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
        }
    } catch (e) { console.error("Failed to load state", e); }
    return {};
}

function saveSelectedCompany(companyName) {
    if (!companyName || companyName === "No Companies Found (Is Tally Open?)") return;
    try {
        const state = loadState();
        state.selectedCompany = companyName;
        fs.writeFileSync(STATE_PATH, JSON.stringify(state));
    } catch(e) { console.error("Failed to save state", e); }
}

function initAgent(config) {
    if (agent) {
        agent.stop();
        agent.removeAllListeners(); 
    }

    // Merge persisted company selection
    const state = loadState();
    if (state.selectedCompany && state.selectedCompany !== "No Companies Found (Is Tally Open?)") {
        config.tally_company = state.selectedCompany;
    }

    agent = new TallyAgent(config);

    // Re-attach listeners
    agent.on('log', (logData) => {
        if (mainWindow) mainWindow.webContents.send('agent-log', logData);
    });

    agent.on('connection-status', (status) => {
        if (mainWindow) mainWindow.webContents.send('connection-status', status);
    });

    return agent;
}

function createWindow(show = false) {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        show: show, 
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        },
        icon: path.join(__dirname, 'assets/icon.png')
    });

    mainWindow.loadFile('index.html');

    mainWindow.once('ready-to-show', () => {
         // Determine which view to show
         const config = loadUserConfig();
         if (config.tally_agent_key) {
             mainWindow.webContents.send('show-dashboard');
             if (show) mainWindow.show();
         } else {
             mainWindow.webContents.send('show-setup');
             mainWindow.show();
         }
    });

    // Handle Close: Hide instead of close
    mainWindow.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
        return false;
    });
}

function createTray() {
    if (tray) return;

    const iconPath = path.join(__dirname, 'assets/icon.png');
    tray = new Tray(iconPath);
    tray.setToolTip('ShipEasy Tally Agent');

    const updateMenu = () => {
        const contextMenu = Menu.buildFromTemplate([
            { label: 'Open Dashboard', click: () => mainWindow.show() },
            { type: 'separator' },
            { 
                label: 'Start Agent', 
                enabled: !!(agent && !agent.isRunning),
                click: () => {
                    if (agent) {
                        agent.start();
                        updateStatus('Running');
                        updateMenu();
                    }
                } 
            },
            { 
                label: 'Stop Agent', 
                enabled: !!(agent && agent.isRunning),
                click: () => {
                    if (agent) {
                        agent.stop();
                        updateStatus('Stopped');
                        updateMenu();
                    }
                } 
            },
            { type: 'separator' },
            { 
                label: 'Quit', 
                click: () => {
                    isQuitting = true;
                    if(agent) agent.stop();
                    app.quit();
                } 
            }
        ]);
        tray.setContextMenu(contextMenu);
    };

    updateMenu();
    tray.on('double-click', () => mainWindow.show());
    
}

function updateStatus(status) {
    if (mainWindow) {
        mainWindow.webContents.send('agent-status', status);
    }
}

app.whenReady().then(() => {
    Menu.setApplicationMenu(null);

    // Enable Auto-Launch
    app.setLoginItemSettings({
        openAtLogin: true,
        path: app.getPath('exe')
    });

    const config = loadUserConfig();
    const hasKey = !!config.tally_agent_key;

    // If we have a key, start hidden. If not, start visible.
    createWindow(!hasKey);

    if (hasKey) {
        initAgent(config);
        agent.start();
        createTray();
    } 
});

// IPC: Save Config from Setup Screen
ipcMain.handle('save-setup-config', async (_event, key) => {
    if (!key) return false;
    
    // Save to disk
    const newConfig = saveUserConfig({ tally_agent_key: key });
    if (!newConfig) return false;

    // Init and Start Agent
    initAgent(newConfig);
    agent.start();
    createTray();

    mainWindow.webContents.send('show-dashboard');
    return true;
});

// IPC: Update API Key from Settings
ipcMain.handle('update-api-key', async (_event, key) => {
    if (!key) return false;

    // Save to disk
    const newConfig = saveUserConfig({ tally_agent_key: key });
    if (!newConfig) return false;

    // Restart Agent logic
    if (agent) {
        agent.stop();
        // Give it a moment to cleanup if necessary, or just re-init
        // Re-initializing handles removing listeners
        updateStatus('Stopped');
    }

    initAgent(newConfig);
    agent.start();
    
    // Ensure tray is created if it wasn't for some reason
    if (!tray) createTray();
    
    // Update UI status
    updateStatus('Running');
    
    return true;
});

// IPC: Get Masked API Key
ipcMain.handle('get-api-key-masked', () => {
    const config = loadUserConfig();
    const key = config.tally_agent_key;
    if (!key) return '';

    return key.split("").map((x) => "*").join("")
});

// Setup IPC handlers from UI
ipcMain.handle('start-agent', () => {
    if (agent) {
        agent.start();
        return 'Running';
    }
    return 'Stopped';
});

ipcMain.handle('stop-agent', () => {
    if (agent) {
        agent.stop();
        return 'Stopped';
    }
    return 'Stopped';
});

ipcMain.handle('get-companies', async () => {
    if (!agent) return [];
    return await agent.getCompanies();
});

ipcMain.handle('set-company', (_event, companyName) => {
    if (agent) {
        agent.setCompany(companyName);
        saveSelectedCompany(companyName);
        return true;
    }
    return false;
});

ipcMain.handle('get-current-company', () => {
    return agent ? agent.company : '';
});

ipcMain.handle('get-status', () => {
    return (agent && agent.isRunning) ? 'Running' : 'Stopped';
});

// Prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.show();
            mainWindow.focus();
        }
    });
}
