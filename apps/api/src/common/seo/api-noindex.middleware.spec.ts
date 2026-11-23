import type { NextFunction, Request, Response } from 'express';
import { API_ROBOTS_TXT, apiNoIndexMiddleware } from './api-noindex.middleware';

function run(path: string, method = 'GET') {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: jest.fn((k: string, v: string) => {
      headers[k.toLowerCase()] = v;
    }),
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
  };
  const next = jest.fn();
  apiNoIndexMiddleware({ path, method } as Request, res as unknown as Response, next as NextFunction);
  return { headers, res, next };
}

describe('apiNoIndexMiddleware (SEO AUD-16)', () => {
  it('adds X-Robots-Tag to every API response and passes through', () => {
    const { headers, next, res } = run('/api/v1/search');
    expect(headers['x-robots-tag']).toBe('noindex, nofollow');
    expect(next).toHaveBeenCalled();
    expect(res.send).not.toHaveBeenCalled();
  });

  it('serves robots.txt that disallows everything', () => {
    const { headers, next, res } = run('/robots.txt');
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith(API_ROBOTS_TXT);
    expect(API_ROBOTS_TXT).toContain('Disallow: /');
    expect(headers['content-type']).toMatch(/text\/plain/);
    expect(headers['x-robots-tag']).toBe('noindex, nofollow');
  });

  it('answers HEAD /robots.txt without a body and ignores POST', () => {
    expect(run('/robots.txt', 'HEAD').res.send).toHaveBeenCalledWith('');
    expect(run('/robots.txt', 'POST').next).toHaveBeenCalled();
  });
});
