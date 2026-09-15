/**
 * The OCR seam behind the PDF connector. architecture.md 8.2, step 2.
 *
 * The vendor is faked; what is under test is configuration (which
 * environment switches the fallback on), the request the adapter makes --
 * the file as multipart, the key in the header, the endpoint the plan
 * dictates -- and how each of the vendor's answers is read.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IngestionFailure } from '@/lib/domain/ingestion';
import { isOcrConfigured, pdfOcr } from '@/lib/infrastructure/connectors/ocr';

const ENV = ['OCR_PROVIDER', 'OCR_PROVIDER_API_KEY', 'OCR_PROVIDER_BASE_URL', 'OCR_PROVIDER_LANGUAGE'];
const saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;

beforeEach(() => {
  for (const name of ENV) {
    saved[name] = process.env[name];
    delete process.env[name];
  }
});
afterEach(() => {
  for (const name of ENV) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
  globalThis.fetch = realFetch;
});

function answerWith(body: unknown, status = 200) {
  const requests: { url: string; headers: Headers; form: FormData | null }[] = [];
  globalThis.fetch = (async (input: URL | RequestInfo, init?: RequestInit) => {
    requests.push({
      url: String(input),
      headers: new Headers(init?.headers),
      form: init?.body instanceof FormData ? init.body : null,
    });
    return typeof body === 'string'
      ? new Response(body, { status })
      : Response.json(body, { status });
  }) as typeof fetch;
  return requests;
}

const PDF = { bytes: new TextEncoder().encode('%PDF-1.4 fake'), name: 'scan.pdf' };

describe('pdfOcr configuration', () => {
  it('is off until a provider and its key are both set', () => {
    expect(isOcrConfigured()).toBe(false);
    process.env.OCR_PROVIDER = 'ocrspace';
    expect(isOcrConfigured()).toBe(false);
    process.env.OCR_PROVIDER_API_KEY = 'k';
    expect(isOcrConfigured()).toBe(true);
    expect(pdfOcr()?.name).toBe('ocrspace');
  });

  it('ignores a provider it does not know', () => {
    process.env.OCR_PROVIDER = 'tesseract';
    process.env.OCR_PROVIDER_API_KEY = 'k';
    expect(pdfOcr()).toBeNull();
  });
});

describe('ocr.space adapter', () => {
  beforeEach(() => {
    process.env.OCR_PROVIDER = 'ocrspace';
    process.env.OCR_PROVIDER_API_KEY = 'secret-key';
  });

  it('posts the file as multipart with the key in the header, and joins the pages', async () => {
    const requests = answerWith({
      OCRExitCode: 1,
      IsErroredOnProcessing: false,
      ParsedResults: [
        { FileParseExitCode: 1, ParsedText: 'Page one \r\nline two  \r\n' },
        { FileParseExitCode: 1, ParsedText: 'Page two' },
      ],
    });
    const text = await pdfOcr()!.recognize(PDF);
    expect(text).toBe('Page one\nline two\n\nPage two');

    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.url).toBe('https://api.ocr.space/parse/image');
    expect(request?.headers.get('apikey')).toBe('secret-key');
    const file = request?.form?.get('file');
    expect(file).toBeInstanceOf(Blob);
    expect((file as File).name).toBe('scan.pdf');
    expect((file as Blob).type).toBe('application/pdf');
    expect(request?.form?.get('filetype')).toBe('PDF');
    expect(request?.form?.has('language')).toBe(false);
  });

  it('uses the plan endpoint and language from the environment', async () => {
    process.env.OCR_PROVIDER_BASE_URL = 'https://apipro1.ocr.space/';
    process.env.OCR_PROVIDER_LANGUAGE = 'chs';
    const requests = answerWith({ OCRExitCode: 1, ParsedResults: [] });
    await pdfOcr()!.recognize(PDF);
    expect(requests[0]?.url).toBe('https://apipro1.ocr.space/parse/image');
    expect(requests[0]?.form?.get('language')).toBe('chs');
  });

  it('keeps the pages that were read when the vendor reports a partial parse', async () => {
    answerWith({
      OCRExitCode: 2,
      ParsedResults: [
        { FileParseExitCode: 1, ParsedText: 'readable' },
        { FileParseExitCode: -10, ParsedText: '', ErrorMessage: 'engine error' },
      ],
    });
    await expect(pdfOcr()!.recognize(PDF)).resolves.toBe('readable');
  });

  it('reads nothing from a blank scan without failing', async () => {
    answerWith({ OCRExitCode: 1, ParsedResults: [{ FileParseExitCode: 1, ParsedText: '  ' }] });
    await expect(pdfOcr()!.recognize(PDF)).resolves.toBe('');
  });

  it("surfaces the vendor's refusal as a parse failure naming the file", async () => {
    answerWith({
      OCRExitCode: 4,
      IsErroredOnProcessing: true,
      ErrorMessage: ['File size exceeds the maximum permissible file size limit of 1024 KB'],
    });
    const error = await pdfOcr()!.recognize(PDF).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(IngestionFailure);
    expect((error as IngestionFailure).code).toBe('parse_failed');
    expect((error as IngestionFailure).message).toContain('scan.pdf');
    expect((error as IngestionFailure).message).toContain('1024 KB');
  });

  it('fails when nothing was read, when the status is not ok, and when the body is not JSON', async () => {
    answerWith({ OCRExitCode: 3, ParsedResults: [] });
    await expect(pdfOcr()!.recognize(PDF)).rejects.toMatchObject({ code: 'parse_failed' });
    answerWith('rate limited', 403);
    await expect(pdfOcr()!.recognize(PDF)).rejects.toMatchObject({ code: 'parse_failed' });
    answerWith('<html>gateway</html>');
    await expect(pdfOcr()!.recognize(PDF)).rejects.toMatchObject({ code: 'parse_failed' });
  });
});
