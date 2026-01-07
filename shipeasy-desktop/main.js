const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

// Import the Agent Class
const TallyAgent = require(path.join(__dirname, '../shipeasy-agent/agent.js'));

let mainWindow;
let tray;
let agent;
let isQuitting = false;

function loadConfig() {
    try {
        const configPath = path.join(__dirname, '../shipeasy-agent/config.json');
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error("Failed to load config:", e);
    }
    return {};
}

// Initialize Agent
const agentConfig = loadConfig();

// Persisted Setting: Selected Company
const statePath = path.join(app.getPath('userData'), 'app-state.json');
let savedState = {};
try {
    if (fs.existsSync(statePath)) {
        savedState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    }
} catch (e) {
    console.error("Failed to load state", e);
}

// Override config company if user selected one previously
if (savedState.selectedCompany && savedState.selectedCompany !== "No Companies Found (Is Tally Open?)") {
    agentConfig.tally_company = savedState.selectedCompany;
}

agent = new TallyAgent(agentConfig);

function saveSelectedCompany(companyName) {
    if (!companyName || companyName === "No Companies Found (Is Tally Open?)") return;
    try {
        savedState.selectedCompany = companyName;
        fs.writeFileSync(statePath, JSON.stringify(savedState));
    } catch(e) {
        console.error("Failed to save state", e);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        show: false, 
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true
        },
        icon: path.join(__dirname, 'assets/icon.png')
    });

    mainWindow.loadFile('index.html');

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
    const iconPath = path.join(__dirname, 'assets/icon.png');
    
    tray = new Tray(iconPath);
    tray.setToolTip('ShipEasy Tally Agent');

    const contextMenu = Menu.buildFromTemplate([
        { 
            label: 'Show Logs', 
            click: () => mainWindow.show() 
        },
        { type: 'separator' },
        { 
            label: 'Start Agent', 
            click: () => {
                agent.start();
                updateStatus('Running');
            } 
        },
        { 
            label: 'Stop Agent', 
            enabled: true,
            click: () => {
                agent.stop();
                updateStatus('Stopped');
            } 
        },
        { type: 'separator' },
        { 
            label: 'Quit', 
            click: () => {
                isQuitting = true;
                agent.stop();
                app.quit();
            } 
        }
    ]);

    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        mainWindow.show();
    });
}

function updateStatus(status) {
    if (mainWindow) {
        mainWindow.webContents.send('agent-status', status);
    }
}

app.whenReady().then(() => {
    // Enable Auto-Launch
    app.setLoginItemSettings({
        openAtLogin: true,
        path: app.getPath('exe')
    });

    createWindow();
    
    // We create the tray immediately
    try {
        createTray();
    } catch (e) {
        console.log("Tray creation failed.");
    }

    // Agent Events -> IPC
    agent.on('log', (logData) => {
        if (mainWindow) {
            mainWindow.webContents.send('agent-log', logData);
        }
    });

    agent.on('connection-status', (status) => {
        if (mainWindow) {
            mainWindow.webContents.send('connection-status', status);
        }
    });

    // Auto-start agent on app launch ALWAYS
    agent.start();
});

// Setup IPC handlers from UI
ipcMain.handle('start-agent', () => {
    agent.start();
    return 'Running';
});

ipcMain.handle('stop-agent', () => {
    agent.stop();
    return 'Stopped';
});

ipcMain.handle('get-companies', async () => {
    if (!agent) return [];
    // If agent is not running (polling), we can still fetch companies if Tally is open
    // Ideally we might need to "ping" tally. usage of specific agent method.
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
    return agent.isRunning ? 'Running' : 'Stopped';
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
