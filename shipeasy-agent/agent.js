const fs = require('fs');
const path = require('path');

// 1. Setup logging immediately to catch startup errors
function logErrorToFile(error) {
    const logPath = path.join(process.cwd(), 'error_log.txt');
    const timestamp = new Date().toISOString();
    const errorMessage = `\n[${timestamp}] CRITICAL ERROR:\n${error.stack || error}\n--------------------------\n`;
    
    try {
        fs.appendFileSync(logPath, errorMessage);
    } catch (e) {
        console.error("Failed to write to log file:", e);
    }
}

// Prevent the window from closing immediately on error
function keepAlive() {
    console.log("\n[Process will stay alive for debugging. Press Ctrl+C to exit]");
    setInterval(() => {}, 1000 * 60 * 60);
}

process.on('uncaughtException', (err) => {
    logErrorToFile(err);
    console.error('\n❌ CRITICAL ERROR (Uncaught Exception):', err);
    keepAlive();
});

process.on('unhandledRejection', (reason, promise) => {
    logErrorToFile(reason);
    console.error('\n❌ CRITICAL ERROR (Unhandled Rejection):', reason);
    keepAlive();
});

const xml2js = require("xml2js");
const config = require("./config.js");

const BACKEND_URL = config.backend_url
const TALLY_URL = config.tally_url
const TALLY_COMPANY = config.tally_company
const TALLY_AGENT_KEY = config.tally_agent_key

// Helper to sanitize XML characters
const escapeXml = (unsafe) => {
  if (!unsafe) return "";
  return unsafe.toString().replace(/[<>&'"]/g, function (c) {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
    }
  });
};


const TallyTemplates = {
  createLedger: (company, name, group) => `
    <ENVELOPE>
      <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
      <BODY>
        <IMPORTDATA>
          <REQUESTDESC>
            <REPORTNAME>All Masters</REPORTNAME>
            <STATICVARIABLES><SVCURRENTCOMPANY>${escapeXml(company)}</SVCURRENTCOMPANY></STATICVARIABLES>
          </REQUESTDESC>
          <REQUESTDATA>
            <TALLYMESSAGE xmlns:UDF="TallyUDF">
              <LEDGER NAME="${escapeXml(name)}" ACTION="Create">
                <NAME.LIST><NAME>${escapeXml(name)}</NAME></NAME.LIST>
                <PARENT>${escapeXml(group)}</PARENT>
                <ISBILLWISEON>No</ISBILLWISEON>
                <AFFECTSSTOCK>No</AFFECTSSTOCK>
              </LEDGER>
            </TALLYMESSAGE>
          </REQUESTDATA>
        </IMPORTDATA>
      </BODY>
    </ENVELOPE>`,

  // Complex Sales Voucher (Handles Items + Taxes)
  createSalesVoucher: (company, p) => {
    // 1. Calculate Total Amount (Items + Taxes)
    let totalAmount = 0;
    if (p.items) p.items.forEach(item => totalAmount += (item.amount || 0));
    if (p.taxes) Object.values(p.taxes).forEach(tax => totalAmount += (tax || 0));
    totalAmount = parseFloat(totalAmount.toFixed(2));

    // 2. Generate Item XML Lines
    const itemEntries = (p.items || []).map(item => `
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${escapeXml(item.ledgerName)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${item.amount}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>`).join('');

    // 3. Generate Tax XML Lines
    const taxEntries = p.taxes ? Object.entries(p.taxes).map(([taxName, amount]) => `
        <ALLLEDGERENTRIES.LIST>
          <LEDGERNAME>${escapeXml(taxName)}</LEDGERNAME>
          <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
          <AMOUNT>${amount}</AMOUNT>
        </ALLLEDGERENTRIES.LIST>`).join('') : '';

    return `
    <ENVELOPE>
      <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
      <BODY>
        <IMPORTDATA>
          <REQUESTDESC>
            <REPORTNAME>Vouchers</REPORTNAME>
            <STATICVARIABLES><SVCURRENTCOMPANY>${escapeXml(company)}</SVCURRENTCOMPANY></STATICVARIABLES>
          </REQUESTDESC>
          <REQUESTDATA>
            <TALLYMESSAGE xmlns:UDF="TallyUDF">
              <VOUCHER REMOTEID="${escapeXml(p.invoiceId)}" VCHTYPE="Sales" ACTION="Alter">
                <GUID>${escapeXml(p.invoiceId)}</GUID>
                <DATE>${p.invoiceDate}</DATE>
                <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
                <VOUCHERNUMBER>${escapeXml(p.invoiceNo)}</VOUCHERNUMBER>
                <PARTYLEDGERNAME>${escapeXml(p.party.name)}</PARTYLEDGERNAME>
                <NARRATION>${escapeXml(p.narration)}</NARRATION>
                <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
                
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>${escapeXml(p.party.name)}</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE> 
                  <AMOUNT>-${totalAmount}</AMOUNT>
                </ALLLEDGERENTRIES.LIST>

                ${itemEntries}

                ${taxEntries}

              </VOUCHER>
            </TALLYMESSAGE>
          </REQUESTDATA>
        </IMPORTDATA>
      </BODY>
    </ENVELOPE>`;
  }
};

class TallyService {
  constructor(url, companyName) {
    this.tallyUrl = url;
    this.company = companyName;
    this.parser = new xml2js.Parser({ explicitArray: false });
  }

  async isServerRunning() {
    try {
      const response = await fetch(this.tallyUrl, { signal: AbortSignal.timeout(2000) });
      const text = await response.text();
      return typeof text === 'string' && text.trim() === "<RESPONSE>TallyPrime Server is Running</RESPONSE>";
    } catch (e) {
      return false;
    }
  }

