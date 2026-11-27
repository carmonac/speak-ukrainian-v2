import { Logger } from '@nestjs/common';
import { H5pError, LibraryName } from '@lumieducation/h5p-server';
import type { H5PEditor, IUser } from '@lumieducation/h5p-server';

const logger = new Logger('H5pHub');

/**
 * The `local_id` the library sends with its H5P Hub registration.
 *
 * Without an override `ContentTypeCache` calls `node-machine-id`, which reads
 * `/etc/machine-id` and friends — files a container image need not have, so
 * the read could throw on the first content-type request. The value only has
 * to be stable per site; it identifies nothing about the machine.
 */
export const H5P_HUB_LOCAL_ID = 'speakukrainian';

/**
 * The libraries an `install-missing-libraries` error names, or `null` for any
 * other error.
 *
 * `PackageImporter.processPackage` raises it with a single `libraries`
 * replacement, the missing ubernames joined by `, `.
 */
export function missingLibrariesOf(error: unknown): string[] | null {
  if (!(error instanceof H5pError) || error.errorId !== 'install-missing-libraries') {
    return null;
  }
  const libraries = error.replacements.libraries;
  if (typeof libraries !== 'string' || libraries.trim() === '') {
    return [];
  }
  return libraries
    .split(',')
    .map((name) => name.trim())
    .filter((name) => name !== '');
}

/**
 * Runs a package import and, when the package needs libraries that are neither
 * installed nor included in it, installs them from the H5P Hub and runs the
 * import once more.
 *
 * Packages exported by Moodle, h5p.com and similar platforms often carry only
 * `h5p.json` and `content/`: those platforms fetch the content type from the
 * Hub themselves, and authors cannot be expected to know the difference.
 *
 * Only machine names are asked of the Hub, which always serves the latest
 * version of a content type together with every library it depends on. A
 * missing name the Hub does not list (a dependency rather than a content type,
 * or a type that is not on the Hub at all) is skipped: installing the content
 * type that needs it usually brings it along. Whatever is still missing after
 * that makes the second attempt fail with the same error, which then names the
 * libraries.
 *
 * `operation` must be safe to repeat: both callers re-read a package file that
 * is still on disk.
 */
export async function withLibrariesFromHub<T>(
  editor: H5PEditor,
  user: IUser,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const missing = missingLibrariesOf(error);
    if (!missing?.length) {
      throw error;
    }

    const installed = await installFromHub(editor, user, missing);
    if (installed === 0) {
      throw error;
    }
    return operation();
  }
}

/** Installs each distinct machine name from the Hub; returns how many installs succeeded. */
async function installFromHub(
  editor: H5PEditor,
  user: IUser,
  ubernames: string[],
): Promise<number> {
  const machineNames = [...new Set(ubernames.map(machineNameOf))];
  let installed = 0;

  // One at a time: each install writes many objects, and two content types
  // usually share dependencies, which the library's per-library lock would
  // otherwise serialise anyway.
  for (const machineName of machineNames) {
    try {
      await editor.installLibraryFromHub(machineName, user);
      installed += 1;
      logger.log(`Installed ${machineName} from the H5P Hub for a package that lacked it.`);
    } catch (error) {
      logger.warn(
        `Could not install ${machineName} from the H5P Hub: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  return installed;
}

function machineNameOf(ubername: string): string {
  try {
    return LibraryName.fromUberName(ubername).machineName;
  } catch {
    // Not an ubername after all; the Hub will refuse it by name.
    return ubername.split('-')[0] ?? ubername;
  }
}
