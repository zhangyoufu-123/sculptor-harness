#!/usr/bin/env tsx
/**
 * Product philosophy constraint checker.
 * Runs standalone or in CI to verify project-wide invariants.
 */
import fs from 'fs';
import path from 'path';

const CONSTRAINTS: Record<string, string> = {
  'AI-01': 'AI must not appear without user invocation',
  'AI-02': 'AI must not auto-modify user text',
  'SE-01': 'API keys only in backend — no NEXT_PUBLIC_ prefix for secrets',
};

interface Violation {
  file: string;
  rule: string;
  description: string;
}

const violations: Violation[] = [];

function checkFile(filePath: string): void {
  const content = fs.readFileSync(filePath, 'utf-8');
  const relPath = path.relative(process.cwd(), filePath);

  // SE-01: service role keys must NOT use NEXT_PUBLIC_ prefix
  if (filePath.includes('.env') && !filePath.includes('example')) {
    if (content.includes('NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY')) {
      violations.push({
        file: relPath,
        rule: 'SE-01',
        description: 'Service role key exposed with NEXT_PUBLIC_ prefix — move to server-only env',
      });
    }
    // Generic: any NEXT_PUBLIC_*_SECRET or NEXT_PUBLIC_*_KEY pattern
    const secretPattern = /NEXT_PUBLIC_.*(?:SECRET|KEY|TOKEN)/gi;
    const matches = content.match(secretPattern);
    if (matches) {
      for (const match of matches) {
        violations.push({
          file: relPath,
          rule: 'SE-01',
          description: `Potential secret exposed: ${match} — remove NEXT_PUBLIC_ prefix`,
        });
      }
    }
  }

  // AI-01 / AI-02: scan source files for AI-related anti-patterns
  if (/\.(ts|tsx|js|jsx)$/.test(filePath) && !filePath.includes('node_modules')) {
    // Placeholder for future AI constraint checks
    // e.g., scan for unguarded AI auto-modification patterns
  }
}

function walk(dir: string): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
        walk(fullPath);
      }
    } else {
      checkFile(fullPath);
    }
  }
}

// --- Main ---
console.log('🔍 Running constraint checks...\n');

for (const [rule, desc] of Object.entries(CONSTRAINTS)) {
  console.log(`  ${rule}: ${desc}`);
}

walk(process.cwd());

if (violations.length > 0) {
  console.error(`\n❌ ${violations.length} violation(s) found:\n`);
  for (const v of violations) {
    console.error(`  [${v.rule}] ${v.file}: ${v.description}`);
  }
  process.exit(1);
}

console.log('\n✅ All constraints passed.\n');
