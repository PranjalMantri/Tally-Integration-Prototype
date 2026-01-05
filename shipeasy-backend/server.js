
import express from "express"
import cors from "cors"
import {v4 as uuidv4} from "uuid"
import dotenv from "dotenv"
import connectDB from "./config/db.js"
import Invoice from "./models/Invoice.js"
dotenv.config({quiet: true})

const PORT = 3000;
const app = express();

connectDB()

// Middleware
app.use(cors()); 
app.use(express.json());

app.post('/api/invoices', async (req, res) => {
    try {
        const invoiceData = req.body.payload || req.body;
        
        // If invoiceId is not provided, generate one
        if (!invoiceData.invoiceId) {
            invoiceData.invoiceId = uuidv4();
        }

        const newInvoice = new Invoice({
            ...invoiceData,
            type: req.body.type || 'SALES',
            status: 'PENDING'
        });

        await newInvoice.save();
        console.log(`[CLOUD] New Invoice Added: ${newInvoice.invoiceId}`);
        res.json({ message: "Invoice queued for sync", id: newInvoice.invoiceId });
    } catch (error) {
        console.error("Error adding invoice:", error);
        res.status(500).json({ error: "Failed to add invoice", details: error.message });
    }
});

app.get('/api/sync/pending', async (req, res) => {
    try {
        const pendingItems = await Invoice.find({ status: 'PENDING' });
        
        if (pendingItems.length > 0) {
            console.log(`[CLOUD] Agent requested work. Sending ${pendingItems.length} items.`);
        }
        
        // Transform to match expected format if necessary, or send as is
        // The agent might expect { id, data: ... } structure or just the invoice object
        // Based on previous code: { id, type, status, data }
        // Let's map it to be compatible with the agent's likely expectation if it was using the previous structure
        // Previous structure: { id, type, status, data: payload }
        
        const formattedItems = pendingItems.map(item => ({
            id: item.invoiceId,
            type: item.type,
            status: item.status,
            data: {
                invoiceId: item.invoiceId,
                invoiceNo: item.invoiceNo,
                invoiceDate: item.invoiceDate,
                party: item.party,
                items: item.items,
                taxes: item.taxes,
                narration: item.narration
            }
        }));
        
        res.json(formattedItems);
    } catch (error) {
        console.error("Error fetching pending items:", error);
        res.status(500).json({ error: "Failed to fetch pending items" });
    }
});

app.post('/api/sync/status', async (req, res) => {
    const { id, status, tallyResponse } = req.body;

    try {
        const item = await Invoice.findOne({ invoiceId: id });
        if (!item) {
            return res.status(404).json({ error: "Item not found" });
        }

        item.status = status; 
        item.tallyResponse = tallyResponse;
        await item.save();

        console.log(`[CLOUD] Item ${id} marked as ${status}`);
        res.json({ success: true });
    } catch (error) {
        console.error("Error updating status:", error);
        res.status(500).json({ error: "Failed to update status" });
    }
});

app.get('/api/debug', async (req, res) => {
    try {
        const invoices = await Invoice.find();
        res.json(invoices);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
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