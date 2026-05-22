import { describe, it, expect } from 'vitest';
import { isPrivateIp } from '../utils/ipUtils';

describe('isPrivateIp', () => {
  it('should identify loopback addresses', () => {
    expect(isPrivateIp('127.0.0.1')).toBe(true);
    expect(isPrivateIp('::1')).toBe(true);
  });

  it('should identify private IPv4 ranges', () => {
    // 10.0.0.0/8
    expect(isPrivateIp('10.0.0.1')).toBe(true);
    expect(isPrivateIp('10.255.80.20')).toBe(true);

    // 172.16.0.0/12
    expect(isPrivateIp('172.16.0.1')).toBe(true);
    expect(isPrivateIp('172.31.254.254')).toBe(true);
    expect(isPrivateIp('172.32.0.1')).toBe(false); // outside range

    // 192.168.0.0/16
    expect(isPrivateIp('192.168.1.1')).toBe(true);
    expect(isPrivateIp('192.168.100.250')).toBe(true);
  });

  it('should identify link-local IPv4 addresses', () => {
    expect(isPrivateIp('169.254.10.20')).toBe(true);
  });

  it('should identify private/link-local IPv6 ranges', () => {
    expect(isPrivateIp('fe80::1')).toBe(true);
    expect(isPrivateIp('fe80::215:5dff:fe00:112')).toBe(true);
    expect(isPrivateIp('fd00::1')).toBe(true);
    expect(isPrivateIp('fc00::abc')).toBe(true);
  });

  it('should identify public IP addresses as not private', () => {
    expect(isPrivateIp('8.8.8.8')).toBe(false);
    expect(isPrivateIp('208.67.222.222')).toBe(false);
    expect(isPrivateIp('2001:4860:4860::8888')).toBe(false);
  });
});
