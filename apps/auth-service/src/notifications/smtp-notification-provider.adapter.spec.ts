import nodemailer, { type Transporter } from 'nodemailer';
import { NotificationProviderContractFailure } from './notification-provider-activation.contracts';
import { SmtpNotificationProviderAdapter } from './smtp-notification-provider.adapter';
import type { NotificationProviderDeliveryInput } from './notification.contracts';

const baseInput: NotificationProviderDeliveryInput = {
  deliveryId: 'a1111111-1111-4111-8111-111111111111',
  idempotencyKey: 'a1111111-1111-4111-8111-111111111111',
  tenantId: 'b2222222-2222-4222-8222-222222222222',
  channel: 'EMAIL',
  destinationToken: 'patient@example.test',
  templateKey: 'reservation-ready',
  templateVersion: 1,
  variables: { status: 'READY' },
  composedContent: {
    templateKey: 'reservation-ready',
    templateVersion: 1,
    locale: 'en',
    subject: 'Your reservation is ready',
    body: 'Your reserved item is ready for collection.',
    metadata: { workflowKey: 'reservation-ready-membership-v1', contentClass: 'OPERATIONAL' },
  },
};

function adapterWithJsonTransport() {
  // Real nodemailer code path, zero network -- jsonTransport returns a
  // deterministic accepted response without opening any socket.
  const transport = nodemailer.createTransport({ jsonTransport: true });
  return new SmtpNotificationProviderAdapter(
    {
      connectionUrl: 'smtp://unused:unused@localhost:1',
      fromAddress: 'ops@medsphere.test',
      timeoutMs: 5000,
    },
    transport,
  );
}

function adapterThatThrows(error: unknown) {
  const transport = { sendMail: jest.fn().mockRejectedValue(error) } as unknown as Transporter;
  return new SmtpNotificationProviderAdapter(
    {
      connectionUrl: 'smtp://unused:unused@localhost:1',
      fromAddress: 'ops@medsphere.test',
      timeoutMs: 5000,
    },
    transport,
  );
}

describe('SmtpNotificationProviderAdapter', () => {
  it('delivers successfully and returns an accepted acknowledgement with a provider reference', async () => {
    const adapter = adapterWithJsonTransport();
    const result = await adapter.deliver(baseInput);
    expect(result.acknowledgement).toBe('ACCEPTED');
    expect(typeof result.providerReference).toBe('string');
    expect(result.providerReference!.length).toBeGreaterThan(0);
  });

  it('rejects a non-EMAIL channel input before ever touching the transport', async () => {
    const adapter = adapterWithJsonTransport();
    await expect(adapter.deliver({ ...baseInput, channel: 'SMS' as never })).rejects.toMatchObject({
      code: 'PROVIDER_CHANNEL_UNSUPPORTED',
      classification: 'TERMINAL',
    });
  });

  it('classifies a connection failure as TRANSIENT', async () => {
    const adapter = adapterThatThrows(
      Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:25'), { code: 'ECONNREFUSED' }),
    );
    await expect(adapter.deliver(baseInput)).rejects.toMatchObject({
      code: 'PROVIDER_DELIVERY_TRANSIENT',
      classification: 'TRANSIENT',
    });
  });

  it('classifies an authentication failure as TERMINAL', async () => {
    const adapter = adapterThatThrows(
      Object.assign(new Error('Invalid login'), { code: 'EAUTH', responseCode: 535 }),
    );
    await expect(adapter.deliver(baseInput)).rejects.toMatchObject({
      code: 'PROVIDER_REJECTED_TERMINAL',
      classification: 'TERMINAL',
    });
  });

  it('classifies a permanent 5xx SMTP rejection as TERMINAL', async () => {
    const adapter = adapterThatThrows(
      Object.assign(new Error('mailbox unavailable'), { responseCode: 550 }),
    );
    await expect(adapter.deliver(baseInput)).rejects.toMatchObject({
      code: 'PROVIDER_REJECTED_TERMINAL',
      classification: 'TERMINAL',
    });
  });

  it('classifies a transient 4xx SMTP response as TRANSIENT', async () => {
    const adapter = adapterThatThrows(
      Object.assign(new Error('too many connections'), { responseCode: 421 }),
    );
    await expect(adapter.deliver(baseInput)).rejects.toMatchObject({
      code: 'PROVIDER_DELIVERY_TRANSIENT',
      classification: 'TRANSIENT',
    });
  });

  it('never exposes the raw vendor error message, credential, or destination in the thrown failure', async () => {
    const secretUrl = 'smtp://user:super-secret-password@vendor.example:465';
    const transport = {
      sendMail: jest
        .fn()
        .mockRejectedValue(
          Object.assign(
            new Error(`SMTP conversation failed for ${secretUrl} to patient@example.test`),
            { code: 'ECONNRESET' },
          ),
        ),
    } as unknown as Transporter;
    const adapter = new SmtpNotificationProviderAdapter(
      { connectionUrl: secretUrl, fromAddress: 'ops@medsphere.test', timeoutMs: 5000 },
      transport,
    );

    let thrown: unknown;
    try {
      await adapter.deliver(baseInput);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(NotificationProviderContractFailure);
    const serialized = JSON.stringify({
      code: (thrown as NotificationProviderContractFailure).code,
      providerKey: (thrown as NotificationProviderContractFailure).providerKey,
      classification: (thrown as NotificationProviderContractFailure).classification,
    });
    expect(serialized).not.toContain('super-secret-password');
    expect(serialized).not.toContain('vendor.example');
    expect(serialized).not.toContain('patient@example.test');
  });
});
