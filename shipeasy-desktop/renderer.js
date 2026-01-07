const statusBadge = document.getElementById('status-badge');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const logList = document.getElementById('log-list');

const connTally = document.getElementById('conn-tally');
const connBackend = document.getElementById('conn-backend');

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

// Initial Status Check
window.electronAPI.getStatus().then(updateStatusUI);

window.electronAPI.onConnectionStatus((status) => {
    if (status.tally === true) connTally.className = 'conn-dot active';
    else if (status.tally === false) connTally.className = 'conn-dot error';
    
    // Backend status might be undefined if tally check failed first
    if (status.backend === true) connBackend.className = 'conn-dot active';
    else if (status.backend === false) connBackend.className = 'conn-dot error';
});

// Event Listeners
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
    
    // Format Time
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
    
    // Auto Scroll
    logList.scrollTop = logList.scrollHeight;
});
