export function toWindowsPath(input: string) {
  const match = /^\/mnt\/([a-z])\/(.*)$/i.exec(input);

  if (!match) {
    return input;
  }

  return `${match[1]!.toUpperCase()}:\\${match[2]!.replaceAll("/", "\\")}`;
}

export function toLocalPath(input: string) {
  const normalized = input.trim();
  const match = /^([a-z]):[\\/](.*)$/i.exec(normalized);

  if (process.platform === "win32" || !process.env.WSL_DISTRO_NAME || !match) {
    return normalized;
  }

  return `/mnt/${match[1]!.toLowerCase()}/${match[2]!.replaceAll("\\", "/")}`;
}

export function toLinuxPath(input: string) {
  return toLocalPath(input);
}
