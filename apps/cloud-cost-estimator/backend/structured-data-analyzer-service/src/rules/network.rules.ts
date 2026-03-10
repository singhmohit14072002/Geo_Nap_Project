import { KeywordScore, scoreByKeywords } from "../utils/keyword-matcher";

export const NETWORK_KEYWORDS = [
  "bandwidth",
  "egress",
  "transfer",
  "network",
  "throughput",
  "outbound",
  "ingress"
] as const;

export const networkScore = (searchText: string): KeywordScore =>
  scoreByKeywords(searchText, NETWORK_KEYWORDS);

