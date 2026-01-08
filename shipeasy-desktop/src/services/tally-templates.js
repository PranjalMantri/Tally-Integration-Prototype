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

module.exports = TallyTemplates;
