const fs = require('fs');
const path = require('path');

let config = {};

// Determine the root directory (handles both Node.js and pkg executable)
const appDir = typeof process.pkg !== 'undefined' ? path.dirname(process.execPath) : __dirname;

// Try to load config.json from the application directory
try {
    const configPath = path.join(appDir, 'config.json');
    if (fs.existsSync(configPath)) {
        const fileContent = fs.readFileSync(configPath, 'utf-8');
        config = JSON.parse(fileContent);
    } else {
        console.error(`config.json not found in ${appDir}!`);
        process.exit(1);
    }
} catch (error) {
    console.error("Error loading config.json:", error.message);
    process.exit(1);
}

module.exports = config;