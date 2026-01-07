const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onLog: (callback) => ipcRenderer.on('agent-log', (_event, value) => callback(value)),
  onStatus: (callback) => ipcRenderer.on('agent-status', (_event, value) => callback(value)),
  onConnectionStatus: (callback) => ipcRenderer.on('connection-status', (_event, value) => callback(value)),
  startAgent: () => ipcRenderer.invoke('start-agent'),
  stopAgent: () => ipcRenderer.invoke('stop-agent'),
  getStatus: () => ipcRenderer.invoke('get-status')
});
