/**
 * Stirling PDF backend client.
 *
 * Base URL and API key come from environment variables:
 *   VITE_PDFBRAINS_API_URL  (default https://pdfbrains.codewithdishu.com)
 *   VITE_PDFBRAINS_API_KEY  (the global API key from the Stirling instance)
 *
 * Endpoints (verified against Stirling-PDF source):
 *   POST /api/v1/convert/file/pdf   - convert any Office file to PDF (LibreOffice)
 *   POST /api/v1/convert/docx/pdf   - legacy per-format endpoint (404 fallback)
 *   Auth: X-API-Key header
 */

const API_URL: string =
  (import.meta.env.VITE_PDFBRAINS_API_URL as string | undefined) ??
  "https://pdfbrains.codewithdishu.com";

const API_KEY: string = (import.meta.env.VITE_PDFBRAINS_API_KEY as string | undefined) ?? "";

export function hasApiKey(): boolean {
  return API_KEY.length > 0;
}

function describeStatus(status: number): string {
  switch (status) {
    case 401:
      return "The backend rejected the API key (401). Check VITE_PDFBRAINS_API_KEY.";
    case 403:
      return "The backend denied access (403). Check the API key permissions.";
    case 404:
      return "The conversion endpoint was not found on the backend.";
    case 413:
      return "The file is too large for the backend.";
    case 500:
    case 502:
    case 503:
    case 504:
      return "The backend had an error while converting. Try again in a moment.";
    default:
      return `The backend returned an error (HTTP ${status}).`;
  }
}

async function postFile(path: string, file: File): Promise<Response> {
  const form = new FormData();
  form.append("fileInput", file);
  return fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: API_KEY ? { "X-API-Key": API_KEY } : {},
    body: form,
  });
}

/** POSTs a prepared multipart form and returns the response blob. */
async function requestBlob(path: string, form: FormData): Promise<Blob> {
  if (!API_KEY) {
    throw new Error(
      "The backend API key is not configured. Add VITE_PDFBRAINS_API_KEY to your environment."
    );
  }
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: API_KEY ? { "X-API-Key": API_KEY } : {},
      body: form,
    });
  } catch {
    throw new Error(
      `Could not reach the backend at ${API_URL}. Check the URL and that CORS is enabled on the Stirling PDF instance.`
    );
  }
  if (!response.ok) {
    throw new Error(describeStatus(response.status));
  }
  return response.blob();
}

/** Builds a multipart form from a file plus scalar and list fields. */
function buildForm(
  file: File,
  fields: Record<string, string | number | boolean | undefined>,
  listFields?: Record<string, string[] | undefined>
): FormData {
  const form = new FormData();
  form.append("fileInput", file);
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) form.append(key, String(value));
  }
  for (const [key, values] of Object.entries(listFields ?? {})) {
    if (values) for (const value of values) form.append(key, value);
  }
  return form;
}

export interface CompressOptions {
  /** 0-10, higher = smaller output (Stirling default 5). */
  optimizeLevel?: number;
  /** Optional target size, e.g. "500KB", "5MB", "1GB". */
  expectedOutputSize?: string;
  linearize?: boolean;
  normalize?: boolean;
  grayscale?: boolean;
  lineArt?: boolean;
  lineArtThreshold?: number;
  lineArtEdgeLevel?: number;
}

/** Compress/optimize a PDF via the Stirling backend. */
export async function compressPdfViaApi(file: File, options: CompressOptions = {}): Promise<Blob> {
  if (!API_KEY) throw new Error("The backend API key is not configured.");
  const form = buildForm(file, {
    optimizeLevel: options.optimizeLevel,
    expectedOutputSize: options.expectedOutputSize || undefined,
    linearize: options.linearize,
    normalize: options.normalize,
    grayscale: options.grayscale,
    lineArt: options.lineArt,
    lineArtThreshold: options.lineArtThreshold,
    lineArtEdgeLevel: options.lineArtEdgeLevel,
  });
  return requestBlob("/api/v1/misc/compress-pdf", form);
}

/** Repair a PDF via the Stirling backend (Ghostscript + qpdf). */
export async function repairPdfViaApi(file: File): Promise<Blob> {
  if (!API_KEY) throw new Error("The backend API key is not configured.");
  return requestBlob("/api/v1/misc/repair", buildForm(file, {}));
}

