import { adminStorage } from './firebase/admin';

/**
 * Upload a file buffer to Firebase Storage.
 * Returns a public URL and the storage path.
 * Folder structure: lms/{folder}/{timestamp}-{random}.{ext}
 */
export async function uploadToStorage(
  folder: string,
  buffer: Buffer,
  mimeType: string,
  originalFilename: string
): Promise<{ url: string; storagePath: string }> {
  const ext = originalFilename.split('.').pop()?.toLowerCase() ?? 'bin';
  const randomPart = Math.random().toString(36).slice(2, 8);
  const filename = `${Date.now()}-${randomPart}.${ext}`;
  const storagePath = `lms/${folder}/${filename}`;

  const bucket = adminStorage.bucket();
  const fileRef = bucket.file(storagePath);

  await fileRef.save(buffer, {
    contentType: mimeType,
    metadata: { originalName: originalFilename },
  });

  await fileRef.makePublic();

  const url = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;
  return { url, storagePath };
}

/** Upload an assignment attachment file */
export async function uploadAssignmentAttachment(
  classId: string,
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<{ url: string; storagePath: string }> {
  const safeClass = classId.replace(/[^a-zA-Z0-9ก-๙]/g, '_');
  return uploadToStorage(`assignments/${safeClass}`, buffer, mimeType, filename);
}

/** Upload a student submission file */
export async function uploadSubmissionFile(
  classId: string,
  studentName: string,
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<{ url: string; storagePath: string }> {
  const safeClass = classId.replace(/[^a-zA-Z0-9ก-๙]/g, '_');
  const safeName = studentName.replace(/[^a-zA-Z0-9ก-๙]/g, '_');
  return uploadToStorage(`submissions/${safeClass}/${safeName}`, buffer, mimeType, filename);
}
