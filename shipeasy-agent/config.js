const fs = require('fs');
const path = require('path');

let config = {
    backend_url: "http://localhost:3000",
    tally_url: "http://localhost:9000",
    tally_company : "Test Company",
    tally_agent_key: "507068267c2a318c772e5257dcd6cc899bee43c0f358ddf4cc8ec56660011593",
    polling_interval: 5000
}

// Try to load config.json from the current working directory
try {
    const configPath = path.join(process.cwd(), 'config.json');
    if (fs.existsSync(configPath)) {
        const fileContent = fs.readFileSync(configPath, 'utf-8');
        const externalConfig = JSON.parse(fileContent);
        config = { ...config, ...externalConfig };
        console.log("Loaded external configuration from config.json");
    }
} catch (error) {
    console.error("Error loading config.json:", error.message);
}

module.exports = config;