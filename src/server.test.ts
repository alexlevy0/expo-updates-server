import { describe, it, expect } from 'bun:test';
import app from '../src/server';

describe('Server', () => {
  it('should be defined', () => {
    expect(app).toBeDefined();
  });
});