export interface OcrOptions {
  /** Tesseract language codes, e.g. ["eng", "fra"]. */
  languages?: string[];
  /** skip-text | force-ocr | remove-text | force-ocr-and-remove-text */
  ocrType?: string;
  /** hocr | sandwich */
  ocrRenderType?: string;
  deskew?: boolean;
  rotatePages?: boolean;
  clean?: boolean;
  cleanFinal?: boolean;
  removeImagesAfter?: boolean;
  /** When true the backend returns a ZIP with a text sidecar. */
  sidecar?: boolean;
}

/** OCR a PDF via the Stirling backend. */
export async function ocrPdfViaApi(file: File, options: OcrOptions = {}): Promise<Blob> {
  if (!API_KEY) throw new Error("The backend API key is not configured.");
  const form = buildForm(
    file,
    {
      ocrType: options.ocrType,
      ocrRenderType: options.ocrRenderType,
      deskew: options.deskew,
      rotatePages: options.rotatePages,
      clean: options.clean,
      cleanFinal: options.cleanFinal,
      removeImagesAfter: options.removeImagesAfter,
      sidecar: options.sidecar,
    },
    { languages: options.languages && options.languages.length > 0 ? options.languages : undefined }
  );
  return requestBlob("/api/v1/misc/ocr-pdf", form);
}

/** PDF to Word: outputFormat is doc | docx | odt. */
export async function convertPdfToWord(file: File, outputFormat: string): Promise<Blob> {
  return requestBlob("/api/v1/convert/pdf/word", buildForm(file, { outputFormat }));
}

/** PDF to PowerPoint: outputFormat is ppt | pptx | odp. */
export async function convertPdfToPowerpoint(file: File, outputFormat: string): Promise<Blob> {
  return requestBlob("/api/v1/convert/pdf/presentation", buildForm(file, { outputFormat }));
}

/** PDF to Excel (xlsx). */
export async function convertPdfToExcel(file: File): Promise<Blob> {
  return requestBlob("/api/v1/convert/pdf/xlsx", buildForm(file, {}));
}

/** PDF to PDF/A: outputFormat like pdfa1b, with optional PDF/UA and strict. */
export async function convertPdfToPdfa(
  file: File,
  outputFormat: string,
  pdfUa: boolean,
  strict: boolean
): Promise<Blob> {
  return requestBlob(
    "/api/v1/convert/pdf/pdfa",
    buildForm(file, { outputFormat, pdfUa, strict })
  );
}

/** Removes the password from a protected PDF. */
export async function unlockPdfViaApi(file: File, password: string): Promise<Blob> {
  if (!API_KEY) {
    throw new Error(
      "The backend API key is not configured. Add VITE_PDFBRAINS_API_KEY to your environment."
    );
  }
  const form = buildForm(file, { password });
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1/security/remove-password`, {
      method: "POST",
      headers: API_KEY ? { "X-API-Key": API_KEY } : {},
      body: form,
    });
  } catch {
    throw new Error(
      `Could not reach the backend at ${API_URL}. Check the URL and that CORS is enabled on the Stirling PDF instance.`
    );
  }
  if (response.status === 400) {
    throw new Error("Could not unlock the file. The password may be wrong.");
  }
  if (!response.ok) {
    throw new Error(describeStatus(response.status));
  }
  return response.blob();
}

export interface ProtectOptions {
  /** Password needed to open the file. */
  password: string;
  /** Optional owner password restricting actions; defaults to password. */
  ownerPassword?: string;
  /** Encryption key length: 40, 128 or 256. */
  keyLength?: number;
  preventAssembly?: boolean;
  preventExtractContent?: boolean;
  preventExtractForAccessibility?: boolean;
  preventFillInForm?: boolean;
  preventModify?: boolean;
  preventModifyAnnotations?: boolean;
  preventPrinting?: boolean;
}

/** Protects a PDF with a password and optional permission restrictions. */
export async function protectPdfViaApi(file: File, options: ProtectOptions): Promise<Blob> {
  return requestBlob("/api/v1/security/add-password", buildForm(file, { ...options }));
}

/* ------------------------------------------------------------------ */
/* Text editor (Edit PDF)                                              */
/* ------------------------------------------------------------------ */

export interface TextEditorTextElement {
  text: string;
  fontId?: string;
  fontSize?: number;
  fontMatrixSize?: number;
  spaceWidth?: number;
  zOrder?: number;
  width?: number;
  height?: number;
  /** PDF text matrix; [4] and [5] are the x/y position in points. */
  textMatrix?: number[];
}

export interface TextEditorPage {
  pageNumber?: number;
  width?: number;
  height?: number;
  rotation?: number;
  textElements?: TextEditorTextElement[];
}

export interface TextEditorDocument {
  metadata?: unknown;
  fonts?: unknown[];
  pages?: TextEditorPage[];
}

/** Extracts the editable JSON structure for the text editor. */
export async function extractTextEditorJson(file: File): Promise<TextEditorDocument> {
  if (!API_KEY) {
    throw new Error(
      "The backend API key is not configured. Add VITE_PDFBRAINS_API_KEY to your environment."
    );
  }
  const form = buildForm(file, { lightweight: false });
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1/convert/pdf/text-editor`, {
      method: "POST",
      headers: { "X-API-Key": API_KEY },
      body: form,
    });
  } catch {
    throw new Error(
      `Could not reach the backend at ${API_URL}. Check the URL and that CORS is enabled on the Stirling PDF instance.`
    );
  }
  if (!response.ok) {
    throw new Error(describeStatus(response.status));
  }
  return response.json();
}

