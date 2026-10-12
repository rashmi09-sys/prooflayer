// Output sanitizing applied to every captured log before it is stored or
// shown. Captured output is untrusted: it may contain secrets, terminal
// escape codes, or text written to manipulate an AI reader.

// eslint-disable-next-line no-control-regex -- stripping terminal escapes is the point
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]|\u001b\][^\u0007]*(\u0007|\u001b\\)/g;
// Control characters except \t \n \r.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

const PATTERNS: Array<[RegExp, string]> = [
  [/\bsk-ant-[A-Za-z0-9_-]{10,}/g, "[REDACTED:anthropic-key]"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}/g, "[REDACTED:github-token]"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, "[REDACTED:github-token]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED:aws-key]"],
  [/\b(eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/g, "[REDACTED:jwt]"],
  [/(authorization:\s*(bearer|token|basic)\s+)[^\s"']+/gi, "$1[REDACTED]"],
  [/(https?:\/\/)[^\s/:@]+:[^\s/@]+@/gi, "$1[REDACTED]@"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED:private-key]"],
  [
    /\b([A-Z0-9_]*(SECRET|TOKEN|PASSWORD|API_KEY|PRIVATE_KEY)[A-Z0-9_]*)\s*=\s*("[^"]*"|'[^']*'|[^\s]+)/g,
    "$1=[REDACTED]",
  ],
];

/** Remove terminal escapes and redact known secret shapes plus exact values. */
export function sanitize(text: string, knownSecrets: string[] = []): string {
  let out = text.replace(ANSI, "").replace(CONTROL, "").replace(/\r\n?/g, "\n");
  for (const secret of knownSecrets) {
    if (secret && secret.length >= 8) out = out.split(secret).join("[REDACTED]");
  }
  for (const [re, rep] of PATTERNS) out = out.replace(re, rep);
  return out;
}

export interface LimitedOutput {
  text: string;
  truncated: boolean;
}

/**
 * Keep the head and tail of long output. Errors usually appear at the end,
 * context at the start, so both are preserved around a visible marker.
 */
export function limitOutput(text: string, maxChars = 64_000, headChars = 12_000): LimitedOutput {
  if (text.length <= maxChars) return { text, truncated: false };
  const tailChars = maxChars - headChars;
  const omitted = text.length - headChars - tailChars;
  return {
    text:
      text.slice(0, headChars) +
      `\n\n… [ProofLayer omitted ${omitted.toLocaleString("en-US")} characters of output] …\n\n` +
      text.slice(text.length - tailChars),
    truncated: true,
  };
}