  async _sendRequest(xmlPayload) {
    try {
      const response = await fetch(this.tallyUrl, {
        method: 'POST',
        headers: { "Content-Type": "text/xml" },
        body: xmlPayload
      });
      const text = await response.text();
      return await this.parser.parseStringPromise(text);
    } catch (error) {
      console.error("Tally Connection Error:", error.message);
      return null;
    }
  }

  async createLedger(name, group) {
    const xml = TallyTemplates.createLedger(this.company, name, group);
    const response = await this._sendRequest(xml);
    return this._checkResponseStatus(response, `Ledger [${name}]`);
  }

  async createInvoice(payload) {
    const xml = TallyTemplates.createSalesVoucher(this.company, payload);
    const response = await this._sendRequest(xml);
    return this._checkResponseStatus(response, `Voucher [${payload.invoiceNo}]`);
  }

  _checkResponseStatus(jsonResponse, context) {
    if (!jsonResponse) return { success: false, message: "No response from Tally" };
    
    const str = JSON.stringify(jsonResponse);

    // Tally returns "CREATED: 1" for success, or "CREATED: 0" + "ERRORS: 0" for duplicates
    if (str.includes('"CREATED":"1"') || (str.includes('"CREATED":"0"') && str.includes('"ERRORS":"0"'))) {
      return { success: true, message: "Success" };
    }
    
    let errorMsg = "Tally rejected data";
    try {
       // Try to find the specific error line in deep JSON
       const result = jsonResponse?.ENVELOPE?.BODY?.IMPORTDATA?.IMPORTRESULT;
       if (result) {
         if (result.LINEERROR) {
            errorMsg = Array.isArray(result.LINEERROR) ? result.LINEERROR.join("; ") : result.LINEERROR;
         } else if (result.JHERROR) {
            errorMsg = "System Error: " + (Array.isArray(result.JHERROR) ? result.JHERROR.join("; ") : result.JHERROR);
         }
       }
    } catch (e) {}

    console.error(`❌ Failed - ${context}: ${errorMsg}`);
    console.log(`🔍 Full Tally Verification Response:`, JSON.stringify(jsonResponse, null, 2));

    return { success: false, message: errorMsg };
  }
}

const startPolling = async () => {
  const tally = new TallyService(TALLY_URL, TALLY_COMPANY);
  console.log(`[AGENT] Started polling ${BACKEND_URL} every ${config.polling_interval / 1000} seconds...`);

  setInterval(async () => {
    try {
      const isTallyRunning = await tally.isServerRunning();
      if (!isTallyRunning) {
        console.log("[AGENT] Tally Server is not running or unreachable. Waiting...");
        return;
      }

      const response = await fetch(`${BACKEND_URL}/api/sync/pending`, {
        headers: { 'x-tally-agent-key': TALLY_AGENT_KEY }
      });
      
      if (!response.ok) {
        throw new Error(`Backend returned ${response.status} ${response.statusText}`);
      }

      const pendingItems = await response.json();
      
      if (!Array.isArray(pendingItems) || pendingItems.length === 0) return;

      console.log(`[AGENT] Found ${pendingItems.length} pending items.`);

      for (const item of pendingItems) {
        console.log(`\n[AGENT] Processing DB ID: ${item.id}...`);

        const rawData = item.data; 
        
        if (!rawData) {
           console.error("   -> ❌ Invalid Data Structure (Missing payload)");
           await reportStatus(item.id, "FAILED", "Invalid Data Structure");
           continue;
        }

        let mastersFailed = false;

        // 1. Party Ledger
        const partyRes = await tally.createLedger(rawData.party.name, "Sundry Debtors");
        if (!partyRes.success) mastersFailed = true;

        // 2. Item Ledgers
        if (rawData.items) {
          for (const i of rawData.items) {
            const itemRes = await tally.createLedger(i.ledgerName, "Sales Accounts");
            if (!itemRes.success) mastersFailed = true;
          }
        }

        // 3. Tax Ledgers
        if (rawData.taxes) {
          for (const taxName of Object.keys(rawData.taxes)) {
            const taxRes = await tally.createLedger(taxName, "Duties & Taxes");
            if (!taxRes.success) mastersFailed = true;
          }
        }

        if (mastersFailed) {
            await reportStatus(item.id, "FAILED", "One or more Master Ledgers failed to create.");
            continue; 
        }

        console.log(`   -> Creating Voucher ${rawData.invoiceNo}...`);
        
        // Small delay to let Tally index new ledgers
        await new Promise(r => setTimeout(r, 500)); 

        const voucherRes = await tally.createInvoice(rawData);
        const status = voucherRes.success ? "SUCCESS" : "FAILED";

        console.log(`   -> Result: ${status}`);
        await reportStatus(item.id, status, voucherRes.message);
      }

    } catch (error) {
      const isConnectionError = error.cause?.code === 'ECONNREFUSED' || error.message.includes('fetch failed');
      
      if (!isConnectionError) {
        console.error("[AGENT] Error:", error.message);
      } else {
        // Silent fail on connection refused to avoid console spam if server is down
      }
    }
  }, config.polling_interval);
};

async function reportStatus(id, status, message) {
    try {
        await fetch(`${BACKEND_URL}/api/sync/status`, {
            method: 'POST',
            body: JSON.stringify({
                id, 
                status, 
                tallyResponse: typeof message === 'string' ? message : JSON.stringify(message)
            }),
            headers: { 
                'Content-Type': 'application/json',
                'x-tally-agent-key': TALLY_AGENT_KEY 
            }
        });
    } catch(e) { 
        console.error("   -> ⚠️ Failed to report status to backend:", e.message); 
    }
}

startPolling();