/**
 * Renders an edited text-editor document back to a PDF via the JSON-file
 * endpoint. This is the browser-friendly path: the job-id flow
 * (/text-editor/partial/{jobId}) needs the X-Job-Id response header exposed
 * by CORS, which the deployment currently does not do.
 */
export async function renderTextEditorPdf(
  document: TextEditorDocument,
  filename: string
): Promise<Blob> {
  if (!API_KEY) {
    throw new Error(
      "The backend API key is not configured. Add VITE_PDFBRAINS_API_KEY to your environment."
    );
  }
  const form = new FormData();
  form.append(
    "fileInput",
    new Blob([JSON.stringify(document)], { type: "application/json" }),
    filename
  );
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api/v1/convert/text-editor/pdf`, {
      method: "POST",
      headers: { "X-API-Key": API_KEY },
      body: form,
    });
  } catch {
    throw new Error(
      `Could not reach the backend at ${API_URL}. Check the URL and that CORS is enabled on the Stirling PDF instance.`
    );
  }
  if (!response.ok) {
    throw new Error(describeStatus(response.status));
  }
  return response.blob();
}

/** Converts an Office file (docx, pptx, xlsx, ...) to a PDF blob. */
export async function convertOfficeToPdf(file: File): Promise<Blob> {
  if (!API_KEY) {
    throw new Error(
      "The backend API key is not configured. Add VITE_PDFBRAINS_API_KEY to your environment."
    );
  }

  let response: Response;
  try {
    response = await postFile("/api/v1/convert/file/pdf", file);
  } catch {
    throw new Error(
      `Could not reach the backend at ${API_URL}. Check the URL and that CORS is enabled on the Stirling PDF instance.`
    );
  }

  // Older Stirling versions expose per-format endpoints; fall back if the
  // unified LibreOffice endpoint does not exist on this deployment.
  if (response.status === 404) {
    try {
      response = await postFile("/api/v1/convert/docx/pdf", file);
    } catch {
      throw new Error(
        `Could not reach the backend at ${API_URL}. Check the URL and that CORS is enabled on the Stirling PDF instance.`
      );
    }
  }

  if (!response.ok) {
    throw new Error(describeStatus(response.status));
  }

  return response.blob();
}

/** Converts an HTML or ZIP (HTML+CSS) file to PDF via the Stirling backend. */
export async function convertHtmlToPdf(file: File): Promise<Blob> {
  if (!API_KEY) {
    throw new Error(
      "The backend API key is not configured. Add VITE_PDFBRAINS_API_KEY to your environment."
    );
  }

  let response: Response;
  try {
    response = await postFile("/api/v1/convert/html/pdf", file);
  } catch {
    throw new Error(
      `Could not reach the backend at ${API_URL}. Check the URL and that CORS is enabled on the Stirling PDF instance.`
    );
  }

  if (!response.ok) {
    throw new Error(describeStatus(response.status));
  }

  return response.blob();
}
