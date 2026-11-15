const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(input: string): string {
  let result = '';
  for (let i = 0; i < input.length; i += 3) {
    const a = input.charCodeAt(i);
    const b = input.charCodeAt(i + 1);
    const c = input.charCodeAt(i + 2);
    const hasB = i + 1 < input.length;
    const hasC = i + 2 < input.length;
    result += CHARS[a >> 2];
    result += CHARS[((a & 3) << 4) | (hasB ? b >> 4 : 0)];
    result += hasB ? CHARS[((b & 15) << 2) | (hasC ? c >> 6 : 0)] : '=';
    result += hasC ? CHARS[c & 63] : '=';
  }
  return result;
}
