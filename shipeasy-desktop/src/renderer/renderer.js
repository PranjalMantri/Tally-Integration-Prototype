const statusBadge = document.getElementById('status-badge');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const logList = document.getElementById('log-list');

const connTally = document.getElementById('conn-tally');
const connBackend = document.getElementById('conn-backend');
const btnClearLogs = document.getElementById('btn-clear-logs');
// New Elements
const companySelect = document.getElementById('company-select');

const setupView = document.getElementById('setup-view');
const dashboardView = document.getElementById('dashboard-view');
const inputAgentKey = document.getElementById('input-agent-key');
const btnSaveKey = document.getElementById('btn-save-key');
const setupError = document.getElementById('setup-error');

// Settings Elements
const btnSettings = document.getElementById('btn-settings');
const settingsModal = document.getElementById('settings-modal');
const closeSettings = document.getElementById('close-settings');
const btnSaveSettings = document.getElementById('btn-save-settings');
const btnCancelSettings = document.getElementById('btn-cancel-settings');
const settingsApiKeyInput = document.getElementById('settings-api-key');

// --- View Switching Logic ---
window.electronAPI.onShowSetup(() => {
    setupView.style.display = 'block';
    dashboardView.style.display = 'none';
});

window.electronAPI.onShowDashboard(() => {
    setupView.style.display = 'none';
    dashboardView.style.display = 'block';
    
    updateStatusUI('Running');
    loadCompanies();
});

btnSaveKey.addEventListener('click', async () => {
    const key = inputAgentKey.value.trim();
    if (!key) {
        setupError.textContent = "Please enter a valid key.";
        setupError.style.display = 'block';
        return;
    }
    setupError.style.display = 'none';
    btnSaveKey.disabled = true;
    btnSaveKey.textContent = "Saving...";

    const success = await window.electronAPI.saveConfig(key);
    if (!success) {
        setupError.textContent = "Failed to save configuration.";
        setupError.style.display = 'block';
        btnSaveKey.disabled = false;
        btnSaveKey.textContent = "Save & Start Agent";
    }
});

let originalMaskedKey = '';

// Settings Logic
if(btnSettings) {
    btnSettings.addEventListener('click', async () => {
        settingsModal.style.display = 'block';
        
        // Reset State
        settingsApiKeyInput.disabled = false;
        btnSaveSettings.disabled = false;
        btnSaveSettings.textContent = 'Save & Restart';
        
        // Load Masked Key
        originalMaskedKey = await window.electronAPI.getApiKeyMasked();
        settingsApiKeyInput.value = originalMaskedKey;
    });
}

function closeSettingsModal() {
    settingsModal.style.display = 'none';
    settingsApiKeyInput.value = ''; // Clear on close for security
}

if(closeSettings) closeSettings.addEventListener('click', closeSettingsModal);
if(btnCancelSettings) btnCancelSettings.addEventListener('click', closeSettingsModal);

window.onclick = function(event) {
    if (event.target == settingsModal) {
        closeSettingsModal();
    }
}

if(btnSaveSettings) {
    btnSaveSettings.addEventListener('click', async () => {
        const newKey = settingsApiKeyInput.value.trim();
        
        // If empty or same as masked key (user didn't change it), warn or ignore
        if (!newKey) {
            alert("Please enter a valid key.");
            return;
        }
        
        if (newKey === originalMaskedKey) {
            // No change
            closeSettingsModal();
            return; 
        }

        btnSaveSettings.disabled = true;
        settingsApiKeyInput.disabled = true; // Disable input while updating
        btnSaveSettings.textContent = 'Updating...';

        const success = await window.electronAPI.updateApiKey(newKey);
        
        if (success) {
            closeSettingsModal();
            alert("API Key updated and agent restarted.");
        } else {
            alert("Failed to update API Key.");
        }
        
        // Re-enable in all cases
        btnSaveSettings.disabled = false;
        settingsApiKeyInput.disabled = false;
        btnSaveSettings.textContent = 'Save & Restart';
    });
}

