// The kit's built-in acronym lists, shared by `book-kit validate` and the
// no-bare-acronyms textlint rule so the two can't drift apart. Books extend
// them with lint.acronyms and lint.universal_acronyms in book.config.yml.

// Acronyms that should always be written [ACRONYM]{.smallcaps}.
export const SMALLCAPS_ACRONYMS = [
  'AI', 'API', 'URL', 'PR', 'CI', 'CD', 'HR', 'IC', 'DM', 'PM', 'VP',
  'UI', 'UX', 'RFC', 'ADR', 'OKR', 'REST', 'SSH', 'VPN', 'DNS',
  'HTTP', 'HTTPS', 'CSS', 'HTML', 'PDF', 'EPUB', 'YAML', 'JSON', 'XML',
  'SQL', 'GIF', 'Q&A',
];

// Acronyms readers know without a parenthetical expansion on first use.
export const UNIVERSAL_ACRONYMS = [
  // Titles and roles
  'CEO', 'CTO', 'COO', 'CFO', 'VP', 'IC', 'PM', 'HR', 'EM',
  // Core tech concepts
  'AI', 'API', 'CLI', 'URL', 'PR', 'CI', 'CD', 'UI', 'UX',
  'HTTP', 'HTTPS', 'CSS', 'HTML', 'PDF', 'DNS', 'SSH', 'VPN',
  'JSON', 'YAML', 'XML', 'SQL', 'REST', 'GIF', 'LLM', 'IDE',
  'CPU', 'PC', 'IT', 'README', 'I/O',
  // Common business/communication
  'FYI', 'CC', 'CSV', 'DM', 'ROI', 'FAQ', 'RSVP', 'HQ', 'OKR', 'GDP',
  // Book format
  'EPUB',
  // Globally recognized references
  'US', 'UK', 'EU', 'DC', 'COVID', 'DNA', 'ISO',
  // Software licenses
  'MIT', 'BSD', 'GPL', 'LGPL', 'SaaS', 'GNU',
  // Publishing
  'ISBN',
  // Open source nomenclature
  'OSS', 'FOSS',
  // Expanded in non-parenthetical context
  'DoS', // "denial-of-service" spelled out on same line
  // Time
  'AM', 'PM', 'UTC',
];

// The lists above plus the book's own, from a resolved config.
export function smallcapsAcronyms(config) {
  return [...SMALLCAPS_ACRONYMS, ...(config.lint.acronyms ?? [])];
}

export function universalAcronyms(config) {
  return [...UNIVERSAL_ACRONYMS, ...(config.lint.universal_acronyms ?? [])];
}
