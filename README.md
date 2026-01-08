# ShipEasy Tally Integration

This project integrates Tally with a cloud backend, allowing for automated syncing of invoices and ledgers.

## Project Structure

*   **shipeasy-backend**: Node.js/Express backend that queues invoices and manages agent authentication.
*   **shipeasy-desktop**: Electron desktop application that runs the agent, providing a GUI for configuration and logs. The source code is organized under `src/` with separate modules for `main`, `renderer`, `services`, and `config`.

## Prerequisites

*   Node.js (v18+ required for `fetch` support)
*   Tally Prime (running on the same machine as the agent/desktop app)
*   MongoDB (for the backend)

## Setup

### 1. Backend Setup

1.  Navigate to `shipeasy-backend`.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Configure `.env` file (ensure `MONGODB_URI` and `PORT` are set).
4.  Create an initial user in the database and add Tally Agent key:
5.  Start the server:
    ```bash
    node server.js
    ```

Ideally - create a user in database with email, password and a tallyAgentKey that is your API key to be set in Desktop Agent

### 2. Desktop Agent Setup

1.  Navigate to `shipeasy-desktop`.
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Start the application:
    ```bash
    npm start
    ```
4.  **Important:** Check `src/config/config.json`.
    *   If running the backend locally, change `backend_url` to `http://localhost:3000`.
    *   If using the cloud backend, ensure it matches your deployment URL.
5.  In the UI, enter the **Agent Key** generated in the backend step.
5.  Ensure Tally is running and a company is open.
6.  Click **Start Service**.

## API Endpoints

*   `POST /api/invoices`: Add a new invoice to the queue.
*   `GET /api/sync/pending`: (Agent only) Get pending invoices.
*   `POST /api/sync/status`: (Agent only) Update status of synced invoices.

## Troubleshooting

*   **Tally Connection Failed**: Ensure Tally is running and the "Enable ODBC Server" option is checked in Tally configuration (usually port 9000).
*   **Backend Connection Failed**: Check if the backend URL is correct in `config.json` and the Agent Key is valid.

Pre-built app for Windows: - [Desktop App Downdload](https://synoriscoin-my.sharepoint.com/:u:/g/personal/pranjal_mantri_synoris_co_in/IQA_O0x4QZdxQKiU_8MV_re_AQFnXryMKQ-RvUl9_V6JQi4?e=yAcwVa)