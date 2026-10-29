import { NextResponse } from 'next/server';
import os from 'node:os';

export async function GET(req: Request) {
  const ifaces = os.networkInterfaces();
  const addresses: string[] = [];

  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }

  const hostHeader = req.headers.get('host') || 'localhost:3000';
  const proto = req.headers.get('x-forwarded-proto') || 'http';
  const port = hostHeader.includes(':')
    ? hostHeader.split(':')[1]
    : proto === 'https'
    ? '443'
    : '80';

  // Prefer standard local Wi-Fi / LAN subnets over link-local (169.254.x.x) or virtual bridges
  const routableIps = addresses.filter(
    (ip) => !ip.startsWith('169.254.') && !ip.startsWith('127.')
  );
  const primaryIp =
    routableIps.find((ip) => ip.startsWith('192.168.')) ||
    routableIps.find((ip) => ip.startsWith('10.')) ||
    routableIps.find((ip) => /^172\.(1[6-9]|2\d|3[01])\./.test(ip)) ||
    routableIps[0] ||
    addresses[0] ||
    '127.0.0.1';

  const networkOrigin = `${proto}://${primaryIp}${port !== '80' && port !== '443' ? `:${port}` : ''}`;

  return NextResponse.json({
    primaryIp,
    availableIps: addresses,
    port,
    networkOrigin,
    hostHeader,
  });
}
