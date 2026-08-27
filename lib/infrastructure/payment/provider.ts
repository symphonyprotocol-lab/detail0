/** External subscription provider. recall0 never stores card data. */
export interface PaymentAdapter {
  checkoutUrl(input: { workspaceId: string; planId: string }): Promise<string>;
  portalUrl(input: { workspaceId: string }): Promise<string>;
  verifyWebhook(rawBody: string, signature: string): Promise<{ externalEventId: string; type: string; payload: unknown }>;
}

export function paymentAdapter(): PaymentAdapter {
  throw new Error('not implemented: paymentAdapter');
}
