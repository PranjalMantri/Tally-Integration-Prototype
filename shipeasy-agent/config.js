const fs = require('fs');
const path = require('path');

let config = {};

// Try to load config.json from the current working directory
try {
    const configPath = path.join(process.cwd(), 'config.json');
    if (fs.existsSync(configPath)) {
        const fileContent = fs.readFileSync(configPath, 'utf-8');
        config = JSON.parse(fileContent);
    } else {
        console.error("config.json not found in current directory!");
        process.exit(1);
    }
} catch (error) {
    console.error("Error loading config.json:", error.message);
    process.exit(1);
}

module.exports = config;