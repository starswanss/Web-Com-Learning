import { google } from 'googleapis';
import { Readable } from 'stream';

function getDriveClient() {
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_DRIVE_CLIENT_ID,
    process.env.GOOGLE_DRIVE_CLIENT_SECRET
  );
  auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
  return google.drive({ version: 'v3', auth });
}

async function getOrCreateFolder(name: string, parentId?: string): Promise<string> {
  const drive = getDriveClient();
  const q = [
    `name = '${name}'`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `trashed = false`,
    parentId ? `'${parentId}' in parents` : '',
  ]
    .filter(Boolean)
    .join(' and ');

  const res = await drive.files.list({ q, fields: 'files(id)', pageSize: 1 });
  if (res.data.files?.length) return res.data.files[0].id!;

  const created = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: parentId ? [parentId] : [],
    },
    fields: 'id',
  });
  return created.data.id!;
}

/** Returns current Thai academic year (พ.ศ.) e.g. 2568 */
function currentThaiYear(): number {
  return new Date().getFullYear() + 543;
}

/** Get or create the year folder under root: "ปีการศึกษา 2568" */
export async function ensureYearFolder(year?: number): Promise<string> {
  const root = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  const y = year ?? currentThaiYear();
  return getOrCreateFolder(`ปีการศึกษา ${y}`, root);
}

export async function ensureClassFolders(classId: string, yearFolderId?: string): Promise<{
  assignmentsId: string;
  submissionsId: string;
}> {
  const parent = yearFolderId ?? await ensureYearFolder();
  const classFolder = await getOrCreateFolder(classId, parent);
  const assignmentsId = await getOrCreateFolder('Assignments', classFolder);
  const submissionsId = await getOrCreateFolder('Submissions', classFolder);
  return { assignmentsId, submissionsId };
}

export async function ensureStudentFolder(classId: string, studentName: string): Promise<string> {
  const { submissionsId } = await ensureClassFolders(classId);
  return getOrCreateFolder(studentName, submissionsId);
}

export async function uploadFileToDrive(
  folderId: string,
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<{ fileId: string; webViewLink: string }> {
  const drive = getDriveClient();
  const stream = Readable.from(buffer);

  const res = await drive.files.create({
    requestBody: { name: filename, parents: [folderId] },
    media: { mimeType, body: stream },
    fields: 'id, webViewLink',
  });

  await drive.permissions.create({
    fileId: res.data.id!,
    requestBody: { role: 'reader', type: 'anyone' },
  });

  return { fileId: res.data.id!, webViewLink: res.data.webViewLink! };
}

export async function uploadAssignmentFile(
  classId: string,
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<{ fileId: string; webViewLink: string }> {
  const { assignmentsId } = await ensureClassFolders(classId);
  return uploadFileToDrive(assignmentsId, buffer, mimeType, filename);
}

/** Get or create Root > LMS Media > {subfolder} */
export async function ensureMediaFolder(subfolder: 'Icons' | 'PDFs'): Promise<string> {
  const root = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID!;
  const mediaFolder = await getOrCreateFolder('LMS Media', root);
  return getOrCreateFolder(subfolder, mediaFolder);
}
