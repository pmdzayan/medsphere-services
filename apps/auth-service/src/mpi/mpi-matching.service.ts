import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { MpiRepository } from './mpi.repository';

export interface MatchCandidate {
  patientId: string;
  score: number;
  confidence: 'EXACT' | 'HIGH' | 'PROBABLE' | 'POSSIBLE';
  reason: string;
}

@Injectable()
export class MpiMatchingService {
  private readonly logger = new Logger(MpiMatchingService.name);

  constructor(private readonly repository: MpiRepository) {}

  /**
   * Hash a value using SHA-256 for privacy-preserving lookups.
   */
  hashValue(value: string): string {
    return crypto.createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
  }

  /**
   * Find matching patients across the entire system based on patient attributes.
   *
   * Matching strategy (deterministic):
   * 1. EXACT: nationalIdHash match
   * 2. HIGH: Phone + DOB match
   * 3. PROBABLE: Email match
   * 4. POSSIBLE: LastName + Phone first 4 digits match
   */
  async findMatches(params: {
    firstName: string;
    lastName: string;
    dateOfBirth: Date;
    phone?: string;
    email?: string;
    nationalIdHash?: string;
  }): Promise<MatchCandidate[]> {
    const candidates: MatchCandidate[] = [];
    const seenPatientIds = new Set<string>();

    // 1. EXACT: nationalIdHash match
    if (params.nationalIdHash) {
      const exactMatches = await this.repository.findPatientsByNationalIdHash(
        params.nationalIdHash,
      );
      for (const patient of exactMatches) {
        if (!seenPatientIds.has(patient.id)) {
          seenPatientIds.add(patient.id);
          candidates.push({
            patientId: patient.id,
            score: 1.0,
            confidence: 'EXACT',
            reason: 'Exact match on national ID hash',
          });
        }
      }
    }

    // 2. HIGH: Phone + DOB match
    if (params.phone) {
      const phoneMatches = await this.repository.findPatientsByPhone(params.phone);
      for (const patient of phoneMatches) {
        if (!seenPatientIds.has(patient.id)) {
          const dobMatch =
            patient.dateOfBirth.toISOString().split('T')[0] ===
            params.dateOfBirth.toISOString().split('T')[0];
          if (dobMatch) {
            seenPatientIds.add(patient.id);
            candidates.push({
              patientId: patient.id,
              score: 0.9,
              confidence: 'HIGH',
              reason: 'Phone + date of birth match',
            });
          }
        }
      }
    }

    // 3. PROBABLE: Email match
    if (params.email) {
      const emailMatches = await this.repository.findPatientsByEmail(params.email);
      for (const patient of emailMatches) {
        if (!seenPatientIds.has(patient.id)) {
          seenPatientIds.add(patient.id);
          candidates.push({
            patientId: patient.id,
            score: 0.7,
            confidence: 'PROBABLE',
            reason: 'Email address match',
          });
        }
      }
    }

    // 4. POSSIBLE: LastName + Phone prefix match
    if (params.phone && params.phone.length >= 4) {
      const phonePrefix = params.phone.slice(0, 4);
      const phoneMatches = await this.repository.findPatientsByPhone(params.phone);
      for (const patient of phoneMatches) {
        if (!seenPatientIds.has(patient.id) && patient.phone?.startsWith(phonePrefix)) {
          const lastNameMatch = patient.lastName.toLowerCase() === params.lastName.toLowerCase();
          if (lastNameMatch) {
            seenPatientIds.add(patient.id);
            candidates.push({
              patientId: patient.id,
              score: 0.4,
              confidence: 'POSSIBLE',
              reason: 'Last name + phone prefix match',
            });
          }
        }
      }
    }

    return candidates.sort((a, b) => b.score - a.score);
  }

  /**
   * Create a patient link between two matched patients.
   */
  async createLink(
    sourcePatientId: string,
    targetPatientId: string,
    score: number,
    confidence: 'EXACT' | 'HIGH' | 'PROBABLE' | 'POSSIBLE',
    reason: string,
  ) {
    return this.repository.createPatientLink({
      sourcePatientId,
      targetPatientId,
      confidence,
      score,
      reason,
    });
  }

  /**
   * Verify a patient link after manual review.
   */
  async verifyLink(linkId: string, verifiedBy: string) {
    return this.repository.verifyPatientLink(linkId, verifiedBy);
  }
}
