import fetch from "node-fetch";
import FormData from "form-data";
import logger from "../utils/logger";

const BASE_URL =
  process.env.LLMWHISPERER_BASE_URL?.replace(/\/+$/, "") ||
  "https://llmwhisperer-api.us-central.unstract.com/api/v2";
const API_KEY = process.env.LLMWHISPERER_API_KEY || "";
const MODE = process.env.LLMWHISPERER_MODE || "table";
const OUTPUT_MODE = process.env.LLMWHISPERER_OUTPUT_MODE || "layout_preserving";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const whisperExtractText = async (
  buffer: Buffer,
  filename: string
): Promise<string | null> => {
  if (!API_KEY) {
    return null;
  }

  try {
    const params = new URLSearchParams({
      mode: MODE,
      output_mode: OUTPUT_MODE
    });

    const submitRes = await fetch(`${BASE_URL}/whisper?${params.toString()}`, {
      method: "POST",
      headers: {
        "unstract-key": API_KEY,
        "Content-Type": "application/octet-stream",
        "file_name": filename
      },
      body: buffer
    });

    if (submitRes.status >= 400) {
      const errBody = await submitRes.text();
      logger.warn("LLMWHISPERER_SUBMIT_HTTP_ERROR", {
        status: submitRes.status,
        body: errBody
      });
      return null;
    }

    const submitJson = (await submitRes.json()) as Record<string, unknown>;
    const whisperHash = String(submitJson?.whisper_hash ?? "");
    if (!whisperHash) {
      logger.warn("LLMWHISPERER_SUBMIT_FAILED", { submitJson });
      return null;
    }

    // Poll for completion
    let status = "processing";
    for (let i = 0; i < 20; i += 1) {
      await sleep(1000);
      const statusRes = await fetch(
        `${BASE_URL}/whisper-status?whisper_hash=${encodeURIComponent(whisperHash)}`,
        {
          headers: { "unstract-key": API_KEY }
        }
      );
      const statusJson = (await statusRes.json()) as Record<string, unknown>;
      status = String(statusJson?.status ?? "processing").toLowerCase();
      if (status === "processed" || status === "completed") {
        break;
      }
      if (status === "failed") {
        logger.warn("LLMWHISPERER_STATUS_FAILED", { whisperHash, statusJson });
        return null;
      }
    }

    if (status !== "processed" && status !== "completed") {
      logger.warn("LLMWHISPERER_STATUS_TIMEOUT", { whisperHash, status });
      return null;
    }

    const retrieveRes = await fetch(
      `${BASE_URL}/whisper-retrieve?whisper_hash=${encodeURIComponent(whisperHash)}&output_mode=text`,
      {
        headers: { "unstract-key": API_KEY }
      }
    );
    const retrieveJson = (await retrieveRes.json()) as Record<string, unknown>;
    const extraction = retrieveJson?.extraction as Record<string, unknown> | undefined;
    const resultText = String(
      (extraction?.result_text as string | undefined) ??
        (retrieveJson?.result_text as string | undefined) ??
        (retrieveJson?.text as string | undefined) ??
        ""
    );
    if (!resultText.trim()) {
      logger.warn("LLMWHISPERER_EMPTY_RESULT", { whisperHash });
      return null;
    }

    logger.info("LLMWHISPERER_TEXT_EXTRACTED", {
      whisperHash,
      characters: resultText.length
    });
    return resultText;
  } catch (error) {
    logger.warn("LLMWHISPERER_ERROR", {
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
};