function updateStatusUI(status) {
    statusBadge.textContent = status;
    statusBadge.className = 'status-badge ' + status.toLowerCase();
    
    if (status === 'Running') {
        btnStart.disabled = true;
        btnStop.disabled = false;
    } else {
        btnStart.disabled = false;
        btnStop.disabled = true;
        // Reset dots on stop
        connTally.className = 'conn-dot';
        connBackend.className = 'conn-dot';
    }
}

async function loadCompanies() {
    try {
        companySelect.disabled = true;
        companySelect.innerHTML = '<option>Loading...</option>';
        
        let companies = [];
        try {
            companies = await window.electronAPI.getCompanies();
        } catch (err) {
            console.error("Failed to fetch companies:", err);
        }

        let current = '';
        try {
            current = await window.electronAPI.getCurrentCompany();
        } catch (err) {
            console.error("Failed to fetch current company:", err);
        }
        
        companySelect.innerHTML = '';
        
        if (!Array.isArray(companies) || companies.length === 0) {
            const opt = document.createElement('option');
            opt.text = "No Companies Found (Is Tally Open?)";
            opt.value = ""; 
            companySelect.appendChild(opt);
            
            // Keep disabled if no companies
            companySelect.disabled = true;

        } else {
            companies.forEach(comp => {
                const opt = document.createElement('option');
                opt.value = comp;
                opt.text = comp;
                if (comp === current) opt.selected = true;
                companySelect.appendChild(opt);
            });
            // Enable only if companies exist
            companySelect.disabled = false;
        }
    } catch (e) {
        console.error("Error loading companies", e);
        companySelect.innerHTML = '<option>Error loading companies</option>';
        companySelect.disabled = true;
    } 
}

// Initial Status Check
window.electronAPI.getStatus().then(updateStatusUI);
loadCompanies();

window.electronAPI.onConnectionStatus((status) => {
    if (status.tally === true) connTally.className = 'conn-dot active';
    else if (status.tally === false) connTally.className = 'conn-dot error';
    
    // Backend status might be undefined if tally check failed first
    if (status.backend === true) connBackend.className = 'conn-dot active';
    else if (status.backend === false) connBackend.className = 'conn-dot error';
});

// Event Listeners
companySelect.addEventListener('change', async (e) => {
    const newVal = e.target.value;
    if (newVal) {
        await window.electronAPI.setCompany(newVal);
    }
});

btnStart.addEventListener('click', async () => {
    const newStatus = await window.electronAPI.startAgent();
    updateStatusUI(newStatus);
});

btnStop.addEventListener('click', async () => {
    const newStatus = await window.electronAPI.stopAgent();
    updateStatusUI(newStatus);
});

// Listen for updates from Main
window.electronAPI.onStatus((status) => {
    updateStatusUI(status);
});

window.electronAPI.onCompaniesUpdated((companies) => {
    loadCompanies();
});

window.electronAPI.onCompanySelectionChanged((newCompany) => {
    if (companySelect) {
        companySelect.value = newCompany;
    }
});

window.electronAPI.onLog((logData) => {
    const div = document.createElement('div');
    div.className = 'log-entry';
    
    const timeStr = new Date(logData.timestamp).toLocaleTimeString();
    
    // Type styling
    const typeClass = `type-${logData.type}`;
    
    div.innerHTML = `
        <span class="time">[${timeStr}]</span>
        <span class="${typeClass}">[${logData.type.toUpperCase()}]</span>
        <span class="message">${logData.message}</span>
        ${logData.detail ? `<div class="detail">${logData.detail}</div>` : ''}
    `;

    logList.appendChild(div);
    
    // Auto-scroll to bottom of the list
    requestAnimationFrame(() => {
        div.scrollIntoView({ behavior: "smooth", block: "end" });
    });
});

// Clear Logs
if (btnClearLogs) {
    btnClearLogs.addEventListener('click', () => {
        logList.innerHTML = '';
    });
}
