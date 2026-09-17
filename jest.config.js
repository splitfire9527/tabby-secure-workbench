module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.spec.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json',
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^tabby-core$': '<rootDir>/tests/__mocks__/tabby-core.ts',
    '^tabby-terminal$': '<rootDir>/tests/__mocks__/tabby-terminal.ts',
  },
}
