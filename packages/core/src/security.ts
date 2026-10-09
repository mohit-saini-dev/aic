export type SecretFinding = {
  rule: string;
  line: number;
  preview: string;
};

const SECRET_RULES: Array<{
  rule: string;
  pattern: RegExp;
}> = [
  {
    rule: "Private key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/
  },
  {
    rule: "OpenAI-style API key",
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/
  },
  {
    rule: "GitHub token",
    pattern: /\b(?:ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9]{20,}\b/
  },
  {
    rule: "AWS access key ID",
    pattern: /\bAKIA[0-9A-Z]{16}\b/
  },
  {
    rule: "Credential assignment",
    pattern: /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["']?[^"' \t]{8,}/i
  }
];

export function scanForSecrets(text: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  const lines = text.split(/\r?\n/);

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];

    for (const rule of SECRET_RULES) {
      if (rule.pattern.test(line)) {
        findings.push({
          rule: rule.rule,
          line: index + 1,
          preview: redactLine(line)
        });
      }
    }
  }

  return findings;
}

function redactLine(line: string): string {
  return line
    .replace(
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
      "[REDACTED PRIVATE KEY]"
    )
    .replace(/\bsk-[A-Za-z0-9_-]{20,}\b/g, "[REDACTED API KEY]")
    .replace(
      /\b(?:ghp_|gho_|ghu_|ghs_|ghr_)[A-Za-z0-9]{20,}\b/g,
      "[REDACTED GITHUB TOKEN]"
    )
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED AWS KEY]")
    .replace(
      /(\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["']?)[^"' \t]{8,}/gi,
      "$1[REDACTED]"
    )
    .slice(0, 200);
}
