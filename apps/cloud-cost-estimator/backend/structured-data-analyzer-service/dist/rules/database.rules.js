"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.databaseScore = exports.DATABASE_KEYWORDS = void 0;
const keyword_matcher_1 = require("../utils/keyword-matcher");
exports.DATABASE_KEYWORDS = [
    "mysql",
    "postgres",
    "postgresql",
    "sql",
    "oracle",
    "database",
    "mongodb",
    "mssql"
];
const databaseScore = (searchText) => (0, keyword_matcher_1.scoreByKeywords)(searchText, exports.DATABASE_KEYWORDS);
exports.databaseScore = databaseScore;
