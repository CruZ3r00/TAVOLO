import { describe, it, expect } from 'vitest';
import {
  enumerateHosts,
  ipToInt,
  intToIp,
} from '../../src/services/discovery/networkInfo';

describe('ipToInt / intToIp', () => {
  it('round-trip', () => {
    expect(intToIp(ipToInt('192.168.1.1')!)).toBe('192.168.1.1');
    expect(intToIp(ipToInt('10.0.0.0')!)).toBe('10.0.0.0');
    expect(intToIp(ipToInt('255.255.255.255')!)).toBe('255.255.255.255');
  });

  it('rifiuta IP malformati', () => {
    expect(ipToInt('not-an-ip')).toBeNull();
    expect(ipToInt('1.2.3')).toBeNull();
    expect(ipToInt('1.2.3.4.5')).toBeNull();
    expect(ipToInt('999.0.0.1')).toBeNull();
    expect(ipToInt('-1.0.0.0')).toBeNull();
  });
});

describe('enumerateHosts', () => {
  it('/24: 254 host (esclusi network e broadcast), skip self', () => {
    const hosts = enumerateHosts('192.168.1.50', 24, true);
    expect(hosts.length).toBe(253); // 254 - self
    expect(hosts).not.toContain('192.168.1.50');
    expect(hosts).not.toContain('192.168.1.0');
    expect(hosts).not.toContain('192.168.1.255');
    expect(hosts[0]).toBe('192.168.1.1');
    expect(hosts[hosts.length - 1]).toBe('192.168.1.254');
  });

  it('/24 senza skipSelf', () => {
    const hosts = enumerateHosts('192.168.1.50', 24, false);
    expect(hosts.length).toBe(254);
    expect(hosts).toContain('192.168.1.50');
  });

  it('/30 piccola: 2 host', () => {
    const hosts = enumerateHosts('10.0.0.5', 30, false);
    // /30 ha 4 IP: .4 (network), .5, .6, .7 (broadcast). Hosts validi: .5 e .6.
    expect(hosts).toEqual(['10.0.0.5', '10.0.0.6']);
  });

  it('cidr fuori range fallback a /24', () => {
    const hosts = enumerateHosts('192.168.0.10', 8, true);
    expect(hosts.length).toBe(253);
    expect(hosts[0]).toBe('192.168.0.1');
  });

  it('IP malformato → array vuoto', () => {
    expect(enumerateHosts('zzz', 24)).toEqual([]);
  });
});
