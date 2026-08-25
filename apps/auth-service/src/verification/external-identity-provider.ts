import { Injectable, NotImplementedException } from '@nestjs/common';

/**
 * Production identity/age verification boundary.
 *
 * This intentionally contains no Aadhaar network implementation. A future
 * adapter must use an approved UIDAI AUA/KUA/Sub-AUA or permitted offline
 * verification arrangement and must never persist raw Aadhaar numbers,
 * authentication OTPs, biometrics, or identity-document images in MedSphere.
 */
@Injectable()
export class ExternalIdentityProvider {
  initiate(): never {
    throw new NotImplementedException('External identity verification provider is not configured');
  }
}
