export function isTrustedDocument(actual: string, expected: string) {
  try {
    const actualUrl = new URL(actual);
    const expectedUrl = new URL(expected);
    actualUrl.hash = "";
    expectedUrl.hash = "";
    return actualUrl.href === expectedUrl.href;
  } catch {
    return false;
  }
}
