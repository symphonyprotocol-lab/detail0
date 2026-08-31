/**
 * What ingestion is allowed to fetch. architecture.md 15.1.
 *
 * A platform library's location is typed by an operator and then followed --
 * through redirects, through links in an `llms.txt`, through a crawl. Every one
 * of those is a URL our server requests on someone else's say-so, which makes
 * this the classic server-side request forgery surface: the interesting target
 * is not the open internet but the metadata endpoint and the private network
 * the app itself sits in.
 *
 * `assertFetchable` is the literal-address half of the defence and the half a
 * test can hold still. It cannot stop a public hostname that resolves to a
 * private address -- that needs resolution-time pinning the platform's `fetch`
 * does not expose -- so the deployment restricts egress as well. This checks
 * that the half we own does not regress.
 */
import { describe, expect, it } from 'vitest';
import { assertFetchable } from '@/lib/infrastructure/connectors/http';
import { IngestionFailure } from '@/lib/domain/ingestion';

function refusalOf(url: string): string {
  try {
    assertFetchable(new URL(url));
    return 'allowed';
  } catch (error) {
    return error instanceof IngestionFailure ? error.code : 'unexpected';
  }
}

describe('what ingestion may fetch', () => {
  it('allows an ordinary public https URL', () => {
    expect(refusalOf('https://nextjs.org/docs')).toBe('allowed');
    expect(refusalOf('https://raw.githubusercontent.com/o/r/sha/README.md')).toBe('allowed');
  });

  it('refuses plaintext http, whatever the host', () => {
    // A platform library is republished under re0's own name; following http
    // makes the content whatever the nearest network can rewrite it to.
    expect(refusalOf('http://nextjs.org/docs')).toBe('source_forbidden');
  });

  it('refuses the cloud metadata endpoints', () => {
    expect(refusalOf('https://169.254.169.254/latest/meta-data/')).toBe('source_forbidden');
    expect(refusalOf('https://metadata.google.internal/computeMetadata/v1/')).toBe(
      'source_forbidden',
    );
  });

  it('refuses loopback and private ranges by literal address', () => {
    for (const host of [
      'https://127.0.0.1/x',
      'https://localhost/x',
      'https://sub.localhost/x',
      'https://10.0.0.5/x',
      'https://192.168.1.1/x',
      'https://172.16.0.1/x',
      'https://172.31.255.1/x',
      'https://100.64.0.1/x',
      'https://[::1]/x',
      'https://[fe80::1]/x',
      'https://[fd00::1]/x',
    ]) {
      expect(refusalOf(host)).toBe('source_forbidden');
    }
  });

  it('leaves public addresses that only look private alone', () => {
    // 172.32 is outside the private block, and 11.x is public space.
    expect(refusalOf('https://172.32.0.1/x')).toBe('allowed');
    expect(refusalOf('https://11.0.0.1/x')).toBe('allowed');
  });

  it('refuses credentials smuggled into the URL', () => {
    expect(refusalOf('https://user:secret@example.com/x')).toBe('source_forbidden');
  });

  it('refuses non-http schemes outright', () => {
    expect(refusalOf('file:///etc/passwd')).toBe('source_forbidden');
    expect(refusalOf('ftp://example.com/x')).toBe('source_forbidden');
  });
});
