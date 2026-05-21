import {
  ensureMediaFolder,
  uploadFileToDrive,
  uploadAssignmentFile,
  ensureStudentFolder,
} from './google-drive';

function driveViewUrl(fileId: string, mimeType: string): string {
  if (mimeType === 'application/pdf')
    return `https://drive.google.com/file/d/${fileId}/preview`;
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`;
}

export async function uploadToStorage(
  folder: string,
  buffer: Buffer,
  mimeType: string,
  originalFilename: string
): Promise<{ url: string; storagePath: string }> {
  const subfolder = mimeType === 'application/pdf' ? 'PDFs' : 'Icons';
  const folderId = await ensureMediaFolder(subfolder);
  const ext = originalFilename.split('.').pop()?.toLowerCase() ?? 'bin';
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { fileId } = await uploadFileToDrive(folderId, buffer, mimeType, filename);
  return { url: driveViewUrl(fileId, mimeType), storagePath: fileId };
}

export async function uploadAssignmentAttachment(
  classId: string,
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<{ url: string; storagePath: string }> {
  const { fileId } = await uploadAssignmentFile(classId, buffer, mimeType, filename);
  return { url: driveViewUrl(fileId, mimeType), storagePath: fileId };
}

export async function uploadSubmissionFile(
  classId: string,
  studentName: string,
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<{ url: string; storagePath: string }> {
  const folderId = await ensureStudentFolder(classId, studentName);
  const { fileId } = await uploadFileToDrive(folderId, buffer, mimeType, filename);
  return { url: driveViewUrl(fileId, mimeType), storagePath: fileId };
}
