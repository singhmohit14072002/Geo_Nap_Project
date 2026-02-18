"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseController = void 0;
const parser_service_1 = require("../services/parser.service");
const parseController = async (req, res, next) => {
    try {
        const file = req.file;
        if (!file) {
            throw Object.assign(new Error("No file uploaded. Provide 'file' in multipart/form-data."), {
                statusCode: 400
            });
        }
        const output = await (0, parser_service_1.parseDocument)(file);
        res.status(200).json(output);
    }
    catch (error) {
        next(error);
    }
};
exports.parseController = parseController;
