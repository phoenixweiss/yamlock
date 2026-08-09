import {
  closeSync,
  fchmodSync,
  fsyncSync,
  linkSync,
  openSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Writes a file through an exclusive temporary file in the destination
 * directory and atomically installs it at the requested path.
 *
 * @param {string} filePath
 * @param {string} content
 * @param {{mode?: number, refuseExisting?: boolean}} [options]
 */
export function writeFileAtomically(filePath, content, { mode, refuseExisting = false } = {}) {
  const temporaryPath = join(
    dirname(filePath),
    `.${basename(filePath)}.yamlock-${process.pid}-${randomBytes(8).toString('hex')}.tmp`
  );
  let fileDescriptor;

  try {
    fileDescriptor = openSync(temporaryPath, 'wx', 0o600);
    writeFileSync(fileDescriptor, content, 'utf8');
    if (mode !== undefined) {
      fchmodSync(fileDescriptor, mode);
    }
    fsyncSync(fileDescriptor);
    closeSync(fileDescriptor);
    fileDescriptor = undefined;

    if (refuseExisting) {
      linkSync(temporaryPath, filePath);
      unlinkSync(temporaryPath);
      return;
    }

    renameSync(temporaryPath, filePath);
  } catch (error) {
    if (fileDescriptor !== undefined) {
      closeSync(fileDescriptor);
    }

    try {
      unlinkSync(temporaryPath);
    } catch {
      // The temporary file may not exist or may already have been installed.
    }
    throw error;
  }
}
