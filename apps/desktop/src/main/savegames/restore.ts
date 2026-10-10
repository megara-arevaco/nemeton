import fs from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomically } from "@launcher/core";
import { z } from "zod";

const journalSchema = z
  .object({
    committed: z.boolean(),
    directories: z
      .array(
        z
          .object({ root: z.string(), stage: z.string(), previous: z.string() })
          .strict(),
      )
      .min(1)
      .max(1000),
  })
  .strict();

const pathKey = (value: string) =>
  process.platform === "win32" ? value.toLocaleLowerCase("en-US") : value;

async function existingDirectory(filePath: string) {
  const info = await fs.lstat(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  });

  if (info && (!info.isDirectory() || info.isSymbolicLink())) {
    throw new Error(
      "El registro de restauración apunta a una ruta que no es un directorio seguro",
    );
  }
  return info;
}

export async function recoverRestore(
  journalPath: string,
  onReady?: () => void,
  allowedRoots: string[] = [],
) {
  const journalInfo = await fs
    .lstat(journalPath)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    });

  if (!journalInfo) {
    onReady?.();
    return;
  }
  if (
    !journalInfo.isFile() ||
    journalInfo.isSymbolicLink() ||
    journalInfo.size > 1024 * 1024
  ) {
    throw new Error("El registro de restauración no es un archivo seguro");
  }

  const raw = await fs.readFile(journalPath, "utf8");

  if (!raw) {
    onReady?.();
    return;
  }

  const journal = journalSchema.parse(JSON.parse(raw));

  const allowed = new Set(allowedRoots.map((root) => pathKey(path.resolve(root))));
  const roots = new Set<string>();

  for (const entry of journal.directories) {
    const root = path.resolve(entry.root);
    const stage = path.resolve(entry.stage);
    const parent = path.dirname(root);
    const stageName = path.basename(stage);
    const key = pathKey(root);

    if (
      !path.isAbsolute(entry.root) ||
      root !== entry.root ||
      !allowed.has(key) ||
      roots.has(key) ||
      root === stage ||
      root === path.resolve(entry.previous) ||
      pathKey(path.dirname(stage)) !== pathKey(parent) ||
      pathKey(path.dirname(path.resolve(entry.previous))) !== pathKey(parent) ||
      pathKey(path.resolve(entry.previous)) !== pathKey(`${stage}.previous`) ||
      !/^\.nemeton-restore-[a-zA-Z0-9_-]{6,}$/.test(stageName)
    ) {
      throw new Error(
        "Registro de restauración no válido o ajeno a las carpetas configuradas",
      );
    }
    roots.add(key);

    const realParent = await fs.realpath(parent);

    if (pathKey(realParent) !== pathKey(parent)) {
      throw new Error("La recuperación rechazó un padre con enlace simbólico");
    }

    const [rootInfo, stageInfo, previousInfo, discardedInfo] = await Promise.all([
      existingDirectory(root),
      existingDirectory(stage),
      existingDirectory(`${stage}.previous`),
      existingDirectory(`${stage}.discarded`),
    ]);

    if (journal.committed && !rootInfo) {
      throw new Error(
        "La recuperación comprometida no encuentra el directorio restaurado",
      );
    }
    if (!journal.committed && !rootInfo && !previousInfo) {
      throw new Error("No hay directorio actual ni copia previa para recuperar");
    }
    if (stageInfo && previousInfo && discardedInfo) {
      throw new Error("La recuperación encontró demasiadas copias temporales");
    }
  }
  if (!journal.committed) {
    for (const entry of [...journal.directories].reverse()) {
      if (await existingDirectory(entry.previous)) {
        const discarded = `${entry.stage}.discarded`;
        const rootExists = await fs.lstat(entry.root).catch(() => null);

        if (rootExists) {
          if (await fs.lstat(discarded).catch(() => null)) {
            throw new Error("La recuperación encontró dos copias temporales");
          }
          await fs.rename(entry.root, discarded);
        }
        try {
          await fs.rename(entry.previous, entry.root);
        } catch (error) {
          if (rootExists) {
            await fs.rename(discarded, entry.root);
          }
          throw error;
        }
      }
    }
  }
  onReady?.();
  for (const entry of [...journal.directories].reverse()) {
    await fs.rm(entry.stage, { recursive: true, force: true });
    await fs.rm(`${entry.stage}.discarded`, { recursive: true, force: true });
    if (journal.committed) {
      await fs.rm(entry.previous, { recursive: true, force: true });
    }
  }
  await fs.rm(journalPath, { force: true });
}

/** Prepare and validate every byte before swapping directories. Keep a recovery journal. */
export async function restoreDirectories(
  roots: string[],
  exact: boolean,
  journalPath: string,
  populate: (stages: string[]) => Promise<void>,
) {
  await recoverRestore(journalPath, undefined, roots);
  const directories: Array<{ root: string; stage: string; previous: string }> = [];
  let journalWritten = false;

  try {
    const normalized = roots.map((root) => path.resolve(root));

    if (
      normalized.some((root, index) =>
        normalized.some(
          (other, otherIndex) =>
            index !== otherIndex &&
            (root === other || root.startsWith(`${other}${path.sep}`)),
        ),
      )
    ) {
      throw new Error("Las carpetas de partidas no pueden solaparse");
    }
    for (const root of normalized) {
      const info = await fs.lstat(root);

      if (
        !info.isDirectory() ||
        info.isSymbolicLink() ||
        pathKey(await fs.realpath(root)) !== pathKey(root)
      ) {
        throw new Error(
          "La carpeta de partidas debe ser un directorio local sin enlaces",
        );
      }

      const stage = await fs.mkdtemp(
        path.join(path.dirname(root), ".nemeton-restore-"),
      );
      directories.push({ root, stage, previous: `${stage}.previous` });
      if (!exact) {
        await fs.cp(root, stage, {
          recursive: true,
          filter: async (source) => {
            if ((await fs.lstat(source)).isSymbolicLink()) {
              throw new Error("No se restauran partidas sobre enlaces simbólicos");
            }
            return true;
          },
        });
      }
    }
    await populate(directories.map((entry) => entry.stage));
    await writeJsonAtomically(journalPath, { committed: false, directories });
    journalWritten = true;
    for (const entry of directories) {
      await fs.rename(entry.root, entry.previous);
      await fs.rename(entry.stage, entry.root);
    }
    await writeJsonAtomically(journalPath, { committed: true, directories });
    await recoverRestore(journalPath, undefined, roots);
  } catch (error) {
    if (journalWritten) {
      try {
        await recoverRestore(journalPath, undefined, roots);
      } catch (recoveryError) {
        throw new AggregateError(
          [error, recoveryError],
          "No se completó la restauración; se conserva la copia de recuperación",
        );
      }
    }
    throw error;
  } finally {
    if (!journalWritten) {
      for (const entry of directories) {
        await fs.rm(entry.stage, { recursive: true, force: true });
      }
    }
  }
}
