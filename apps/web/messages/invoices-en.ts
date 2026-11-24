import type { invoicesBn } from "./invoices-bn.ts";

type Same<T> = { [K in keyof T]: T[K] extends string ? string : Same<T[K]> };

export const invoicesEn: Same<typeof invoicesBn> = {
  Invoices: {
    meta: { title: "Invoices" },
    heading: "Invoices",
    intro:
      "The invoice of every purchase and renewal is here. PanelPay sells, bills and supports the service.",
    list: {
      caption: "Your invoices",
      number: "Number",
      date: "Date",
      total: "Total",
      view: "View",
      older: "Older invoices",
      creditNote: "Credit note",
    },
    empty: {
      title: "No invoices yet",
      body: "After you buy your first server or service, its invoice appears here. The receipt of a wallet top-up is on the wallet page.",
      action: "Open the wallet",
    },
    detail: {
      back: "All invoices",
      title: "Invoice {number}",
      creditTitle: "Credit note {number}",
      number: "Number",
      date: "Date of issue",
      supplyDate: "Date of supply",
      originalNumber: "Original invoice number",
      originalDate: "Original invoice date",
      reason: "Reason",
      reasons: {
        refund: "Refund",
        plan_change_not_delivered: "Plan change not delivered",
        order_failed: "Order failed",
      },
      billedTo: "Billed to",
      noName: "No name given",
      address: "Address",
      taxIdBin: "BIN",
      notFound: {
        title: "This invoice was not found",
        body: "Check the link, or go back to the list of all invoices.",
      },
      lines: {
        caption: "Lines of the invoice",
        description: "Description",
        amount: "Amount",
        total: "Total",
      },
      print: "Print or save as PDF",
      downloadPdf: "Download PDF",
      downloadHint: "The PDF is made when you click. It can take a few seconds.",
      pdfNotice: {
        unavailable:
          "The PDF could not be made now. Please try again in a moment, or print the invoice instead.",
        not_ready:
          "The PDF is not ready to download. Please print the invoice instead, or write to support.",
        busy: "Too many PDF requests. Please wait a minute and try again.",
      },
      printHint:
        "The invoice opens on a new page. There, choose “Save as PDF” in the print dialog of your browser.",
      unavailable: {
        title: "This invoice cannot be shown now",
        body: "The lines did not add up to the total, so we stopped instead of showing a wrong amount. Write to support.",
        action: "Write to support",
      },
      mushakHint:
        "The invoice is printed in the Tax Invoice form (Mushak-6.3) of the National Board of Revenue, with the seller's legal name, BIN and address.",
      creditHint:
        "The credit note is printed in the Credit Note form (Mushak-6.7) of the National Board of Revenue. It reverses the original invoice in full and keeps the seller and buyer details of that invoice exactly.",
      sellerMissing: {
        title: "Your invoice is being prepared",
        body: "The seller details for the tax invoice are not complete yet, so we do not show the invoice now. Try again in a little while, or write to support.",
        action: "Write to support",
      },
    },
  },
};
