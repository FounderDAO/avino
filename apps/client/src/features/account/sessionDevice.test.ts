import { describe, it, expect } from 'vitest';
import { parseUserAgent, deviceLabel } from './sessionDevice';

const UA = {
  chromeMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  safariIphone:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  edgeWindows:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0',
  firefoxLinux: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
  yandexAndroid:
    'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 YaBrowser/24.4.1.53 Mobile Safari/537.36',
  chromeIos:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1',
};

describe('parseUserAgent', () => {
  it('Chrome на macOS — десктоп', () => {
    expect(parseUserAgent(UA.chromeMac)).toEqual({
      browser: 'Chrome',
      os: 'macOS',
      mobile: false,
    });
  });

  it('Safari на iPhone — мобильный, iOS раньше macOS', () => {
    expect(parseUserAgent(UA.safariIphone)).toEqual({
      browser: 'Safari',
      os: 'iOS',
      mobile: true,
    });
  });

  it('Edge не принимается за Chrome', () => {
    expect(parseUserAgent(UA.edgeWindows).browser).toBe('Edge');
    expect(parseUserAgent(UA.edgeWindows).os).toBe('Windows');
  });

  it('Yandex Browser не принимается за Chrome, Android — мобильный', () => {
    expect(parseUserAgent(UA.yandexAndroid)).toEqual({
      browser: 'Yandex Browser',
      os: 'Android',
      mobile: true,
    });
  });

  it('Firefox на Linux', () => {
    expect(parseUserAgent(UA.firefoxLinux)).toEqual({
      browser: 'Firefox',
      os: 'Linux',
      mobile: false,
    });
  });

  it('CriOS (Chrome на iOS) распознаётся как Chrome', () => {
    expect(parseUserAgent(UA.chromeIos).browser).toBe('Chrome');
    expect(parseUserAgent(UA.chromeIos).os).toBe('iOS');
  });

  it('пустой/отсутствующий UA — нули без падения', () => {
    expect(parseUserAgent(null)).toEqual({ browser: null, os: null, mobile: false });
    expect(parseUserAgent('')).toEqual({ browser: null, os: null, mobile: false });
    expect(parseUserAgent('curl/8.4.0')).toEqual({
      browser: null,
      os: null,
      mobile: false,
    });
  });
});

describe('deviceLabel', () => {
  it('склеивает браузер и ОС через « · »', () => {
    expect(deviceLabel(UA.chromeMac)).toBe('Chrome · macOS');
  });

  it('одна распознанная часть — без разделителя', () => {
    expect(deviceLabel('Mozilla/5.0 (Windows NT 10.0)')).toBe('Windows');
  });

  it('ничего не распознано — null (UI подставит «Неизвестное устройство»)', () => {
    expect(deviceLabel('curl/8.4.0')).toBeNull();
    expect(deviceLabel(null)).toBeNull();
  });
});
