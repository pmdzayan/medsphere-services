import { randomBytes } from 'node:crypto';
import { Injectable, OnModuleInit } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthConfigService } from './auth-config.service';

@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyPasswordHash?: string;

  constructor(private readonly authConfig: AuthConfigService) {}

  async onModuleInit(): Promise<void> {
    this.dummyPasswordHash = await this.hash(randomBytes(32).toString('base64url'));
  }

  private get options(): argon2.Options & { raw?: false } {
    const configuration = this.authConfig.value;
    return {
      type: argon2.argon2id,
      memoryCost: configuration.argon2MemoryKiB,
      timeCost: configuration.argon2TimeCost,
      parallelism: configuration.argon2Parallelism,
    };
  }

  async hash(password: string): Promise<string> {
    return argon2.hash(password, this.options);
  }

  async verify(hash: string, password: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  async verifyAgainstDummy(password: string): Promise<void> {
    if (!this.dummyPasswordHash) {
      // This indicates a lifecycle/configuration error, not an auth failure.
      throw new Error('Password service is not initialized');
    }
    await this.verify(this.dummyPasswordHash, password);
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, this.options);
  }
}
