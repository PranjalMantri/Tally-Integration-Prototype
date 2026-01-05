const axios = require("axios");
const xml2js = require("xml2js");

const BACKEND_URL = "http://localhost:3000";
const TALLY_URL = "http://localhost:9000";
const TALLY_COMPANY = "Test Company";

// XML Templates for Tally Interactions
const TallyTemplates = {
  createLedger: (company, name, group = "Sundry Debtors") => `
    <ENVELOPE>
      <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
      <BODY>
        <IMPORTDATA>
          <REQUESTDESC>
            <REPORTNAME>All Masters</REPORTNAME>
            <STATICVARIABLES><SVCURRENTCOMPANY>${company}</SVCURRENTCOMPANY></STATICVARIABLES>
          </REQUESTDESC>
          <REQUESTDATA>
            <TALLYMESSAGE xmlns:UDF="TallyUDF">
              <LEDGER NAME="${name}" ACTION="Create">
                <NAME.LIST><NAME>${name}</NAME></NAME.LIST>
                <PARENT>${group}</PARENT>
              </LEDGER>
            </TALLYMESSAGE>
          </REQUESTDATA>
        </IMPORTDATA>
      </BODY>
    </ENVELOPE>`,

  createVoucher: (company, partyName, amount, date, type = "Receipt") => `
    <ENVELOPE>
      <HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
      <BODY>
        <IMPORTDATA>
          <REQUESTDESC>
            <REPORTNAME>Vouchers</REPORTNAME>
            <STATICVARIABLES><SVCURRENTCOMPANY>${company}</SVCURRENTCOMPANY></STATICVARIABLES>
          </REQUESTDESC>
          <REQUESTDATA>
            <TALLYMESSAGE xmlns:UDF="TallyUDF">
              <VOUCHER VCHTYPE="${type}" ACTION="Create" OBJVIEW="Accounting Voucher View">
                <DATE>${date}</DATE>
                <NARRATION>API Integrated Transaction</NARRATION>
                <VOUCHERTYPENAME>${type}</VOUCHERTYPENAME>
                <PARTYLEDGERNAME>${partyName}</PARTYLEDGERNAME>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>${partyName}</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                  <AMOUNT>${amount}</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
                <ALLLEDGERENTRIES.LIST>
                  <LEDGERNAME>Cash</LEDGERNAME>
                  <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                  <AMOUNT>-${amount}</AMOUNT>
                </ALLLEDGERENTRIES.LIST>
              </VOUCHER>
            </TALLYMESSAGE>
          </REQUESTDATA>
        </IMPORTDATA>
      </BODY>
    </ENVELOPE>`,

  getLedgers: (company) => `
    <ENVELOPE>
      <HEADER><TALLYREQUEST>Export Data</TALLYREQUEST></HEADER>
      <BODY>
        <EXPORTDATA>
          <REQUESTDESC>
            <REPORTNAME>List of Accounts</REPORTNAME>
            <STATICVARIABLES>
              <SVCURRENTCOMPANY>${company}</SVCURRENTCOMPANY>
              <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            </STATICVARIABLES>
          </REQUESTDESC>
        </EXPORTDATA>
      </BODY>
    </ENVELOPE>`
};

class TallyService {
  constructor(url, companyName) {
    this.tallyUrl = url;
    this.company = companyName;
    this.parser = new xml2js.Parser({ explicitArray: false });
  }

  async _sendRequest(xmlPayload) {
    try {
      const response = await axios.post(this.tallyUrl, xmlPayload, {
        headers: { "Content-Type": "text/xml" }
      });
      return await this.parser.parseStringPromise(response.data);
    } catch (error) {
      console.error("Tally Communication Error:", error.message);
      return null;
    }
  }

  async createLedger(name, group) {
    const xml = TallyTemplates.createLedger(this.company, name, group);
    const response = await this._sendRequest(xml);
    return this._checkResponseStatus(response);
  }

  async createReceipt(partyName, amount, date) {
    const xml = TallyTemplates.createVoucher(this.company, partyName, amount, date, "Receipt");
    const response = await this._sendRequest(xml);
    return this._checkResponseStatus(response);
  }

  _checkResponseStatus(jsonResponse) {
    if (!jsonResponse) return { success: false, message: "No response from Tally" };
    
    const responseData = JSON.stringify(jsonResponse);
    // Check for Success (Created:1) or No Change (Created:0, Errors:0)
    if (responseData.includes('"CREATED":"1"') || (responseData.includes('"CREATED":"0"') && responseData.includes('"ERRORS":"0"'))) {
      return { success: true, message: "Success" };
    }
    
    return { success: false, message: JSON.stringify(jsonResponse) };
  }
}

const startPolling = async () => {
  const tally = new TallyService(TALLY_URL, TALLY_COMPANY);
  console.log(`[AGENT] Started polling ${BACKEND_URL} every 5 seconds...`);
  console.log(`[AGENT] Target Tally Company: ${TALLY_COMPANY}`);

  setInterval(async () => {
    try {
      // 1. Fetch Pending
      const { data: pendingItems } = await axios.get(`${BACKEND_URL}/api/sync/pending`);
      
      if (!Array.isArray(pendingItems) || pendingItems.length === 0) return;

      console.log(`[AGENT] Found ${pendingItems.length} pending items.`);

      for (const item of pendingItems) {
        console.log(`[AGENT] Processing Invoice ID: ${item.id}...`);
        
        // Validate payload
        if (!item.data || !item.data.partyName || !item.data.amount) {
            console.error(`   -> Invalid Payload:`, item.data);
            await axios.post(`${BACKEND_URL}/api/sync/status`, {
                id: item.id,
                status: "FAILED",
                tallyResponse: "Invalid Payload: Missing partyName or amount"
            });
            continue;
        }

        const { partyName, amount, date} = item.data;

        // 2. Create Ledger (Idempotent)
        console.log(`   -> Checking Ledger: ${partyName}`);
        const ledgerRes = await tally.createLedger(partyName, "Sundry Debtors");
        
        if (!ledgerRes.success) {
             console.error(`   -> Ledger Error: ${ledgerRes.message}`);
        }

        // 3. Create Voucher
        console.log(`   -> Creating Voucher...`);
        const voucherRes = await tally.createReceipt(partyName, amount, date);
        
        // 4. Update Status
        const status = voucherRes.success ? "SYNCED" : "FAILED";
        await axios.post(`${BACKEND_URL}/api/sync/status`, {
            id: item.id,
            status: status,
            tallyResponse: voucherRes.message
        });
        
        console.log(`   -> Result: ${status}`);
      }

    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
          console.log("[AGENT] Backend unreachable...");
      } else {
          console.error("[AGENT] Polling Error:", error.message);
      }
    }
  }, 5000);
};

startPolling();