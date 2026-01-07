const statusBadge = document.getElementById('status-badge');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const logList = document.getElementById('log-list');

const connTally = document.getElementById('conn-tally');
const connBackend = document.getElementById('conn-backend');
// New Elements
const companySelect = document.getElementById('company-select');
const btnRefreshCompanies = document.getElementById('btn-refresh-companies');

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
        
        const companies = await window.electronAPI.getCompanies();
        const current = await window.electronAPI.getCurrentCompany();
        
        companySelect.innerHTML = '';
        
        if (companies.length === 0) {
            const opt = document.createElement('option');
            opt.text = "No Companies Found (Is Tally Open?)";
            opt.value = ""; // Empty value to prevent selection
            companySelect.appendChild(opt);
            
            if (current && current !== "No Companies Found (Is Tally Open?)") {
                const curOpt = document.createElement('option');
                curOpt.value = current;
                curOpt.text = `${current} (Configured)`;
                curOpt.selected = true;
                companySelect.appendChild(curOpt);
            }
        } else {
            companies.forEach(comp => {
                const opt = document.createElement('option');
                opt.value = comp;
                opt.text = comp;
                if (comp === current) opt.selected = true;
                companySelect.appendChild(opt);
            });
        }
    } catch (e) {
        console.error("Error loading companies", e);
        companySelect.innerHTML = '<option>Error loading companies</option>';
    } finally {
        companySelect.disabled = false;
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

btnRefreshCompanies.addEventListener('click', loadCompanies);

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
        ${logData.detail ? `<span class="detail">${logData.detail}</span>` : ''}
    `;

    logList.appendChild(div);
    
    logList.scrollTop = logList.scrollHeight;
});
