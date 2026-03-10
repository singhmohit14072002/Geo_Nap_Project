import { KeywordScore, scoreByKeywords } from "../utils/keyword-matcher";

export const STORAGE_KEYWORDS = [
  "disk",
  "ssd",
  "storage",
  "volume",
  "iops",
  "hdd",
  "throughput"
] as const;

export const storageScore = (searchText: string): KeywordScore =>
  scoreByKeywords(searchText, STORAGE_KEYWORDS);

