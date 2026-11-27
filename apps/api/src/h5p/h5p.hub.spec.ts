import { H5pError } from '@lumieducation/h5p-server';
import type { H5PEditor, IUser } from '@lumieducation/h5p-server';
import { describe, expect, it, vi } from 'vitest';
import { missingLibrariesOf, withLibrariesFromHub } from './h5p.hub.js';

const USER = { id: 'u1' } as IUser;

function missing(libraries: string): H5pError {
  return new H5pError('install-missing-libraries', { libraries }, 400);
}

function editorWith(install: (machineName: string) => Promise<unknown>): {
  editor: H5PEditor;
  installLibraryFromHub: ReturnType<typeof vi.fn>;
} {
  const installLibraryFromHub = vi.fn(install);
  return { editor: { installLibraryFromHub } as unknown as H5PEditor, installLibraryFromHub };
}

describe('missingLibrariesOf', () => {
  it('reads the ubernames out of the replacement', () => {
    expect(missingLibrariesOf(missing('H5P.InfoWall-0.4, H5P.Question-1.5'))).toEqual([
      'H5P.InfoWall-0.4',
      'H5P.Question-1.5',
    ]);
  });

  it('is null for any other error', () => {
    expect(missingLibrariesOf(new H5pError('unable-to-unzip', {}, 400))).toBeNull();
    expect(missingLibrariesOf(new Error('install-missing-libraries'))).toBeNull();
  });
});

describe('withLibrariesFromHub', () => {
  it('does not touch the Hub when the import succeeds', async () => {
    const { editor, installLibraryFromHub } = editorWith(() => Promise.resolve([]));

    await expect(withLibrariesFromHub(editor, USER, () => Promise.resolve('ok'))).resolves.toBe(
      'ok',
    );
    expect(installLibraryFromHub).not.toHaveBeenCalled();
  });

  it('installs each missing content type by machine name and imports again', async () => {
    const { editor, installLibraryFromHub } = editorWith(() => Promise.resolve([]));
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(missing('H5P.InfoWall-0.4, H5P.InfoWall-0.5'))
      .mockResolvedValueOnce('imported');

    await expect(withLibrariesFromHub(editor, USER, operation)).resolves.toBe('imported');
    expect(installLibraryFromHub.mock.calls).toEqual([['H5P.InfoWall', USER]]);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('keeps going past a name the Hub refuses', async () => {
    const { editor, installLibraryFromHub } = editorWith((name) =>
      name === 'H5P.Question'
        ? Promise.reject(new H5pError('hub-install-invalid-content-type', {}, 400))
        : Promise.resolve([]),
    );
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(missing('H5P.Question-1.5, H5P.InfoWall-0.4'))
      .mockResolvedValueOnce('imported');

    await expect(withLibrariesFromHub(editor, USER, operation)).resolves.toBe('imported');
    expect(installLibraryFromHub).toHaveBeenCalledTimes(2);
  });

  it('rethrows the original error when nothing could be installed', async () => {
    const { editor } = editorWith(() => Promise.reject(new Error('Hub unreachable')));
    const error = missing('H5P.InfoWall-0.4');
    const operation = vi.fn<() => Promise<string>>().mockRejectedValue(error);

    await expect(withLibrariesFromHub(editor, USER, operation)).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('lets the second attempt fail when libraries are still missing', async () => {
    const { editor } = editorWith(() => Promise.resolve([]));
    const still = missing('H5P.InfoWall-0.4');
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(missing('H5P.InfoWall-0.4'))
      .mockRejectedValueOnce(still);

    await expect(withLibrariesFromHub(editor, USER, operation)).rejects.toBe(still);
  });

  it('rethrows unrelated errors untouched', async () => {
    const { editor, installLibraryFromHub } = editorWith(() => Promise.resolve([]));
    const error = new H5pError('unable-to-unzip', {}, 400);

    await expect(withLibrariesFromHub(editor, USER, () => Promise.reject(error))).rejects.toBe(
      error,
    );
    expect(installLibraryFromHub).not.toHaveBeenCalled();
  });
});
