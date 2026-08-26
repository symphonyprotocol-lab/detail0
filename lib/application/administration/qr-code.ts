/**
 * The enrolment QR, rendered server-side as inline SVG.
 *
 * Inline rather than a data-URI image so it inherits the page's colours and
 * stays crisp at any size, and server-side so the secret it encodes never
 * needs a client bundle to become scannable.
 */
import QRCode from 'qrcode';

export async function qrCodeSvg(value: string): Promise<string> {
  return QRCode.toString(value, {
    type: 'svg',
    /*
     * `M` recovers about 15% of the symbol. Higher levels buy tolerance for a
     * damaged print, which a screen does not need, at the cost of a denser code
     * that phone cameras find harder in poor light.
     */
    errorCorrectionLevel: 'M',
    margin: 0,
    // Sized by CSS; the viewBox is what matters.
    width: 160,
    color: { dark: '#031a1e', light: '#00000000' },
  });
}
