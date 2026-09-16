export const screenshotVerificationExample = {
  headers: [
    { name: "date", comment: "Date in dd-mm-yyyy HH:mm:ss format" },
    { name: "transaction-id", comment: "20 digit unique ID" },
    { name: "description", comment: "Any" },
    { name: "credit", comment: "Credit amount. Must be a valid number." },
    { name: "debit", comment: "Debit amount. Must be a valid number." },
  ],
  csvData: [
    [
      "25-07-2025 00:39:52",
      "01002859031100865993",
      "P2P Transfer to 097********;P2P Transfer from 959*********",
      "200,000.00",
      "-0.00",
    ],
    [
      "27-08-2025 10:25:20",
      "01002858082207555438",
      "Withdraw to Bank Account Fee to MM",
      "0.00",
      "-1,000.00",
    ],
  ],
};
