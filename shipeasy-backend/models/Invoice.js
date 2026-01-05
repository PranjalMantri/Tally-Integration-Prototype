import mongoose from "mongoose"

const invoiceSchema = new mongoose.Schema({
  invoiceId: {
    type: String,
    required: true,
    unique: true
  },
  invoiceNo: {
    type: String,
    required: true
  },
  invoiceDate: {
    type: String,
    required: true
  },
  party: {
    name: {
      type: String,
      required: true
    }
  },
  items: [{
    ledgerName: {
      type: String,
      required: true
    },
    amount: {
      type: Number,
      required: true
    }
  }],
  taxes: {
    igst: {
      type: Number,
      default: 0
    },
    cgst: {
      type: Number,
      default: 0
    },
    sgst: {
      type: Number,
      default: 0
    }
  },
  narration: {
    type: String
  },
  status: {
    type: String,
    enum: ['PENDING', 'SUCCESS', 'FAILED'],
    default: 'PENDING'
  },
  type: {
    type: String,
    default: 'SALES'
  },
  tallyResponse: {
    type: Object
  }
}, {
  timestamps: true
});

export default mongoose.model('Invoice', invoiceSchema);
