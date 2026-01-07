const EventEmitter = require('events');
const xml2js = require("xml2js");

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
  listCompanies: () => `
    <ENVELOPE>
    <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Collection</TYPE>
        <ID>List of Companies</ID>
    </HEADER>
    <BODY>
        <DESC>
        <STATICVARIABLES>
            <!-- you can tweak these based on what subset you want -->
            <SVIsSimpleCompany>No</SVIsSimpleCompany>
        </STATICVARIABLES>
        <TDL>
            <TDLMESSAGE>
            <COLLECTION NAME="List of Companies" ISINITIALIZE="Yes">
                <TYPE>Company</TYPE>
                <NATIVEMETHOD>Name</NATIVEMETHOD>
            </COLLECTION>
            </TDLMESSAGE>
        </TDL>
        </DESC>
    </BODY>
    </ENVELOPE>
`,

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

  checkVoucherExists: (company, remoteId) => `
    <ENVELOPE>
    <HEADER>
      <TALLYREQUEST>Export Data</TALLYREQUEST>
    </HEADER>

    <BODY>
      <EXPORTDATA>
        <REQUESTDESC>
          <REPORTNAME>VoucherRegister</REPORTNAME>
          <STATICVARIABLES>
            <SVCURRENTCOMPANY>${escapeXml(company)}</SVCURRENTCOMPANY>
            <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
          </STATICVARIABLES>
        </REQUESTDESC>

        <TDL>
          <TDLMESSAGE>

            <REPORT NAME="VoucherCheck">
              <FORMS>VoucherCheckForm</FORMS>
            </REPORT>

            <FORM NAME="VoucherCheckForm">
              <PARTS>VoucherCheckPart</PARTS>
            </FORM>

            <PART NAME="VoucherCheckPart">
              <LINES>VoucherCheckLine</LINES>
              <REPEAT>VoucherCheckLine : VoucherCheckCollection</REPEAT>
              <SCROLLED>Vertical</SCROLLED>
            </PART>

            <LINE NAME="VoucherCheckLine">
              <FIELDS>VoucherRemoteID</FIELDS>
            </LINE>

            <FIELD NAME="VoucherRemoteID">
              <SET>$RemoteID</SET>
              <XMLTAG>REMOTEID</XMLTAG>
            </FIELD>

            <COLLECTION NAME="VoucherCheckCollection">
              <TYPE>Voucher</TYPE>
              <FETCH>REMOTEID</FETCH>
              <FILTER>FilterByRemoteID</FILTER>
            </COLLECTION>

            <SYSTEM TYPE="Formulae" NAME="FilterByRemoteID">
              $RemoteID = "${escapeXml(remoteId)}"
            </SYSTEM>

          </TDLMESSAGE>
        </TDL>

        </EXPORTDATA>
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

class TallyAgent extends EventEmitter {
    constructor(config) {
        super();
        this.config = config || {};
        
        // Use provided config or fall back to defaults/file if needed
        // Assuming config is passed fully populated from the app
        this.tallyUrl = this.config.tally_url || "http://localhost:9000";
        this.company = this.config.tally_company || "Test Company";
        this.backendUrl = this.config.backend_url;
        this.agentKey = this.config.tally_agent_key;
        this.pollingInterval = this.config.polling_interval || 5000;
        
        this.parser = new xml2js.Parser({ explicitArray: false });
        this.isRunning = false;
        this.pollInterval = null;
    }

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        
        this.emitLog('info', 'Agent service started.');
        this.emitLog('info', `Targeting Tally Company: ${this.company}`);
        this.emitLog('info', `Syncing from Backend: ${this.backendUrl}`);

        this.poll(); // Run immediately
        this.pollInterval = setInterval(() => this.poll(), this.pollingInterval);
    }

    stop() {
        if (!this.isRunning) return;
        this.isRunning = false;
        if (this.pollInterval) clearInterval(this.pollInterval);
        this.pollInterval = null;
        this.emitLog('info', 'Agent service stopped.');
    }

    emitLog(type, message, detail = null) {
        // Structured log for the UI
        this.emit('log', {
            timestamp: new Date().toISOString(),
            type, // 'info', 'success', 'error', 'warning'
            message,
            detail
        });
    }

    async poll() {
        try {
            const isTallyRunning = await this.isServerRunning();
            
            // Emit connection status (Tally: Boolean, Backend: Unknown yet)
            this.emit('connection-status', { tally: isTallyRunning });

            if (!isTallyRunning) {
                this.emitLog('warning', "Tally Server is not reachable. Is Tally Open?");
                return;
            }

            const response = await fetch(`${this.backendUrl}/api/sync/pending`, {
                headers: { 'x-tally-agent-key': this.agentKey }
            });

            this.emit('connection-status', { tally: true, backend: response.ok });
            
            if (!response.ok) {
                this.emitLog('error', `Backend Connection Failed: ${response.statusText}`);
                return;
            }

            const pendingItems = await response.json();
            
            if (!Array.isArray(pendingItems) || pendingItems.length === 0) return;

            this.emitLog('info', `Found ${pendingItems.length} new invoices to sync.`);

            for (const item of pendingItems) {
                await this.processItem(item);
            }

        } catch (error) {
            const isConnectionError = error.cause?.code === 'ECONNREFUSED' || error.message.includes('fetch failed');
            if (isConnectionError) {
                this.emitLog('debug', 'Connection refused (Backend/Tally)'); 
            } else {
                this.emitLog('error', `Critical Error: ${error.message}`, error.stack);
            }
        }
    }

    async processItem(item) {
        const rawData = item.data;
        const invoiceRef = rawData?.invoiceNo || `ID-${item.id}`;

        this.emitLog('info', `Processing Invoice #${invoiceRef}...`);

        if (!rawData) {
           await this.reportStatus(item.id, "FAILED", "Invalid Data Structure");
           this.emitLog('error', `Invoice #${invoiceRef} Failed: Invalid Data`);
           return;
        }

        let mastersFailed = false;

        // 1. Party Ledger
        const partyRes = await this.createLedger(rawData.party.name, "Sundry Debtors");
        if (!partyRes.success) {
            mastersFailed = true;
            this.emitLog('error', `Failed to create Party Ledger '${rawData.party.name}'`, partyRes.message);
        }

        // 2. Item Ledgers
        if (rawData.items) {
          for (const i of rawData.items) {
            const itemRes = await this.createLedger(i.ledgerName, "Sales Accounts");
            if (!itemRes.success) {
                mastersFailed = true;
                this.emitLog('error', `Failed to create Item Ledger '${i.ledgerName}'`, itemRes.message);
            }
          }
        }

        // 3. Tax Ledgers
        if (rawData.taxes) {
          for (const taxName of Object.keys(rawData.taxes)) {
            const taxRes = await this.createLedger(taxName, "Duties & Taxes");
            if (!taxRes.success) {
                mastersFailed = true;
                this.emitLog('error', `Failed to create Tax Ledger '${taxName}'`, taxRes.message);
            }
          }
        }

        if (mastersFailed) {
            await this.reportStatus(item.id, "FAILED", "Master Ledger Creation Failed");
            this.emitLog('error', `Invoice #${invoiceRef} Failed: Could not create required Ledgers.`);
            return; 
        }

        // Small delay to let Tally index new ledgers
        await new Promise(r => setTimeout(r, 500)); 

        const voucherRes = await this.createInvoice(rawData);
        
        let status = "FAILED";
        let message = voucherRes.message;

        if (voucherRes.success) {
             this.emitLog('info', `Verifying Invoice #${invoiceRef} in Tally...`);
             // Wait briefly for Tally to index
             await new Promise(r => setTimeout(r, 1000));
             
             const exists = await this.checkVoucherExists(rawData.invoiceId);
             if (exists) {
                 status = "SUCCESS";
                 message = "Verified: Created Successfully";
                 this.emitLog('success', `Invoice #${invoiceRef} successfully synced to Tally.`);
             } else {
                 status = "FAILED";
                 message = "Verification Failed: Voucher not found in Tally after creation.";
                 this.emitLog('error', `Invoice #${invoiceRef} creation failed verification.`, message);
             }
        } else {
             this.emitLog('error', `Invoice #${invoiceRef} rejected by Tally.`, message);
        }

        await this.reportStatus(item.id, status, message);
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

    async getCompanies() {
        this.emitLog('info', 'Fetching company list from Tally...');
        try {
            const xml = TallyTemplates.listCompanies();
            const response = await this._sendRequest(xml);
            
            // Handle Data from Native Collection (DATA) or Legacy Report (EXPORTDATA)
            const body = response?.ENVELOPE?.BODY;
            const dataRoot = body?.DATA || body?.EXPORTDATA;

            if (!dataRoot) {
                this.emitLog('warning', 'Received response with no data from Tally.');
                this.emitLog('debug', `Response: ${JSON.stringify(response)}`);
                return [];
            }

            let companies = [];

            // 1. Native Collection Export (from "List of Companies")
            if (dataRoot.COLLECTION && dataRoot.COLLECTION.COMPANY) {
                const list = Array.isArray(dataRoot.COLLECTION.COMPANY) 
                    ? dataRoot.COLLECTION.COMPANY 
                    : [dataRoot.COLLECTION.COMPANY];
                
                companies = list.map(c => {
                    // Extract name from various XML2JS shapes
                    // Shape A: <NAME>Test Company</NAME>  => c.NAME
                    // Shape B: <NAME TYPE="String">Test</NAME> => c.NAME._
                    // Shape C: <COMPANY NAME="Test" ...> => c.$.NAME
                    if (c.$ && c.$.NAME) return c.$.NAME;
                    if (c.NAME && c.NAME._) return c.NAME._;
                    if (typeof c.NAME === 'string') return c.NAME;
                    return null;
                }).filter(Boolean);
            } 
            // 2. Fallback: Recursive search (if using custom TDL with COMPANYNAME tag)
            else {
                 const findKeys = (obj, key, list = []) => {
                    if (!obj) return list;
                    if (Array.isArray(obj)) {
                        obj.forEach(i => findKeys(i, key, list));
                        return list;
                    }
                    if (typeof obj === 'object') {
                        for (const k in obj) {
                            if (k === key) list.push(obj[k]);
                            else findKeys(obj[k], key, list);
                        }
                    }
                    return list;
                };
                companies = findKeys(response, 'COMPANYNAME');
            }

            const uniqueNames = [...new Set(companies)].sort();
            return uniqueNames;

        } catch (e) {
            this.emitLog('error', `Failed to fetch companies: ${e.message}`);
            return [];
        }
    }

    setCompany(companyName) {
        this.company = companyName;
        this.emitLog('info', `Target Company switched to: ${companyName}`);
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

    async checkVoucherExists(remoteId) {
        try {
          const xml = TallyTemplates.checkVoucherExists(this.company, remoteId);
          const response = await this._sendRequest(xml);
          if (!response || !response.ENVELOPE) return false;
          
          const str = JSON.stringify(response);
          return str.includes(`"${remoteId}"`);
        } catch (e) {
          return false;
        }
    }

    async createInvoice(payload) {
        const xml = TallyTemplates.createSalesVoucher(this.company, payload);
        const response = await this._sendRequest(xml);
        return this._checkResponseStatus(response, `Voucher [${payload.invoiceNo}]`);
    }

    async reportStatus(id, status, message) {
        try {
            await fetch(`${this.backendUrl}/api/sync/status`, {
                method: 'POST',
                body: JSON.stringify({
                    id, 
                    status, 
                    tallyResponse: typeof message === 'string' ? message : JSON.stringify(message)
                }),
                headers: { 
                    'Content-Type': 'application/json',
                    'x-tally-agent-key': this.agentKey 
                }
            });
        } catch(e) { 
            this.emitLog('warning', `Failed to update status for item ${id} to backend.`);
        }
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
    
        return { success: false, message: errorMsg };
    }
}

module.exports = TallyAgent;