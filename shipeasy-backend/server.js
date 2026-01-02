const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const app = express();
const PORT = 3000; 

// Middleware
app.use(cors()); 
app.use(express.json());


let transactions = [];

app.post('/api/invoices', (req, res) => {
    const newInvoice = {
        id: uuidv4(),
        type: req.body.type || 'SALES',
        status: 'PENDING',
        createdAt: new Date(),
        data: req.body.payload
    };

    transactions.push(newInvoice);
    console.log(`[CLOUD] New Invoice Added: ${newInvoice.id}`);
    res.json({ message: "Invoice queued for sync", id: newInvoice.id });
});

app.get('/api/sync/pending', (req, res) => {
    const pendingItems = transactions.filter(item => item.status === 'PENDING');
    
    if (pendingItems.length > 0) {
        console.log(`[CLOUD] Agent requested work. Sending ${pendingItems.length} items.`);
    }
    
    res.json(pendingItems);
});

app.post('/api/sync/status', (req, res) => {
    const { id, status, tallyResponse } = req.body;

    const item = transactions.find(i => i.id === id);
    if (!item) {
        return res.status(404).json({ error: "Item not found" });
    }

    item.status = status; 
    item.tallyResponse = tallyResponse;

    console.log(`[CLOUD] Item ${id} marked as ${status}`);
    res.json({ success: true });
});

app.get('/api/debug', (req, res) => {
    res.json(transactions);
});

app.listen(PORT, () => {
    console.log(`
    ShippEasy Cloud Backend running on http://localhost:${PORT}
    ----------------------------------------------------------
    1. Add Invoice:   POST /api/invoices
    2. Poll Pending:  GET  /api/sync/pending
    3. Update Status: POST /api/sync/status
    `);
});