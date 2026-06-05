/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  moduleNameMapper: {
    '^@engine/(.*)$': '<rootDir>/src/engine/$1',
    '^@security/(.*)$': '<rootDir>/src/security/$1',
    '^@ui/(.*)$': '<rootDir>/src/ui/$1',
    '^@types/(.*)$': '<rootDir>/src/types/$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: {
        target: 'ES2020',
        module: 'commonjs',
        moduleResolution: 'node',
        lib: ['ES2020', 'DOM', 'DOM.Iterable'],
        strict: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        jsx: 'react-jsx',
        resolveJsonModule: true,
        noUnusedLocals: false,
        noUnusedParameters: false,
        exactOptionalPropertyTypes: false,
        skipLibCheck: true,
      },
    }],
  },
  collectCoverageFrom: [
    'src/security/**/*.ts',
    'src/engine/**/*.ts',
    'src/ui/state.ts',
    '!src/**/*.d.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  testTimeout: 30000,
};
