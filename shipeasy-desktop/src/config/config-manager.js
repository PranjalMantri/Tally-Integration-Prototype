const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const USER_DATA_PATH = app.getPath('userData');
const CONFIG_PATH = path.join(USER_DATA_PATH, 'config.json');
const STATE_PATH = path.join(USER_DATA_PATH, 'app-state.json');

const LOCAL_CONFIG_PATH = path.join(__dirname, 'config.json');

function loadUserConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = fs.readFileSync(CONFIG_PATH, 'utf8');
            return JSON.parse(data);
        }
        
        if (fs.existsSync(LOCAL_CONFIG_PATH)) {
            const data = fs.readFileSync(LOCAL_CONFIG_PATH, 'utf8');
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

module.exports = {
    loadUserConfig,
    saveUserConfig,
    loadState,
    saveSelectedCompany
};
