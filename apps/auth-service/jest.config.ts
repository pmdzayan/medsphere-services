import type { Config } from 'jest';

const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': [
      'ts-jest',
      {
        diagnostics: false,
        tsconfig: {
          isolatedModules: true,
        },
      },
    ],
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  maxWorkers: process.env.RUN_AUTH_INFRASTRUCTURE_TESTS === 'true' ? 1 : undefined,
  moduleNameMapper: {
    '^@medsphere/(.*)$': '<rootDir>/../../../packages/$1/src',
  },
};

export default config;
