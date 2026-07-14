import { Test, TestingModule } from '@nestjs/testing';
import { ModuleMetadata } from '@nestjs/common';

/**
 * Thin wrapper so every service's tests bootstrap a Nest testing module the
 * same way, instead of each repeating Test.createTestingModule boilerplate.
 */
export async function createTestingApp(metadata: ModuleMetadata): Promise<TestingModule> {
  return Test.createTestingModule(metadata).compile();
}
