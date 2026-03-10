import { KeywordScore, scoreByKeywords } from "../utils/keyword-matcher";

export const DATABASE_KEYWORDS = [
  "mysql",
  "postgres",
  "postgresql",
  "sql",
  "oracle",
  "database",
  "mongodb",
  "mssql"
] as const;

export const databaseScore = (searchText: string): KeywordScore =>
  scoreByKeywords(searchText, DATABASE_KEYWORDS);

