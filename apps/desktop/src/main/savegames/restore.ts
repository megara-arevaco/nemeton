import fs from "node:fs/promises";
import path from "node:path";
import { writeJsonAtomically } from "@launcher/core";
import { z } from "zod";

const journalSchema = z.object({
  committed: z.boolean(),
  directories: z.array(
    z.object({ root: z.string(), stage: z.string(), previous: z.string() }),
  ),
});

export async function recoverRestore(journalPath: string) {
  const raw = await fs
    .readFile(journalPath, "utf8")
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") {
        return null;
      }
      throw error;
    });

  if (!raw) {
    return;
  }

  const journal = journalSchema.parse(JSON.parse(raw));

  for (const entry of journal.directories) {
    if (
      !path.isAbsolute(entry.root) ||
      entry.root === entry.stage ||
      entry.root === entry.previous ||
      path.dirname(entry.root) !== path.dirname(entry.stage) ||
      entry.previous !== `${entry.stage}.previous` ||
      !path.basename(entry.stage).startsWith(".nemeton-restore-")
    ) {
      throw new Error("Registro de restauración no válido");
    }
  }
  for (const entry of [...journal.directories].reverse()) {
    if (!journal.committed && (await fs.stat(entry.previous).catch(() => null))) {
      await fs.rm(entry.root, { recursive: true, force: true });
      await fs.rename(entry.previous, entry.root);
    }
    await fs.rm(entry.stage, { recursive: true, force: true });
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
  await recoverRestore(journalPath);
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
        (await fs.realpath(root)).toLowerCase() !== root.toLowerCase()
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
    await recoverRestore(journalPath);
  } catch (error) {
    if (journalWritten) {
      try {
        await recoverRestore(journalPath);
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
