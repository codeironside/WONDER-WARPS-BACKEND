import Receipt from "../../../model/index.js";
import ErrorHandler from "../../../../../CORE/middleware/errorhandler/index.js";

const convertReceiptsToCSV = (receipts) => {
  const headers = [
    "Reference Code",
    "User Name",
    "User Email",
    "Book Title",
    "Child Name",
    "Amount",
    "Currency",
    "Payment Method",
    "Paid At",
    "Refunded",
    "Refund Amount",
    "Receipt URL",
  ];

  const csvRows = [headers.join(",")];

  receipts.forEach((receipt) => {
    const row = [
      `"${receipt.reference_code}"`,
      `"${receipt.user_details?.name || ""}"`,
      `"${receipt.user_details?.email || ""}"`,
      `"${receipt.book_details?.book_title || ""}"`,
      `"${receipt.book_details?.child_name || ""}"`,
      receipt.amount,
      receipt.currency,
      `"${receipt.payment_method || ""}"`,
      `"${receipt.paid_at.toISOString()}"`,
      receipt.refunded ? "Yes" : "No",
      receipt.refund_amount,
      `"${receipt.receipt_url}"`,
    ];
    csvRows.push(row.join(","));
  });

  return csvRows.join("\n");
};
