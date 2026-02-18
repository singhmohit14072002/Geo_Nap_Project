"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseDocument = void 0;
const excel_parser_1 = require("../parsers/excel.parser");
const pdf_parser_1 = require("../parsers/pdf.parser");
const word_parser_1 = require("../parsers/word.parser");
const xml_parser_1 = require("../parsers/xml.parser");
const file_type_util_1 = require("../utils/file-type.util");
const parseDocument = async (file) => {
    const sourceType = (0, file_type_util_1.detectFileType)(file);
    switch (sourceType) {
        case "xml":
            return (0, xml_parser_1.parseXmlFile)(file);
        case "excel":
            return (0, excel_parser_1.parseExcelFile)(file);
        case "pdf":
            return (0, pdf_parser_1.parsePdfFile)(file);
        case "word":
            return (0, word_parser_1.parseWordFile)(file);
        default:
            throw Object.assign(new Error(`Unsupported source type: ${sourceType}`), {
                statusCode: 415
            });
    }
};
exports.parseDocument = parseDocument;
