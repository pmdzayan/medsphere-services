import { extractRequestMetadata, MetadataHttpRequest } from './request-metadata';

describe('extractRequestMetadata', () => {
  it('keeps bounded operational context and a safe correlation identifier', () => {
    const headers: Record<string, string> = {
      'user-agent': 'a'.repeat(600),
      'x-request-id': 'gateway:request-123',
    };
    const request = {
      ip: '127.0.0.1',
      get: (name: string) => headers[name],
    } satisfies MetadataHttpRequest;

    expect(extractRequestMetadata(request)).toEqual({
      ipAddress: '127.0.0.1',
      userAgent: 'a'.repeat(512),
      requestId: 'gateway:request-123',
    });
  });

  it.each(['contains whitespace', 'x'.repeat(121), 'patient@example.test'])(
    'drops an unsafe request identifier: %s',
    (requestId) => {
      const request = {
        get: (name: string) => (name === 'x-request-id' ? requestId : undefined),
      } satisfies MetadataHttpRequest;

      expect(extractRequestMetadata(request).requestId).toBeUndefined();
    },
  );
});
