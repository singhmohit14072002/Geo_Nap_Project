"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateReport = void 0;
const exceljs_1 = __importDefault(require("exceljs"));
const jszip_1 = __importDefault(require("jszip"));
const pdfkit_1 = __importDefault(require("pdfkit"));
const http_error_util_1 = require("../utils/http-error.util");
const toInr = (value) => {
    return `INR ${value.toFixed(2)}`;
};
const toDate = (value) => {
    if (!value) {
        return new Date();
    }
    if (value instanceof Date) {
        return value;
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        return new Date();
    }
    return parsed;
};
const normalizeResults = (results) => {
    if (!Array.isArray(results) || results.length === 0) {
        throw new http_error_util_1.HttpError(422, "No estimate results available for report generation");
    }
    return results;
};
const renderPdfHeader = (doc, input) => {
    doc.fontSize(18).font("Helvetica-Bold").text("Multi-Cloud Cost Estimation Report");
    doc.moveDown(0.5);
    doc.fontSize(10).font("Helvetica").text(`Generated at: ${new Date().toISOString()}`);
    doc.text(`Job ID: ${input.jobId}`);
    doc.text(`Requested region: ${input.region}`);
    doc.moveDown();
};
const renderPdfSummary = (doc, input) => {
    doc.fontSize(13).font("Helvetica-Bold").text("Comparison Summary");
    doc.moveDown(0.4);
    doc.fontSize(9).font("Helvetica-Bold");
    doc.text("Provider", 50, doc.y);
    doc.text("Region", 120, doc.y);
    doc.text("Monthly", 230, doc.y);
    doc.text("Yearly", 320, doc.y);
    doc.text("Pricing Version", 430, doc.y);
    doc.moveDown(0.5);
    doc.font("Helvetica").fontSize(9);
    input.results.forEach((row) => {
        const y = doc.y;
        doc.text(row.provider.toUpperCase(), 50, y);
        doc.text(row.region, 120, y);
        doc.text(toInr(row.summary.monthlyTotal), 230, y);
        doc.text(toInr(row.summary.yearlyTotal), 320, y);
        doc.text(row.pricingVersion, 430, y);
        doc.moveDown(0.4);
    });
    doc.moveDown();
};
const renderProviderBreakdown = (doc, result) => {
    doc.fontSize(12).font("Helvetica-Bold").text(`${result.provider.toUpperCase()} Breakdown`);
    doc.moveDown(0.2);
    doc.fontSize(9).font("Helvetica");
    doc.text(`Region: ${result.region}`);
    doc.text(`Calculated at: ${toDate(result.calculatedAt).toISOString()}`);
    doc.text(`Pricing version: ${result.pricingVersion}`);
    doc.moveDown(0.3);
    doc.text(`Compute: ${toInr(result.breakdown.compute)}`);
    doc.text(`Storage: ${toInr(result.breakdown.storage)}`);
    doc.text(`Database: ${toInr(result.breakdown.database)}`);
    doc.text(`Backup: ${toInr(result.breakdown.backup)}`);
    doc.text(`Network egress: ${toInr(result.breakdown.networkEgress)}`);
    doc.text(`Other: ${toInr(result.breakdown.other)}`);
    doc.font("Helvetica-Bold").text(`Total monthly: ${toInr(result.summary.monthlyTotal)}`);
    doc.moveDown(0.2);
    doc.font("Helvetica").text("Service details:");
    result.details.forEach((item) => {
        doc.text(`- ${item.serviceType}: ${item.name} | SKU: ${item.sku ?? "-"} | Qty: ${item.quantity} | Monthly: ${toInr(item.monthlyCost)}`);
    });
    if (result.optimization?.recommendations?.length) {
        doc.moveDown(0.3);
        doc.font("Helvetica-Bold").text("Optimization recommendations:");
        doc.font("Helvetica");
        result.optimization.recommendations.forEach((rec) => {
            doc.text(`- [${rec.type}] ${rec.message} | Estimated monthly savings: ${toInr(rec.estimatedMonthlySavings)}`);
        });
    }
    doc.moveDown();
};
const renderAssumptions = (doc, input) => {
    doc.fontSize(13).font("Helvetica-Bold").text("Assumptions");
    doc.moveDown(0.4);
    doc.fontSize(9).font("Helvetica");
    doc.text("- Report uses stored estimation results only (no recalculation).");
    doc.text("- Pricing shown is deterministic and based on recorded provider pricing version.");
    doc.text("- Costs are represented in INR and include monthly/yearly rollups.");
    doc.text("- Network egress reflects outbound data transfer assumptions from input.");
    doc.text(`- Providers included: ${input.results.map((item) => item.provider.toUpperCase()).join(", ")}.`);
};
const generatePdfBuffer = async (input) => {
    return new Promise((resolve, reject) => {
        const doc = new pdfkit_1.default({
            margin: 40,
            size: "A4"
        });
        const chunks = [];
        doc.on("data", (chunk) => chunks.push(chunk));
        doc.on("end", () => resolve(Buffer.concat(chunks)));
        doc.on("error", (err) => reject(err));
        renderPdfHeader(doc, input);
        renderPdfSummary(doc, input);
        input.results.forEach((result) => {
            renderProviderBreakdown(doc, result);
        });
        renderAssumptions(doc, input);
        doc.end();
    });
};
const autoFitColumns = (sheet) => {
    sheet.columns?.forEach((column) => {
        let maxLength = 10;
        if (typeof column.eachCell !== "function") {
            return;
        }
        column.eachCell({ includeEmpty: true }, (cell) => {
            const value = cell.value;
            const str = value == null ? "" : String(value);
            maxLength = Math.max(maxLength, str.length + 2);
        });
        column.width = Math.min(maxLength, 60);
    });
};
const generateExcelBuffer = async (input) => {
    const workbook = new exceljs_1.default.Workbook();
    workbook.creator = "Geo-NAP";
    workbook.created = new Date();
    const summary = workbook.addWorksheet("Summary");
    summary.addRow(["Multi-Cloud Cost Estimation Report"]);
    summary.addRow([`Generated at: ${new Date().toISOString()}`]);
    summary.addRow([`Job ID: ${input.jobId}`]);
    summary.addRow([`Requested region: ${input.region}`]);
    summary.addRow([]);
    summary.addRow([
        "Provider",
        "Region",
        "Monthly Cost (INR)",
        "Yearly Cost (INR)",
        "Pricing Version",
        "Potential Savings (INR/month)",
        "Calculated At"
    ]);
    input.results.forEach((row) => {
        const potentialSavings = row.optimization?.recommendations?.reduce((sum, item) => sum + item.estimatedMonthlySavings, 0) ?? 0;
        summary.addRow([
            row.provider.toUpperCase(),
            row.region,
            row.summary.monthlyTotal,
            row.summary.yearlyTotal,
            row.pricingVersion,
            potentialSavings,
            toDate(row.calculatedAt).toISOString()
        ]);
    });
    summary.getRow(6).font = { bold: true };
    autoFitColumns(summary);
    input.results.forEach((provider) => {
        const sheetNameBase = `${provider.provider.toUpperCase()} Details`;
        const sheetName = sheetNameBase.slice(0, 31);
        const ws = workbook.addWorksheet(sheetName);
        ws.addRow([`Provider: ${provider.provider.toUpperCase()}`]);
        ws.addRow([`Region: ${provider.region}`]);
        ws.addRow([`Pricing version: ${provider.pricingVersion}`]);
        ws.addRow([]);
        ws.addRow(["Service Type", "Name", "SKU", "Quantity", "Unit Price", "Monthly Cost"]);
        provider.details.forEach((item) => {
            ws.addRow([
                item.serviceType,
                item.name,
                item.sku ?? "",
                item.quantity,
                item.unitPrice ?? "",
                item.monthlyCost
            ]);
        });
        ws.addRow([]);
        ws.addRow(["Breakdown Component", "Cost (INR)"]);
        ws.addRow(["Compute", provider.breakdown.compute]);
        ws.addRow(["Storage", provider.breakdown.storage]);
        ws.addRow(["Database", provider.breakdown.database]);
        ws.addRow(["Backup", provider.breakdown.backup]);
        ws.addRow(["Network Egress", provider.breakdown.networkEgress]);
        ws.addRow(["Other", provider.breakdown.other]);
        ws.addRow(["Total Monthly", provider.summary.monthlyTotal]);
        ws.addRow(["Total Yearly", provider.summary.yearlyTotal]);
        if (provider.optimization?.recommendations?.length) {
            ws.addRow([]);
            ws.addRow([
                "Optimization Type",
                "Message",
                "Estimated Savings (INR/month)"
            ]);
            provider.optimization.recommendations.forEach((rec) => {
                ws.addRow([rec.type, rec.message, rec.estimatedMonthlySavings]);
            });
        }
        ws.getRow(5).font = { bold: true };
        autoFitColumns(ws);
    });
    const output = await workbook.xlsx.writeBuffer();
    return Buffer.isBuffer(output) ? output : Buffer.from(output);
};
const generateZipBuffer = async (input, pdf, xlsx) => {
    const zip = new jszip_1.default();
    zip.file(`geo-nap-estimate-${input.jobId}.pdf`, pdf);
    zip.file(`geo-nap-estimate-${input.jobId}.xlsx`, xlsx);
    return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
};
const generateReport = async (input, format) => {
    const normalizedInput = {
        ...input,
        results: normalizeResults(input.results)
    };
    if (format === "pdf") {
        const pdfBuffer = await generatePdfBuffer(normalizedInput);
        return {
            fileName: `geo-nap-estimate-${normalizedInput.jobId}.pdf`,
            mimeType: "application/pdf",
            buffer: pdfBuffer
        };
    }
    if (format === "xlsx") {
        const excelBuffer = await generateExcelBuffer(normalizedInput);
        return {
            fileName: `geo-nap-estimate-${normalizedInput.jobId}.xlsx`,
            mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            buffer: excelBuffer
        };
    }
    const [pdfBuffer, excelBuffer] = await Promise.all([
        generatePdfBuffer(normalizedInput),
        generateExcelBuffer(normalizedInput)
    ]);
    const zipBuffer = await generateZipBuffer(normalizedInput, pdfBuffer, excelBuffer);
    return {
        fileName: `geo-nap-estimate-${normalizedInput.jobId}-report.zip`,
        mimeType: "application/zip",
        buffer: zipBuffer
    };
};
exports.generateReport = generateReport;
