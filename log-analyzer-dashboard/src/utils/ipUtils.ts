/**
 * Checks if an IP address is a private, loopback, or local link address.
 * Matches:
 * - Loopback: 127.0.0.1, ::1
 * - Private IPv4 ranges:
 *   - 10.0.0.0/8 (10.0.0.0 - 10.255.255.255)
 *   - 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
 *   - 192.168.0.0/16 (192.168.0.0 - 192.168.255.255)
 * - Link-local IPv4: 169.254.0.0/16
 * - Private IPv6 ranges:
 *   - Unique Local Addresses (ULA): fc00::/7 (fc00:: to fdff::)
 *   - Link-local: fe80::/10
 */
export const isPrivateIp = (ip: string): boolean => {
  const trimmed = ip.trim();

  // IPv6 loopback
  if (trimmed === '::1') return true;

  // Check IPv4 ranges
  const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const ipv4Match = trimmed.match(ipv4Regex);
  if (ipv4Match) {
    const [, o1, o2, o3, o4] = ipv4Match.map(Number);
    if (o1 > 255 || o2 > 255 || o3 > 255 || o4 > 255) return false;

    // Loopback
    if (o1 === 127) return true;

    // Class A Private
    if (o1 === 10) return true;

    // Class B Private
    if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;

    // Class C Private
    if (o1 === 192 && o2 === 168) return true;

    // Link-local
    if (o1 === 169 && o2 === 254) return true;

    return false;
  }

  // Check IPv6 ranges
  const ipv6Lower = trimmed.toLowerCase();
  
  // Link-local IPv6 (fe80::)
  if (ipv6Lower.startsWith('fe80:')) return true;

  // Unique Local Addresses (fc00:: or fd00::)
  const firstWord = ipv6Lower.split(':')[0];
  if (firstWord.length >= 2) {
    const hex = parseInt(firstWord.substring(0, 2), 16);
    if (!isNaN(hex) && (hex === 0xfc || hex === 0xfd)) {
      return true;
    }
  }

  return false;
};
