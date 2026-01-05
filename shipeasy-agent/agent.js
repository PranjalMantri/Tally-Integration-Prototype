import axios from "axios";
import xml2js from "xml2js"
import config from "./config.js"

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
  // Generic Ledger Creator
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
              <VOUCHER VCHTYPE="Sales" ACTION="Create">
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
      const response = await axios.get(this.tallyUrl, { timeout: 2000 });
      return typeof response.data === 'string' && response.data.trim() === "<RESPONSE>TallyPrime Server is Running</RESPONSE>";
    } catch (e) {
      return false;
    }
  }

  async _sendRequest(xmlPayload) {
    try {
      const response = await axios.post(this.tallyUrl, xmlPayload, {
        headers: { "Content-Type": "text/xml" }
      });
      return await this.parser.parseStringPromise(response.data);
    } catch (error) {
      console.error("❌ Tally Connection Error:", error.message);
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
       if (result && result.LINEERROR) errorMsg = result.LINEERROR;
    } catch (e) {}

    console.error(`❌ Failed - ${context}: ${errorMsg}`);
    return { success: false, message: errorMsg };
  }
}

const startPolling = async () => {
  const tally = new TallyService(TALLY_URL, TALLY_COMPANY);
  console.log(`[AGENT] 🚀 Started polling ${BACKEND_URL} every ${config.polling_interval / 1000} seconds...`);

  setInterval(async () => {
    try {
      const isTallyRunning = await tally.isServerRunning();
      if (!isTallyRunning) {
        console.log("[AGENT] ⚠️ Tally Server is not running or unreachable. Waiting...");
        return;
      }

      const { data: pendingItems } = await axios.get(`${BACKEND_URL}/api/sync/pending`, {
        headers: { 'x-tally-agent-key': TALLY_AGENT_KEY }
      });
      
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
      if (error.code !== 'ECONNREFUSED') {
        console.error("[AGENT] Invalid API Key:", error.message);
      } else {
        // Silent fail on connection refused to avoid console spam if server is down
      }
    }
  }, config.polling_interval);
};

async function reportStatus(id, status, message) {
    try {
        await axios.post(`${BACKEND_URL}/api/sync/status`, {
            id, 
            status, 
            tallyResponse: typeof message === 'string' ? message : JSON.stringify(message)
        }, {
            headers: { 'x-tally-agent-key': TALLY_AGENT_KEY }
        });
    } catch(e) { 
        console.error("   -> ⚠️ Failed to report status to backend:", e.message); 
    }
}

startPolling();