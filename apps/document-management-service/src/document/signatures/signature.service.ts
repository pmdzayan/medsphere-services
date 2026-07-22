import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { DocumentRepository } from '../document.repository';

/**
 * Digital signature engine for clinical document sign-offs.
 *
 * Uses Node.js built-in `crypto` module to:
 * - Compute SHA-256 checksums for file integrity verification
 * - Create RSA digital signatures using the signer's private key
 * - Verify digital signatures against the signer's public key
 *
 * Signature data is stored as JSON in the Document model's
 * `signatureData` field, containing the hash, public key,
 * timestamp, and signer identity.
 */
@Injectable()
export class SignatureService {
  private readonly logger = new Logger(SignatureService.name);

  constructor(private readonly repository: DocumentRepository) {}

  /**
   * Compute the SHA-256 checksum of a file's content.
   * Used for file integrity verification on upload and download.
   */
  computeChecksum(data: Buffer): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Verify that a file's content matches the expected SHA-256 checksum.
   */
  verifyChecksum(data: Buffer, expectedChecksum: string): boolean {
    const actualChecksum = this.computeChecksum(data);
    return crypto.timingSafeEqual(
      Buffer.from(actualChecksum, 'hex'),
      Buffer.from(expectedChecksum, 'hex'),
    );
  }

  /**
   * Create a digital signature for a document using the signer's
   * RSA private key.
   *
   * The signature is computed over the document's SHA-256 checksum
   * and stored as JSON in the document's `signatureData` field.
   */
  async signDocument(params: {
    documentId: string;
    signerId: string;
    privateKey: string;
    signerRole?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Record<string, unknown>> {
    const document = await this.repository.findById(params.documentId);
    if (!document) {
      throw new NotFoundException(`Document not found: ${params.documentId}`);
    }

    if (document.isSigned) {
      throw new BadRequestException('Document has already been digitally signed');
    }

    // The signature is computed over the document's checksum
    const documentHash = document.checksumSha256;

    let publicKey: string;
    try {
      // Derive the public key from the private key for storage
      const privateKeyObj = crypto.createPrivateKey(params.privateKey) as crypto.KeyObject & {
        publicKey: crypto.KeyObject;
      };
      publicKey = privateKeyObj.publicKey.export({
        type: 'spki',
        format: 'pem',
      }) as string;

      // Create the digital signature using RSA-SHA256
      const sign = crypto.createSign('sha256');
      sign.update(documentHash);
      const signature = sign.sign(params.privateKey, 'base64');

      const signatureData = {
        hash: documentHash,
        signature,
        publicKey,
        signerId: params.signerId,
        signerRole: params.signerRole ?? null,
        signedAt: new Date().toISOString(),
        algorithm: 'RSA-SHA256',
        metadata: params.metadata ?? null,
      };

      // Persist the signature data on the document
      await this.repository.updateSignature(params.documentId, signatureData);

      this.logger.log(`Document ${params.documentId} signed by user ${params.signerId}`);

      return signatureData;
    } catch (error) {
      this.logger.error(
        `Failed to sign document ${params.documentId}: ${(error as Error).message}`,
      );
      throw new BadRequestException(
        `Failed to create digital signature: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Verify a document's digital signature against the provided
   * public key.
   */
  async verifySignature(params: {
    documentId: string;
    publicKey: string;
  }): Promise<{ valid: boolean; signerId?: string; signedAt?: string }> {
    const document = await this.repository.findById(params.documentId);
    if (!document) {
      throw new NotFoundException(`Document not found: ${params.documentId}`);
    }

    if (!document.isSigned || !document.signatureData) {
      throw new BadRequestException('Document has not been digitally signed');
    }

    const sigData = document.signatureData as Record<string, unknown>;
    const documentHash = sigData['hash'] as string;
    const signature = sigData['signature'] as string;

    try {
      const verify = crypto.createVerify('sha256');
      verify.update(documentHash);
      const valid = verify.verify(params.publicKey, signature, 'base64');

      return {
        valid,
        signerId: sigData['signerId'] as string | undefined,
        signedAt: sigData['signedAt'] as string | undefined,
      };
    } catch (error) {
      this.logger.error(
        `Failed to verify signature for document ${params.documentId}: ${(error as Error).message}`,
      );
      return { valid: false };
    }
  }
}
