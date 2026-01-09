const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');

// Import the Agent Class
const TallyAgent = require(path.join(__dirname, 'services/tally-agent.js'));

let mainWindow;
let tray;
let agent;
let isQuitting = false;

const { loadUserConfig, saveUserConfig, loadState, saveSelectedCompany } = require('./config/config-manager.js');

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

    agent.on('companies-updated', (companies) => {
        if (mainWindow) mainWindow.webContents.send('companies-updated', companies);
    });

    agent.on('company-changed', (newCompany) => {
        saveSelectedCompany(newCompany);
        if (mainWindow) mainWindow.webContents.send('company-selection-changed', newCompany);
    });

    return agent;
}

function createWindow(show = false) {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        show: show, 
        webPreferences: {
            preload: path.join(__dirname, 'preload/index.js'),
            nodeIntegration: false,
            contextIsolation: true
        },
        icon: path.join(__dirname, 'assets/icon.png')
    });

    mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'));

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
